import { TileGrid } from '../data/TileGrid';
import { BuildingRegistry } from '../data/BuildingRegistry';
import {
  ConnectionRegistry,
  type SerializedConnectionRegistry,
  oppositeSide,
  unitVector,
  worldSideOf,
  worldTileOf,
} from '../data/ConnectionRegistry';
import {
  getBuildingType,
  isBeltTypeId,
  validateCatalog,
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
} from '../data/buildingCatalog';
import { Viewport } from './Viewport';
import type { ViewportSnapshot, VisibleTileRange } from './Viewport';
import {
  Direction,
  PortKind,
  ResourceType,
  TileType as TileTypeConst,
  type Building,
  type BuildingId,
  type BuildingTypeId,
  type Connection,
  type ConnectionId,
  type ConnectionResult,
  type EnergyGlobalStats,
  type PendingEndpoint,
  type PlacementResult,
  type PlaceBeltResult,
  type PowerState,
  type Port,
  type PortId,
  type EnergyNetworkBalance,
  type ResourceType as ResourceTypeT,
  type TileCoord,
  type TileType,
} from '../types';
import { DEFAULT_MAP_SEED } from '../constants';
import { isInBounds, toIndex } from '../data/coords';
import { screenToGrid } from './CoordinateTransform';
import { generateResources } from '../data/ResourceGenerator';
import { planBelt } from './BeltRouter';
import { EnergyNetwork } from '../systems/EnergyNetwork';
import { getDaylightFactor } from '../renderer/DayNightOverlayRenderer';
import { SOLAR_PANEL_BUILDING_TYPE_ID } from '../data/buildingCatalog';

interface PortEndpoint {
  readonly building: BuildingId;
  readonly port: PortId;
}

interface ResolvedPort {
  readonly building: Building;
  readonly port: Port;
}

export type GameEngineChangeKind = 'world' | 'viewport';

export interface ResourceStock {
  coal: number;
  ironOre: number;
  copperOre: number;
}

export interface SerializedGameWorld {
  readonly version: number;
  readonly mapSeed: number;
  readonly grid: ArrayBuffer;
  readonly buildings: ReturnType<BuildingRegistry['serialize']>;
  readonly connections: SerializedConnectionRegistry;
  readonly energyLinks?: readonly { readonly a: BuildingId; readonly b: BuildingId }[];
  readonly playerStock?: ResourceStock;
  readonly simulationTime?: number;
  readonly batteryCharges?: readonly { readonly id: BuildingId; readonly charge: number }[];
}

interface GameEngineOptions {
  readonly grid?: TileGrid;
  readonly buildings?: BuildingRegistry;
  readonly connections?: ConnectionRegistry;
  readonly mapSeed?: number;
  readonly dayNightCycleSeconds?: number;
}

const SERIALIZE_VERSION = 2;

interface BatteryBuildingRef {
  readonly id: BuildingId;
  readonly charge: number;
  readonly capacity: number;
  readonly chargeRate: number;
  readonly dischargeRate: number;
}

export class GameEngine {
  private static readonly EXTRACTION_INTERVAL_S = 60 / EXTRACTOR_RATE_PER_MIN;

  readonly grid: TileGrid;
  readonly viewport: Viewport;
  readonly buildings: BuildingRegistry;
  readonly connections: ConnectionRegistry;
  readonly energyNetwork: EnergyNetwork;
  readonly dayNightCycleSeconds: number;
  simulationTime = 0;
  mapSeed: number;
  readonly playerStock: ResourceStock = { coal: 0, ironOre: 0, copperOre: 0 };
  readonly batteryCharges = new Map<BuildingId, number>();
  private readonly listeners = new Set<(kind: GameEngineChangeKind) => void>();
  private extractionAccumulator = 0;

