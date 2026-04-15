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
import { getBuildingType, isBeltTypeId, validateCatalog } from '../data/buildingCatalog';
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
  type PendingEndpoint,
  type PlacementResult,
  type PlaceBeltResult,
  type Port,
  type PortId,
  type EnergyNetworkBalance,
  type ResourceType as ResourceTypeT,
  type TileCoord,
  type TileType,
} from '../types';
import { DEFAULT_MAP_SEED } from '../constants';
import { isInBounds } from '../data/coords';
import { screenToGrid } from './CoordinateTransform';
import { generateResources } from '../data/ResourceGenerator';
import { planBelt } from './BeltRouter';
import { EnergyNetwork } from '../systems/EnergyNetwork';

interface PortEndpoint {
  readonly building: BuildingId;
  readonly port: PortId;
}

interface ResolvedPort {
  readonly building: Building;
  readonly port: Port;
}

export type GameEngineChangeKind = 'world' | 'viewport';

export interface SerializedGameWorld {
  readonly version: number;
  readonly mapSeed: number;
  readonly grid: ArrayBuffer;
  readonly buildings: ReturnType<BuildingRegistry['serialize']>;
  readonly connections: SerializedConnectionRegistry;
}

interface GameEngineOptions {
  readonly grid?: TileGrid;
  readonly buildings?: BuildingRegistry;
  readonly connections?: ConnectionRegistry;
  readonly mapSeed?: number;
}

const SERIALIZE_VERSION = 1;

export class GameEngine {
  readonly grid: TileGrid;
  readonly viewport: Viewport;
  readonly buildings: BuildingRegistry;
  readonly connections: ConnectionRegistry;
  readonly energyNetwork: EnergyNetwork;
  mapSeed: number;
  private readonly listeners = new Set<(kind: GameEngineChangeKind) => void>();

  constructor(screenWidth: number, screenHeight: number, options: GameEngineOptions = {}) {
    validateCatalog();
    this.grid = options.grid ?? new TileGrid();
    this.grid.setOnChange(() => this.notify('world'));
    this.viewport = new Viewport(screenWidth, screenHeight, () => this.notify('viewport'));
    this.buildings = options.buildings ?? new BuildingRegistry();
    this.connections = options.connections ?? new ConnectionRegistry();
    this.energyNetwork = new EnergyNetwork();
    this.mapSeed = options.mapSeed ?? DEFAULT_MAP_SEED;
  }

  update(_dt: number): void {
    // Simulation tick — will grow with future features
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
      if (type.requiresResourceDeposit && this.grid.getResource(x, y) === ResourceType.None) {
        return { ok: false, reason: 'resource_required' };
      }
      if (type.forbidsResourceDeposit && this.grid.getResource(x, y) !== ResourceType.None) {
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
      this.notify('world');
    }
    return id;
  }

  removeBuilding(id: BuildingId): boolean {
    const building = this.buildings.get(id);
    if (!building) return false;
    const type = getBuildingType(building.typeId);
    if (!type) return false;
    this.connections.unregisterAllFor(id);
    this.energyNetwork.unregisterBuilding(id);
    const removed = this.buildings.unregister(id, type.footprint);
    if (removed) {
      this.notify('world');
    }
    return removed;
  }

  connectBuildings(a: BuildingId, b: BuildingId): boolean {
    if (!this.buildings.get(a) || !this.buildings.get(b)) return false;
    return this.energyNetwork.connect(a, b);
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
      removedAny = this.removeBuilding(beltId) || removedAny;
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
    return {
      version: SERIALIZE_VERSION,
      mapSeed: this.mapSeed,
      grid: this.grid.serialize(),
      buildings: this.buildings.serialize(),
      connections: this.connections.serialize(),
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

    return engine;
  }

  getViewportSnapshot(): ViewportSnapshot {
    return this.viewport.getSnapshot();
  }

  private computeEnergyBalance(buildingIds: readonly BuildingId[]): EnergyNetworkBalance {
    let production = 0;
    let consumption = 0;

    for (const buildingId of buildingIds) {
      const building = this.buildings.get(buildingId);
      if (!building) continue;
      const type = getBuildingType(building.typeId);
      if (!type?.energy) continue;
      production += type.energy.production ?? 0;
      consumption += type.energy.consumption ?? 0;
    }

    return {
      buildingIds: [...buildingIds].sort((a, b) => a - b),
      production,
      consumption,
      remaining: production - consumption,
    };
  }

  private notify(kind: GameEngineChangeKind): void {
    for (const listener of this.listeners) {
      listener(kind);
    }
  }
}