  constructor(screenWidth: number, screenHeight: number, options: GameEngineOptions = {}) {
    validateCatalog();
    this.grid = options.grid ?? new TileGrid();
    this.grid.setOnChange(() => this.notify('world'));
    this.viewport = new Viewport(screenWidth, screenHeight, () => this.notify('viewport'));
    this.buildings = options.buildings ?? new BuildingRegistry();
    this.connections = options.connections ?? new ConnectionRegistry();
    this.energyNetwork = new EnergyNetwork();
    this.mapSeed = options.mapSeed ?? DEFAULT_MAP_SEED;
    this.dayNightCycleSeconds =
      options.dayNightCycleSeconds && options.dayNightCycleSeconds > 0
        ? options.dayNightCycleSeconds
        : 120;
  }

  setSimulationTime(value: number): void {
    this.simulationTime = ((value % 1) + 1) % 1;
  }

  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;

    // Day/night cycle
    const cycleSeconds = this.dayNightCycleSeconds;
    if (Number.isFinite(cycleSeconds) && cycleSeconds > 0) {
      const next = this.simulationTime + dt / cycleSeconds;
      this.simulationTime = ((next % 1) + 1) % 1;
    }

    // Resource extraction
    this.extractionAccumulator += dt;
    if (this.extractionAccumulator >= GameEngine.EXTRACTION_INTERVAL_S) {
      this.extractionAccumulator -= GameEngine.EXTRACTION_INTERVAL_S;
      this.processExtraction();
    }

    // Battery charge/discharge
    this.updateBatteries(dt);
  }

  private processExtraction(): void {
    let changed = false;
    for (const [id, building] of this.buildings.getAll().entries()) {
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;
      if (this.getBuildingPowerState(id) !== 'powered') continue;
      const { x, y } = building.origin;
      const idx = toIndex(x, y);
      const resourceType = this.grid.resourceType[idx];
      if (resourceType === ResourceType.None) continue;
      if (resourceType === ResourceType.Coal) this.playerStock.coal++;
      else if (resourceType === ResourceType.IronOre) this.playerStock.ironOre++;
      else if (resourceType === ResourceType.CopperOre) this.playerStock.copperOre++;
      this.grid.markDirty(x, y);
      changed = true;
    }
    if (changed) {
      this.notify('world');
    }
  }

  private collectBatteries(buildingIds: readonly BuildingId[]): BatteryBuildingRef[] {
    const refs: BatteryBuildingRef[] = [];
    for (const id of buildingIds) {
      const charge = this.batteryCharges.get(id);
      if (charge === undefined) continue;
      const building = this.buildings.get(id);
      if (!building) continue;
      const battery = getBuildingType(building.typeId)?.energy?.battery;
      if (!battery) continue;
      refs.push({
        id,
        charge,
        capacity: battery.capacity,
        chargeRate: battery.chargeRate,
        dischargeRate: battery.dischargeRate,
      });
    }
    return refs;
  }

  getEnergyStorageTotals(): { stored: number; capacity: number } {
    let stored = 0;
    let capacity = 0;
    for (const ref of this.collectBatteries(Array.from(this.batteryCharges.keys()))) {
      stored += ref.charge;
      capacity += ref.capacity;
    }
    return { stored, capacity };
  }

  private updateBatteries(dt: number): void {
    if (this.batteryCharges.size === 0) return;

    // 1 day-night cycle = 1 sim-hour. Catalog values (kW, kWh) scale with cycle length.
    const dtHours = dt / this.dayNightCycleSeconds;
    for (const network of this.getEnergyNetworkBalances()) {
      const netPower = network.remaining;
      const batteries = this.collectBatteries(network.buildingIds);
      if (batteries.length === 0) continue;

      if (netPower > 0) {
        this.distributeBatteryCharge(batteries, netPower, dtHours);
      } else if (netPower < 0) {
        this.distributeBatteryDischarge(batteries, -netPower, dtHours);
      }
    }
  }

  private distributeBatteryCharge(
    batteries: readonly BatteryBuildingRef[],
    surplus: number,
    dtHours: number,
  ): void {
    let totalAcceptable = 0;
    const acceptable: number[] = [];
    for (const bat of batteries) {
      const maxByRate = bat.chargeRate * dtHours;
      const maxByCapacity = bat.capacity - bat.charge;
      const canAccept = Math.max(0, Math.min(maxByRate, maxByCapacity));
      acceptable.push(canAccept);
      totalAcceptable += canAccept;
    }
    if (totalAcceptable <= 0) return;

    const totalEnergy = Math.min(surplus * dtHours, totalAcceptable);
    for (let i = 0; i < batteries.length; i++) {
      if (acceptable[i] <= 0) continue;
      const share = (acceptable[i] / totalAcceptable) * totalEnergy;
      const current = this.batteryCharges.get(batteries[i].id) ?? 0;
      this.batteryCharges.set(batteries[i].id, Math.min(current + share, batteries[i].capacity));
    }
  }

  private distributeBatteryDischarge(
    batteries: readonly BatteryBuildingRef[],
    deficit: number,
    dtHours: number,
  ): void {
    let totalProvidable = 0;
    const providable: number[] = [];
    for (const bat of batteries) {
      const maxByRate = bat.dischargeRate * dtHours;
      const canProvide = Math.max(0, Math.min(maxByRate, bat.charge));
      providable.push(canProvide);
      totalProvidable += canProvide;
    }
    if (totalProvidable <= 0) return;

    const totalEnergy = Math.min(deficit * dtHours, totalProvidable);
    for (let i = 0; i < batteries.length; i++) {
      if (providable[i] <= 0) continue;
      const share = (providable[i] / totalProvidable) * totalEnergy;
      const current = this.batteryCharges.get(batteries[i].id) ?? 0;
      this.batteryCharges.set(batteries[i].id, Math.max(current - share, 0));
    }
  }

  placeTile(x: number, y: number, type: TileType): boolean {
    if (!isInBounds(x, y)) return false;
    this.grid.setType(x, y, type);
    return true;
  }

  getTileAt(x: number, y: number): TileType {
    return this.grid.getType(x, y);
  }

  canPlaceBuilding(
    typeId: BuildingTypeId,
    origin: TileCoord,
    // rotation reserved for future directional footprints; currently a no-op
    _rotation: Direction = Direction.North,
  ): PlacementResult {
    const type = getBuildingType(typeId);
    if (!type) return { ok: false, reason: 'unknown_type' };
    if (!this.buildings.hasIdCapacity()) return { ok: false, reason: 'id_overflow' };

    for (const { x, y, inBounds, idx } of this.buildings.footprintTiles(origin, type.footprint)) {
      if (!inBounds) return { ok: false, reason: 'out_of_bounds' };
      if (this.buildings.occupantIdAt(idx) !== 0) {
        return { ok: false, reason: 'tile_occupied' };
      }
      if (!type.allowedTiles.includes(this.grid.getType(x, y))) {
        return { ok: false, reason: 'tile_type_invalid' };
      }
      if (type.requiresResourceDeposit && (this.grid.getResource(x, y) === ResourceType.None || this.grid.getResourceAmount(x, y) === 0)) {
        return { ok: false, reason: 'resource_required' };
      }
      if (type.forbidsResourceDeposit && this.grid.getResource(x, y) !== ResourceType.None && this.grid.getResourceAmount(x, y) > 0) {
        return { ok: false, reason: 'resource_forbidden' };
      }
    }
    return { ok: true };
  }

  placeBuilding(
    typeId: BuildingTypeId,
    origin: TileCoord,
    rotation: Direction = Direction.North,
  ): BuildingId | null {
    const result = this.canPlaceBuilding(typeId, origin, rotation);
    if (!result.ok) return null;

    const type = getBuildingType(typeId)!;
    const id = this.buildings.register({ typeId, origin, rotation }, type.footprint);
    if (id !== null) {
      this.energyNetwork.registerBuilding(id);
      if (type.energy?.battery) {
        this.batteryCharges.set(id, 0);
      }
      this.notify('world');
    }
    return id;
  }

  removeBuilding(id: BuildingId): boolean {
    return this.removeBuildingInternal(id, true);
  }

  private removeBuildingInternal(id: BuildingId, cascadeBelts: boolean): boolean {
    const building = this.buildings.get(id);
    if (!building) return false;
    const type = getBuildingType(building.typeId);
    if (!type) return false;

    if (cascadeBelts) {
      const connectedBeltIds = new Set<BuildingId>();
      for (const connection of this.getConnectionsOf(id)) {
        const neighborId = this.otherEndpointBuilding(connection, id);
        if (neighborId === null) continue;
        const neighbor = this.buildings.get(neighborId);
        if (!neighbor || !isBeltTypeId(neighbor.typeId)) continue;
        connectedBeltIds.add(neighborId);
      }

      for (const beltId of connectedBeltIds) {
        this.removeBelt(beltId);
      }
    }

    this.connections.unregisterAllFor(id);
    this.energyNetwork.unregisterBuilding(id);
    this.batteryCharges.delete(id);
    const removed = this.buildings.unregister(id, type.footprint);
    if (removed) {
      this.notify('world');
    }
    return removed;
  }

  connectBuildings(a: BuildingId, b: BuildingId): boolean {
    const buildingA = this.buildings.get(a);
    const buildingB = this.buildings.get(b);
    if (!buildingA || !buildingB) return false;
    if (!this.isEnergyLinkableBuilding(buildingA.typeId) || !this.isEnergyLinkableBuilding(buildingB.typeId)) {
      return false;
    }
    const connected = this.energyNetwork.connect(a, b);
    if (connected) {
      this.notify('world');
    }
    return connected;
  }

  disconnectBuildings(a: BuildingId, b: BuildingId): boolean {
    if (!this.buildings.get(a) || !this.buildings.get(b)) return false;
    const disconnected = this.energyNetwork.disconnect(a, b);
    if (disconnected) {
      this.notify('world');
    }
    return disconnected;
  }

  areBuildingsEnergyLinked(a: BuildingId, b: BuildingId): boolean {
    if (!this.buildings.get(a) || !this.buildings.get(b)) return false;
    return this.energyNetwork.isConnected(a, b);
  }

  getEnergyNetworkForBuilding(buildingId: BuildingId): EnergyNetworkBalance | null {
    if (!this.buildings.get(buildingId)) return null;
    const component = this.energyNetwork.getComponentFor(buildingId);
    if (component.length === 0) return null;
    return this.computeEnergyBalance(component);
  }

  getEnergyNetworkBalances(): readonly EnergyNetworkBalance[] {
    return this.energyNetwork.getComponents().map((component) => this.computeEnergyBalance(component));
  }

  getEnergyLinkedBuildings(buildingId: BuildingId): readonly BuildingId[] {
    if (!this.buildings.get(buildingId)) return [];
    return this.energyNetwork.getNeighbors(buildingId);
  }

  getBuildingPowerState(buildingId: BuildingId): PowerState {
    const building = this.buildings.get(buildingId);
    if (!building) return 'neutral';
    const type = getBuildingType(building.typeId);
    if (!type?.energy?.consumption || type.energy.consumption <= 0) {
      return 'neutral';
    }

    const network = this.getEnergyNetworkForBuilding(buildingId);
    if (!network) return 'unpowered';
    if (network.remaining >= 0) return 'powered';
    const dischargeAvailable = this.getNetworkDischargeRate(network.buildingIds);
    return dischargeAvailable >= -network.remaining ? 'powered' : 'unpowered';
  }

  private getNetworkDischargeRate(buildingIds: readonly BuildingId[]): number {
    let total = 0;
    for (const id of buildingIds) {
      const charge = this.batteryCharges.get(id);
      if (charge === undefined || charge <= 0) continue;
      const building = this.buildings.get(id);
      if (!building) continue;
      const type = getBuildingType(building.typeId);
      total += type?.energy?.battery?.dischargeRate ?? 0;
    }
    return total;
  }

  getEnergyGlobalStats(): EnergyGlobalStats {
    let production = 0;
    let consumption = 0;
    let demandedConsumption = 0;
    let onlineConsumers = 0;
    let offlineConsumers = 0;

    for (const network of this.getEnergyNetworkBalances()) {
      production += network.production;
      demandedConsumption += network.consumption;
      const dischargeAvailable = this.getNetworkDischargeRate(network.buildingIds);
      const networkIsPowered = network.remaining >= 0 || dischargeAvailable >= -network.remaining;
      if (networkIsPowered) {
        consumption += network.consumption;
      }
      for (const buildingId of network.buildingIds) {
        const building = this.buildings.get(buildingId);
        if (!building) continue;
        const buildingType = getBuildingType(building.typeId);
        const machineConsumption = buildingType?.energy?.consumption ?? 0;
        if (machineConsumption <= 0) continue;
        if (networkIsPowered) {
          onlineConsumers += 1;
        } else {
          offlineConsumers += 1;
        }
      }
    }

    return {
      production,
      consumption,
      // "remaining" is the net electrical balance against total demand.
      remaining: production - demandedConsumption,
      onlineConsumers,
      offlineConsumers,
    };
  }

  getResourceCounts(): ResourceStock {
    return { ...this.playerStock };
  }

  getResourceRates(): { coal: number; ironOre: number; copperOre: number } {
    let coal = 0, ironOre = 0, copperOre = 0;
    for (const [id, building] of this.buildings.getAll().entries()) {
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;
      if (this.getBuildingPowerState(id) !== 'powered') continue;
      const resource = this.grid.getResource(building.origin.x, building.origin.y);
      if (resource === ResourceType.Coal) coal += EXTRACTOR_RATE_PER_MIN;
      else if (resource === ResourceType.IronOre) ironOre += EXTRACTOR_RATE_PER_MIN;
      else if (resource === ResourceType.CopperOre) copperOre += EXTRACTOR_RATE_PER_MIN;
    }
    return { coal, ironOre, copperOre };
  }

  canConnect(from: PortEndpoint, to: PortEndpoint): ConnectionResult {
    if (from.building === to.building) return { ok: false, reason: 'self_connection' };
    if (!this.connections.hasIdCapacity()) return { ok: false, reason: 'id_overflow' };

    const fromResolved = this.resolvePort(from);
    if (!fromResolved) return { ok: false, reason: this.endpointFailure(from) };
    const toResolved = this.resolvePort(to);
    if (!toResolved) return { ok: false, reason: this.endpointFailure(to) };

    if (fromResolved.port.kind !== PortKind.Output || toResolved.port.kind !== PortKind.Input) {
      return { ok: false, reason: 'port_kind_mismatch' };
    }
    if (this.connections.isPortConnected(from.building, from.port)) {
      return { ok: false, reason: 'port_already_connected' };
    }
    if (this.connections.isPortConnected(to.building, to.port)) {
      return { ok: false, reason: 'port_already_connected' };
    }
    if (!this.portsAdjacent(fromResolved, toResolved)) {
      return { ok: false, reason: 'ports_not_adjacent' };
    }
    return { ok: true };
  }

  connect(from: PortEndpoint, to: PortEndpoint): ConnectionId | null {
    const result = this.canConnect(from, to);
    if (!result.ok) return null;
    const id = this.connections.register(from, to);
    if (id !== null) {
      this.notify('world');
    }
    return id;
  }

  canPlaceBelt(from: PortEndpoint, to: PortEndpoint) {
    return planBelt(this, from, to);
  }

  placeBelt(from: PortEndpoint, to: PortEndpoint): PlaceBeltResult {
    const planned = this.canPlaceBelt(from, to);
    if (!planned.ok) return planned;

    const placedSegmentIds: BuildingId[] = [];

    for (const segment of planned.plan.segments) {
      if (!this.buildings.hasIdCapacity()) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return { ok: false, reason: 'id_overflow' };
      }

      const placement = this.canPlaceBuilding(segment.typeId, segment.coord, segment.rotation);
      if (!placement.ok) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return {
          ok: false,
          reason: placement.reason === 'id_overflow' ? 'id_overflow' : 'tiles_blocked',
        };
      }

      const id = this.placeBuilding(segment.typeId, segment.coord, segment.rotation);
      if (id === null) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return {
          ok: false,
          reason: this.buildings.hasIdCapacity() ? 'tiles_blocked' : 'id_overflow',
        };
      }

      placedSegmentIds.push(id);
    }

    for (const pending of planned.plan.connections) {
      if (!this.connections.hasIdCapacity()) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return { ok: false, reason: 'id_overflow' };
      }

      const pendingFrom = this.resolvePendingEndpoint(pending.from, placedSegmentIds);
      const pendingTo = this.resolvePendingEndpoint(pending.to, placedSegmentIds);
      if (!pendingFrom || !pendingTo) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return { ok: false, reason: 'tiles_blocked' };
      }

      const connectionId = this.connect(pendingFrom, pendingTo);
      if (connectionId === null) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return { ok: false, reason: 'tiles_blocked' };
      }
    }

    return {
      ok: true,
      segmentIds: placedSegmentIds,
      plan: planned.plan,
    };
  }

  removeBelt(segmentId: BuildingId): boolean {
    const building = this.buildings.get(segmentId);
    if (!building || !isBeltTypeId(building.typeId)) return false;

    const component = this.collectConnectedBeltComponent(segmentId);
    let removedAny = false;
    for (const beltId of component) {
      removedAny = this.removeBuildingInternal(beltId, false) || removedAny;
    }
    return removedAny;
  }

  disconnect(id: ConnectionId): boolean {
    const disconnected = this.connections.unregister(id);
    if (disconnected) {
      this.notify('world');
    }
    return disconnected;
  }

  getConnectionsOf(buildingId: BuildingId): readonly Connection[] {
    return this.connections.getConnectionsOf(buildingId);
  }

  getConnections(): ReadonlyMap<ConnectionId, Connection> {
    return this.connections.getAll();
  }

  private resolvePort(endpoint: PortEndpoint): ResolvedPort | null {
    const building = this.buildings.get(endpoint.building);
    if (!building) return null;
    const type = getBuildingType(building.typeId);
    if (!type) return null;
    const port = type.ports.find((p) => p.id === endpoint.port);
    if (!port) return null;
    return { building, port };
  }

  private endpointFailure(endpoint: PortEndpoint): 'unknown_building' | 'unknown_port' {
    const building = this.buildings.get(endpoint.building);
    if (!building) return 'unknown_building';
    const type = getBuildingType(building.typeId);
    if (!type) return 'unknown_building';
    if (!type.ports.find((p) => p.id === endpoint.port)) return 'unknown_port';
    // Should not reach here — resolvePort only returns null via these paths.
    return 'unknown_building';
  }

  private portsAdjacent(a: ResolvedPort, b: ResolvedPort): boolean {
    const typeA = getBuildingType(a.building.typeId)!;
    const typeB = getBuildingType(b.building.typeId)!;
    const tileA = worldTileOf(a.port, a.building.origin, a.building.rotation, typeA.footprint);
    const tileB = worldTileOf(b.port, b.building.origin, b.building.rotation, typeB.footprint);
    const sideA = worldSideOf(a.port, a.building.rotation);
    const sideB = worldSideOf(b.port, b.building.rotation);
    const step = unitVector(sideA);
    const expectedTileB: TileCoord = { x: tileA.x + step.x, y: tileA.y + step.y };
    if (expectedTileB.x !== tileB.x || expectedTileB.y !== tileB.y) return false;
    return sideA === oppositeSide(sideB);
  }

  private resolvePendingEndpoint(
    endpoint: PendingEndpoint,
    placedSegmentIds: readonly BuildingId[],
  ): PortEndpoint | null {
    if (endpoint.kind === 'building') {
      return { building: endpoint.building, port: endpoint.port };
    }

    const buildingId = placedSegmentIds[endpoint.segmentIndex];
    if (buildingId === undefined) return null;
    return { building: buildingId, port: endpoint.port };
  }

  private rollbackPlacedBelts(placedSegmentIds: readonly BuildingId[]): void {
    for (let i = placedSegmentIds.length - 1; i >= 0; i--) {
      this.removeBuilding(placedSegmentIds[i]);
    }
  }

  private collectConnectedBeltComponent(startId: BuildingId): readonly BuildingId[] {
    const seen = new Set<BuildingId>();
    const queue: BuildingId[] = [startId];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (seen.has(currentId)) continue;
      seen.add(currentId);

      for (const connection of this.getConnectionsOf(currentId)) {
        const neighborId = this.otherEndpointBuilding(connection, currentId);
        if (neighborId === null || seen.has(neighborId)) continue;
        const neighbor = this.buildings.get(neighborId);
        if (!neighbor || !isBeltTypeId(neighbor.typeId)) continue;
        queue.push(neighborId);
      }
    }

    return Array.from(seen);
  }

  private otherEndpointBuilding(connection: Connection, currentId: BuildingId): BuildingId | null {
    if (connection.from.building === currentId) return connection.to.building;
    if (connection.to.building === currentId) return connection.from.building;
    return null;
  }

  getBuildingAt(x: number, y: number): Building | null {
    return this.buildings.getAt(x, y);
  }

  getBuildings(): ReadonlyMap<BuildingId, Building> {
    return this.buildings.getAll();
  }

  placeResource(x: number, y: number, resource: ResourceTypeT): boolean {
    if (!isInBounds(x, y)) return false;
    const tile = this.grid.getType(x, y);
    if (tile === TileTypeConst.Water || tile === TileTypeConst.Empty) return false;
    this.grid.setResource(x, y, resource);
    return true;
  }

  removeResource(x: number, y: number): boolean {
    if (!isInBounds(x, y)) return false;
    this.grid.setResource(x, y, ResourceType.None);
    return true;
  }

  getResourceAt(x: number, y: number): ResourceTypeT {
    return this.grid.getResource(x, y);
  }

  generateMap(seed: number): void {
    generateResources(this.grid, seed);
    this.mapSeed = seed;
    this.notify('world');
  }

  getVisibleTiles(): VisibleTileRange {
    return this.viewport.getVisibleTileRange();
  }

  screenToTile(screenX: number, screenY: number): TileCoord {
    return screenToGrid(this.viewport, screenX, screenY);
  }

  subscribe(listener: (kind: GameEngineChangeKind) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  serializeWorld(): SerializedGameWorld {
    const energyLinks: Array<{ a: BuildingId; b: BuildingId }> = [];
    const seen = new Set<string>();
    for (const buildingId of this.buildings.getAll().keys()) {
      for (const neighborId of this.energyNetwork.getNeighbors(buildingId)) {
        const a = Math.min(buildingId, neighborId);
        const b = Math.max(buildingId, neighborId);
        const key = `${a}:${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        energyLinks.push({ a, b });
      }
    }

    const batteryCharges: Array<{ id: BuildingId; charge: number }> = [];
    for (const [id, charge] of this.batteryCharges) {
      batteryCharges.push({ id, charge });
    }

    return {
      version: SERIALIZE_VERSION,
      mapSeed: this.mapSeed,
      grid: this.grid.serialize(),
      buildings: this.buildings.serialize(),
      connections: this.connections.serialize(),
      energyLinks,
      playerStock: { ...this.playerStock },
      simulationTime: this.simulationTime,
      batteryCharges,
    };
  }

  static fromSnapshot(snapshot: SerializedGameWorld, screenWidth: number, screenHeight: number): GameEngine {
    if (snapshot.version !== SERIALIZE_VERSION) {
      throw new Error(`Unsupported GameEngine snapshot version: ${snapshot.version}`);
    }

    const engine = new GameEngine(screenWidth, screenHeight, {
      grid: TileGrid.deserialize(snapshot.grid),
      buildings: BuildingRegistry.deserialize(snapshot.buildings, (typeId) => getBuildingType(typeId)?.footprint),
      connections: ConnectionRegistry.deserialize(snapshot.connections),
      mapSeed: snapshot.mapSeed,
    });

    for (const connection of engine.connections.getAll().values()) {
      if (!engine.resolvePort(connection.from) || !engine.resolvePort(connection.to)) {
        throw new Error(`Invalid connection in snapshot: ${connection.id}`);
      }
    }

    for (const buildingId of engine.buildings.getAll().keys()) {
      engine.energyNetwork.registerBuilding(buildingId);
      const building = engine.buildings.get(buildingId);
      if (building) {
        const type = getBuildingType(building.typeId);
        if (type?.energy?.battery) {
          engine.batteryCharges.set(buildingId, 0);
        }
      }
    }
    for (const link of snapshot.energyLinks ?? []) {
      if (engine.buildings.get(link.a) && engine.buildings.get(link.b)) {
        engine.energyNetwork.connect(link.a, link.b);
      }
    }

    if (snapshot.playerStock) {
      engine.playerStock.coal = snapshot.playerStock.coal;
      engine.playerStock.ironOre = snapshot.playerStock.ironOre;
      engine.playerStock.copperOre = snapshot.playerStock.copperOre;
    }

    if (typeof snapshot.simulationTime === 'number' && Number.isFinite(snapshot.simulationTime)) {
      engine.simulationTime = ((snapshot.simulationTime % 1) + 1) % 1;
    }
    for (const entry of snapshot.batteryCharges ?? []) {
      if (engine.batteryCharges.has(entry.id)) {
        const building = engine.buildings.get(entry.id);
        if (building) {
          const type = getBuildingType(building.typeId);
          const capacity = type?.energy?.battery?.capacity ?? 0;
          engine.batteryCharges.set(entry.id, Math.max(0, Math.min(entry.charge, capacity)));
        }
      }
    }

    return engine;
  }

  getViewportSnapshot(): ViewportSnapshot {
    return this.viewport.getSnapshot();
  }

  private computeEnergyBalance(buildingIds: readonly BuildingId[]): EnergyNetworkBalance {
    let production = 0;
    let consumption = 0;
    const daylightFactor = getDaylightFactor(this.simulationTime);

    for (const buildingId of buildingIds) {
      const building = this.buildings.get(buildingId);
      if (!building) continue;
      const type = getBuildingType(building.typeId);
      if (!type?.energy) continue;
      const baseProduction = type.energy.production ?? 0;
      if (baseProduction > 0 && building.typeId === SOLAR_PANEL_BUILDING_TYPE_ID) {
        production += baseProduction * daylightFactor;
      } else {
        production += baseProduction;
      }
      consumption += type.energy.consumption ?? 0;
    }

    return {
      buildingIds: [...buildingIds].sort((a, b) => a - b),
      production,
      consumption,
      remaining: production - consumption,
    };
  }

  private isEnergyLinkableBuilding(typeId: BuildingTypeId): boolean {
    const type = getBuildingType(typeId);
    if (!type?.energy) return false;
    return (type.energy.production ?? 0) > 0 || (type.energy.consumption ?? 0) > 0 || !!type.energy.battery;
  }

  private notify(kind: GameEngineChangeKind): void {
    for (const listener of this.listeners) {
      listener(kind);
    }
  }
}
