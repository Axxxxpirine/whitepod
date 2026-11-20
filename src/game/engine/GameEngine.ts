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
  isProcessorTypeId,
  isStorageTypeId,
  validateCatalog,
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
  CONVERTER_BUILDING_TYPE_ID,
  HUB_BUILDING_TYPE_ID,
} from '../data/buildingCatalog';
import { getRecipe, type RecipeId } from '../data/recipeCatalog';
import { DEFAULT_GAME_MODE, GameMode as GameModes, resolveGameMode, type GameMode } from '../data/gameMode';
import { clearHubSite, findHubOrigin } from '../campaign/hubPlacement';
import { ensureStartingDeposits, STARTING_KIT } from '../campaign/campaignStart';
import { RESOURCE_STOCK_KEY } from '../data/resourceStock';
import { canAfford, mergeCosts, refund, spend } from '../economy/wallet';
import { Viewport } from './Viewport';
import type { ViewportSnapshot, VisibleTileRange } from './Viewport';
import {
  Direction,
  PortKind,
  ResourceType,
  TileType as TileTypeConst,
  type Building,
  type BuildingId,
  type BuildingType,
  type BuildingTypeId,
  type Connection,
  type ConnectionId,
  type ConnectionResult,
  type EnergyGlobalStats,
  type PendingEndpoint,
  type BeltFailure,
  type PlacementResult,
  type PlaceBeltResult,
  type PowerState,
  type Port,
  type PortId,
  type EnergyNetworkBalance,
  type EnergyNetworkStats,
  type ResourceCost,
  type ResourceType as ResourceTypeT,
  type TileCoord,
  type TileType,
} from '../types';
import { DEFAULT_MAP_SEED, INITIAL_FOG_REVEAL_RADIUS, MAP_CENTER, REVEALED_FLAG, WATCHTOWER_REVEAL_RADIUS } from '../constants';
import { isInBounds, toIndex } from '../data/coords';
import { screenToGrid } from './CoordinateTransform';
import { generateResources } from '../data/ResourceGenerator';
import { planBelt } from './BeltRouter';
import { EnergyNetwork } from '../systems/EnergyNetwork';
import { getDaylightFactor } from '../renderer/DayNightOverlayRenderer';
import { SOLAR_PANEL_BUILDING_TYPE_ID, WATCHTOWER_BUILDING_TYPE_ID } from '../data/buildingCatalog';
import type { GameSfxEvent, GameSfxListener } from '@/game/audio/sfxEvents';
import {
  resolveDownstreamTerminalFromOutput,
  resolveProcessorLogisticsStatus,
  type ProcessorLogisticsStatus,
} from '@/game/flow/processorLogistics';

interface PortEndpoint {
  readonly building: BuildingId;
  readonly port: PortId;
}

interface ResolvedPort {
  readonly building: Building;
  readonly port: Port;
}

export type GameEngineChangeKind = 'world' | 'viewport';

interface PlaceBuildingOptions {
  readonly emitSfx?: boolean;
}

interface RemoveBuildingOptions {
  readonly emitSfx?: boolean;
}

export interface ResourceStock {
  regolith: number;
  hydrogen: number;
  oxygen: number;
  ironOxide: number;
  aluminumOxide: number;
  siliconDioxide: number;
  nitrogenGas: number;
  water: number;
  methane: number;
  carbonDioxide: number;
  ammonia: number;
  ceramicPlates: number;
}

export type ResourceInventory = ResourceStock;

export interface ProducerOutputBuffer {
  readonly resourceType: ResourceTypeT;
  readonly amount: 0 | 1;
}

export interface ProcessorState {
  recipeId: RecipeId | null;
  cycleProgress: number;
}

export interface ProcessorReservation {
  readonly resourceType: ResourceTypeT;
  readonly providerId: BuildingId;
  readonly inputPortId: PortId;
}

export interface SerializedGameWorld {
  readonly version: number;
  readonly mapSeed: number;
  /** Absent in saves written before game modes existed: restored as the default mode. */
  readonly gameMode?: GameMode;
  readonly grid: ArrayBuffer;
  readonly buildings: ReturnType<BuildingRegistry['serialize']>;
  readonly connections: SerializedConnectionRegistry;
  readonly energyLinks?: readonly { readonly a: BuildingId; readonly b: BuildingId }[];
  readonly simulationTime?: number;
  readonly batteryCharges?: readonly { readonly id: BuildingId; readonly charge: number }[];
  readonly processorStates?: readonly { readonly id: BuildingId; readonly recipeId: RecipeId | null; readonly cycleProgress: number }[];
  readonly storageInventories?: readonly { readonly id: BuildingId; readonly inventory: ResourceInventory }[];
  readonly producerOutputBuffers?: readonly { readonly id: BuildingId; readonly buffer: ProducerOutputBuffer }[];
  readonly processorReservations?: readonly { readonly id: BuildingId; readonly reservations: readonly ProcessorReservation[] }[];
}

interface GameEngineOptions {
  readonly grid?: TileGrid;
  readonly buildings?: BuildingRegistry;
  readonly connections?: ConnectionRegistry;
  readonly mapSeed?: number;
  readonly dayNightCycleSeconds?: number;
  readonly gameMode?: GameMode;
}

const SERIALIZE_VERSION = 3;

interface BatteryBuildingRef {
  readonly id: BuildingId;
  readonly charge: number;
  readonly capacity: number;
  readonly chargeRate: number;
  readonly dischargeRate: number;
}

export class GameEngine {
  private static readonly EXTRACTION_INTERVAL_S = 60 / EXTRACTOR_RATE_PER_MIN;
  private static readonly EMPTY_RESOURCE_STOCK = (): ResourceStock => ({
    regolith: 0, hydrogen: 0, oxygen: 0,
    ironOxide: 0, aluminumOxide: 0, siliconDioxide: 0, nitrogenGas: 0,
    water: 0, methane: 0, carbonDioxide: 0, ammonia: 0, ceramicPlates: 0,
  });

  readonly grid: TileGrid;
  readonly viewport: Viewport;
  readonly buildings: BuildingRegistry;
  readonly connections: ConnectionRegistry;
  readonly energyNetwork: EnergyNetwork;
  readonly dayNightCycleSeconds: number;
  simulationTime = 0;
  mapSeed: number;
  /** Fixed for the lifetime of the world. */
  readonly gameMode: GameMode;
  readonly batteryCharges = new Map<BuildingId, number>();
  readonly processorStates = new Map<BuildingId, ProcessorState>();
  readonly storageInventories = new Map<BuildingId, ResourceInventory>();
  readonly producerOutputBuffers = new Map<BuildingId, ProducerOutputBuffer | null>();
  readonly processorReservations = new Map<BuildingId, readonly ProcessorReservation[]>();
  private readonly listeners = new Set<(kind: GameEngineChangeKind) => void>();
  private readonly sfxListeners = new Set<GameSfxListener>();
  private readonly actionListeners = new Set<(action: { kind: string; payload: Record<string, unknown> }) => void>();
  private notificationSuspendDepth = 0;
  private hasPendingWorldNotification = false;
  private hasPendingViewportNotification = false;
  private extractionAccumulator = 0;
  private readonly poweredExtractors = new Set<BuildingId>();
  private readonly poweredConsumers = new Set<BuildingId>();
  private hubIdCache: BuildingId | null = null;

  constructor(screenWidth: number, screenHeight: number, options: GameEngineOptions = {}) {
    validateCatalog();
    this.grid = options.grid ?? new TileGrid();
    this.grid.setOnChange(() => this.notify('world'));
    this.viewport = new Viewport(screenWidth, screenHeight, () => this.notify('viewport'));
    this.buildings = options.buildings ?? new BuildingRegistry();
    this.connections = options.connections ?? new ConnectionRegistry();
    this.energyNetwork = new EnergyNetwork();
    this.mapSeed = options.mapSeed ?? DEFAULT_MAP_SEED;
    this.gameMode = options.gameMode ?? DEFAULT_GAME_MODE;
    this.dayNightCycleSeconds =
      options.dayNightCycleSeconds && options.dayNightCycleSeconds > 0
        ? options.dayNightCycleSeconds
        : 120;
  }

  setSimulationTime(value: number): void {
    this.simulationTime = ((value % 1) + 1) % 1;
  }

  setActionListener(listener: (action: { kind: string; payload: Record<string, unknown> }) => void): () => void {
    this.actionListeners.add(listener);
    return () => this.actionListeners.delete(listener);
  }

  private emitAction(kind: string, payload: Record<string, unknown>): void {
    for (const listener of this.actionListeners) {
      listener({ kind, payload });
    }
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

    // Processor production
    this.processProcessors(dt);

    // Battery charge/discharge
    this.updateBatteries(dt);

    // Power can change with time alone (night, empty batteries): views such as
    // the belt flow animation only refresh on world notifications.
    if (this.syncPowerState()) {
      this.notify('world');
    }
  }

  private processExtraction(): void {
    let changed = false;
    for (const [id, building] of this.buildings.getAll().entries()) {
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;
      if (this.getBuildingPowerState(id) !== 'powered') continue;
      if (this.producerOutputBuffers.get(id)) continue;
      const { x, y } = building.origin;
      const idx = toIndex(x, y);
      const resourceType = this.grid.resourceType[idx] as ResourceTypeT;
      if (resourceType === ResourceType.None) continue;
      this.producerOutputBuffers.set(id, { resourceType, amount: 1 });
      changed = this.flushProducerOutput(id) || changed;
      this.grid.markDirty(x, y);
      changed = true;
    }
    if (changed) {
      this.notify('world');
    }
  }

  private processProcessors(dt: number): void {
    let changed = false;
    for (const [id, state] of this.processorStates) {
      if (!state.recipeId) continue;
      if (this.getBuildingPowerState(id) !== 'powered') continue;
      if (this.producerOutputBuffers.get(id)) continue;
      const recipe = getRecipe(state.recipeId);
      if (!recipe) continue;
      const reservations = this.processorReservations.get(id) ?? [];
      if (reservations.length === 0) {
        const nextReservations = this.reserveProcessorInputs(id, recipe.inputs);
        if (nextReservations === null) continue;
        this.processorReservations.set(id, nextReservations);
        changed = true;
      }

      state.cycleProgress += dt;
      if (state.cycleProgress >= recipe.cycleSeconds) {
        state.cycleProgress -= recipe.cycleSeconds;
        this.processorReservations.delete(id);
        this.producerOutputBuffers.set(id, {
          resourceType: recipe.output.resourceType,
          amount: Math.min(recipe.output.amount, 1) as 0 | 1,
        });
        this.flushProducerOutput(id);
        changed = true;
      }
    }
    if (changed) this.notify('world');
  }

  setProcessorRecipe(buildingId: BuildingId, recipeId: RecipeId | null): boolean {
    const state = this.processorStates.get(buildingId);
    if (!state) return false;
    const building = this.buildings.get(buildingId);
    if (!building) return false;
    if (!this.isProcessorIdle(buildingId, state)) return false;

    if (recipeId !== null) {
      const recipe = getRecipe(recipeId);
      if (!recipe) return false;
      const expectedBuilding = building.typeId === CONVERTER_BUILDING_TYPE_ID ? 'converter' : 'synthesizer';
      if (recipe.building !== expectedBuilding) return false;
    }

    state.recipeId = recipeId;
    state.cycleProgress = 0;
    this.processorReservations.delete(buildingId);
    this.notify('world');
    this.emitAction('set_processor_recipe', { buildingId, recipeId });
    return true;
  }

  getProcessorState(buildingId: BuildingId): ProcessorState | undefined {
    return this.processorStates.get(buildingId);
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
      } else if (netPower < 0 && this.isNetworkPowered(network)) {
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
    if (type.systemPlaced) return { ok: false, reason: 'system_placed' };
    const footprint = this.checkFootprint(type, origin);
    if (!footprint.ok) return footprint;
    if (!this.canAfford(this.getBuildingCost(typeId))) return { ok: false, reason: 'insufficient_resources' };
    return { ok: true };
  }

  /** Footprint rules shared by player placement and engine-placed buildings. */
  private checkFootprint(type: BuildingType, origin: TileCoord): PlacementResult {
    if (!this.buildings.hasIdCapacity()) return { ok: false, reason: 'id_overflow' };

    for (const { x, y, inBounds, idx } of this.buildings.footprintTiles(origin, type.footprint)) {
      if (!inBounds) return { ok: false, reason: 'out_of_bounds' };
      if (!(this.grid.flags[idx] & REVEALED_FLAG)) {
        return { ok: false, reason: 'tile_fogged' };
      }
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
    options: PlaceBuildingOptions = {},
  ): BuildingId | null {
    const emitSfx = options.emitSfx ?? true;
    const result = this.canPlaceBuilding(typeId, origin, rotation);
    if (!result.ok) {
      if (emitSfx) {
        this.publishSfx({ type: 'building_place_fail', buildingType: typeId, reason: result.reason });
      }
      return null;
    }

    return this.commitPlacement(getBuildingType(typeId)!, origin, rotation, emitSfx, true);
  }

  /** Places a `systemPlaced` building (e.g. the campaign hub), bypassing the player-only refusal. */
  private placeSystemBuilding(typeId: BuildingTypeId, origin: TileCoord): BuildingId | null {
    const type = getBuildingType(typeId);
    if (!type || !this.checkFootprint(type, origin).ok) return null;
    return this.commitPlacement(type, origin, Direction.North, false, false);
  }

  private commitPlacement(
    type: BuildingType,
    origin: TileCoord,
    rotation: Direction,
    emitSfx: boolean,
    charge: boolean,
  ): BuildingId | null {
    const typeId = type.id;
    const id = this.buildings.register({ typeId, origin, rotation }, type.footprint);
    if (id !== null) {
      // Affordability was checked by canPlaceBuilding in this same call.
      if (charge) this.spendFromWallet(this.getBuildingCost(typeId));
      this.energyNetwork.registerBuilding(id);
      if (type.energy?.battery) {
        this.batteryCharges.set(id, 0);
      }
      if (isStorageTypeId(typeId)) {
        this.storageInventories.set(id, GameEngine.EMPTY_RESOURCE_STOCK());
      }
      if (typeId === EXTRACTOR_BUILDING_TYPE_ID || isProcessorTypeId(typeId)) {
        this.producerOutputBuffers.set(id, null);
      }
      if (isProcessorTypeId(typeId)) {
        this.processorStates.set(id, { recipeId: null, cycleProgress: 0 });
      }
      if (typeId === WATCHTOWER_BUILDING_TYPE_ID) {
        const cx = origin.x + Math.floor(type.footprint.w / 2);
        const cy = origin.y + Math.floor(type.footprint.h / 2);
        this.grid.revealCircle(cx, cy, WATCHTOWER_REVEAL_RADIUS);
      }
      this.notify('world');
      this.emitAction('place_building', { typeId, origin, rotation });
      if (emitSfx) {
        this.publishSfx({ type: 'building_place_success', buildingType: typeId });
      }
    } else if (emitSfx) {
      this.publishSfx({
        type: 'building_place_fail',
        buildingType: typeId,
        reason: this.buildings.hasIdCapacity() ? 'tile_occupied' : 'id_overflow',
      });
    }
    return id;
  }

  removeBuilding(id: BuildingId, options: RemoveBuildingOptions = {}): boolean {
    const building = this.buildings.get(id);
    if (building && getBuildingType(building.typeId)?.permanent) return false;
    const result = this.removeBuildingInternal(id, true, options.emitSfx ?? true);
    if (result && building) {
      this.emitAction('remove_building', { typeId: building.typeId });
    }
    return result;
  }

  private removeBuildingInternal(id: BuildingId, cascadeBelts: boolean, emitSfx = false): boolean {
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
    this.storageInventories.delete(id);
    this.producerOutputBuffers.delete(id);
    this.processorStates.delete(id);
    this.processorReservations.delete(id);
    const removed = this.buildings.unregister(id, type.footprint);
    if (removed) {
      // After the storage inventory is gone, so a removed storage never refunds into itself.
      this.refundToWallet(this.getBuildingCost(building.typeId));
      this.syncPowerState(false);
      this.notify('world');
      if (emitSfx) {
        this.publishSfx({ type: 'building_remove_success', buildingType: building.typeId });
      }
    }
    return removed;
  }

  connectBuildings(a: BuildingId, b: BuildingId): boolean {
    const buildingA = this.buildings.get(a);
    const buildingB = this.buildings.get(b);
    if (!buildingA || !buildingB) {
      this.publishSfx({ type: 'energy_link_fail', action: 'connect' });
      return false;
    }
    if (!this.isEnergyLinkableBuilding(buildingA.typeId) || !this.isEnergyLinkableBuilding(buildingB.typeId)) {
      this.publishSfx({ type: 'energy_link_fail', action: 'connect' });
      return false;
    }
    const connected = this.energyNetwork.connect(a, b);
    if (connected) {
      this.syncPowerState();
      this.notify('world');
      this.emitAction('connect_buildings', { a, b });
      this.publishSfx({ type: 'energy_link_connect' });
    } else {
      this.publishSfx({ type: 'energy_link_fail', action: 'connect' });
    }
    return connected;
  }

  disconnectBuildings(a: BuildingId, b: BuildingId): boolean {
    if (!this.buildings.get(a) || !this.buildings.get(b)) {
      this.publishSfx({ type: 'energy_link_fail', action: 'disconnect' });
      return false;
    }
    const disconnected = this.energyNetwork.disconnect(a, b);
    if (disconnected) {
      this.syncPowerState(false);
      this.notify('world');
      this.emitAction('disconnect_buildings', { a, b });
      this.publishSfx({ type: 'energy_link_disconnect' });
    } else {
      this.publishSfx({ type: 'energy_link_fail', action: 'disconnect' });
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

  getEnergyStatsForBuilding(buildingId: BuildingId): EnergyNetworkStats | null {
    const network = this.getEnergyNetworkForBuilding(buildingId);
    if (!network) return null;
    return this.toEnergyStats(network);
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
    return this.isNetworkPowered(network) ? 'powered' : 'unpowered';
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

  private isNetworkPowered(network: EnergyNetworkBalance): boolean {
    if (network.remaining >= 0) return true;
    return this.getNetworkDischargeRate(network.buildingIds) >= -network.remaining;
  }

  private toEnergyStats(network: EnergyNetworkBalance): EnergyNetworkStats {
    const isPowered = this.isNetworkPowered(network);
    const servedConsumption = isPowered ? network.consumption : 0;
    const demandedConsumption = network.consumption;

    return {
      buildingIds: network.buildingIds,
      isPowered,
      production: network.production,
      servedConsumption,
      demandedConsumption,
      surplusPower: network.production - servedConsumption,
      demandBalance: network.production - demandedConsumption,
      unservedLoad: demandedConsumption - servedConsumption,
    };
  }

  getEnergyGlobalStats(): EnergyGlobalStats {
    let production = 0;
    let servedConsumption = 0;
    let demandedConsumption = 0;
    let onlineConsumers = 0;
    let offlineConsumers = 0;

    for (const network of this.getEnergyNetworkBalances()) {
      const stats = this.toEnergyStats(network);
      production += stats.production;
      servedConsumption += stats.servedConsumption;
      demandedConsumption += stats.demandedConsumption;
      for (const buildingId of stats.buildingIds) {
        const building = this.buildings.get(buildingId);
        if (!building) continue;
        const buildingType = getBuildingType(building.typeId);
        const machineConsumption = buildingType?.energy?.consumption ?? 0;
        if (machineConsumption <= 0) continue;
        if (stats.isPowered) {
          onlineConsumers += 1;
        } else {
          offlineConsumers += 1;
        }
      }
    }

    return {
      production,
      servedConsumption,
      demandedConsumption,
      surplusPower: production - servedConsumption,
      demandBalance: production - demandedConsumption,
      unservedLoad: demandedConsumption - servedConsumption,
      onlineConsumers,
      offlineConsumers,
    };
  }

  getResourceCounts(): ResourceStock {
    const totals = GameEngine.EMPTY_RESOURCE_STOCK();
    for (const inventory of this.storageInventories.values()) {
      for (const key of Object.keys(totals) as (keyof ResourceStock)[]) {
        totals[key] += inventory[key];
      }
    }
    return totals;
  }

  getStorageInventory(buildingId: BuildingId): ResourceStock | null {
    const inventory = this.storageInventories.get(buildingId);
    return inventory ? { ...inventory } : null;
  }

  getProducerOutputBuffer(buildingId: BuildingId): ProducerOutputBuffer | null {
    const buffer = this.producerOutputBuffers.get(buildingId) ?? null;
    return buffer ? { ...buffer } : null;
  }

  getProducerResourceType(buildingId: BuildingId): ResourceTypeT | null {
    const building = this.buildings.get(buildingId);
    if (!building) return null;
    if (building.typeId === EXTRACTOR_BUILDING_TYPE_ID) {
      const resource = this.grid.getResource(building.origin.x, building.origin.y);
      return resource === ResourceType.None ? null : resource;
    }
    if (isProcessorTypeId(building.typeId)) {
      const recipeId = this.processorStates.get(buildingId)?.recipeId;
      const recipe = recipeId ? getRecipe(recipeId) : undefined;
      return recipe?.output.resourceType ?? null;
    }
    return null;
  }

  getProcessorLogisticsStatus(buildingId: BuildingId): ProcessorLogisticsStatus | null {
    return resolveProcessorLogisticsStatus(this, buildingId);
  }

  getBuildingTypeDefinition(typeId: BuildingTypeId) {
    return getBuildingType(typeId);
  }

  getResourceRates(): ResourceStock {
    const rates = GameEngine.EMPTY_RESOURCE_STOCK();

    // Extractors: add production rate for base resources
    for (const [id, building] of this.buildings.getAll().entries()) {
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;
      if (this.getBuildingPowerState(id) !== 'powered') continue;
      if (!this.hasValidDownstream(id)) continue;
      const resource = this.grid.getResource(building.origin.x, building.origin.y);
      const key = RESOURCE_STOCK_KEY[resource];
      if (key) rates[key] += EXTRACTOR_RATE_PER_MIN;
    }

    // Processors: add output rate, subtract input rates (net flow)
    for (const [id, state] of this.processorStates) {
      if (!state.recipeId) continue;
      if (this.getBuildingPowerState(id) !== 'powered') continue;
      const logistics = this.getProcessorLogisticsStatus(id);
      if (!logistics || logistics.badInput || logistics.missingInput || logistics.blockedOutput) continue;
      const recipe = getRecipe(state.recipeId);
      if (!recipe) continue;

      // Output rate
      const outKey = RESOURCE_STOCK_KEY[recipe.output.resourceType];
      if (outKey) rates[outKey] += (recipe.output.amount / recipe.cycleSeconds) * 60;

      // Input consumption rates (negative)
      for (const input of recipe.inputs) {
        const inKey = RESOURCE_STOCK_KEY[input.resourceType];
        if (inKey) rates[inKey] -= (input.amount / recipe.cycleSeconds) * 60;
      }
    }

    return rates;
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

  canPlaceBelt(from: PortEndpoint, to: PortEndpoint): ReturnType<typeof planBelt> {
    const planned = planBelt(this, from, to);
    if (planned.ok && !this.canAfford(this.getBeltRouteCost(planned.plan.segments))) {
      return { ok: false, reason: 'insufficient_resources' };
    }
    return planned;
  }

  /** Total cost of a planned belt route (one segment cost per tile). */
  getBeltRouteCost(segments: readonly { readonly typeId: BuildingTypeId }[]): ResourceCost[] {
    return mergeCosts(segments.map((segment) => this.getBuildingCost(segment.typeId)));
  }

  placeBelt(from: PortEndpoint, to: PortEndpoint): PlaceBeltResult {
    const planned = this.canPlaceBelt(from, to);
    const fail = (reason: BeltFailure): PlaceBeltResult => {
      this.publishSfx({ type: 'belt_place_fail', reason });
      return { ok: false, reason };
    };
    if (!planned.ok) return fail(planned.reason);

    const placedSegmentIds: BuildingId[] = [];

    for (const segment of planned.plan.segments) {
      if (!this.buildings.hasIdCapacity()) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return fail('id_overflow');
      }

      const placement = this.canPlaceBuilding(segment.typeId, segment.coord, segment.rotation);
      if (!placement.ok) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return fail(placement.reason === 'id_overflow' ? 'id_overflow' : 'tiles_blocked');
      }

      const id = this.placeBuilding(segment.typeId, segment.coord, segment.rotation, { emitSfx: false });
      if (id === null) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return fail(this.buildings.hasIdCapacity() ? 'tiles_blocked' : 'id_overflow');
      }

      placedSegmentIds.push(id);
    }

    for (const pending of planned.plan.connections) {
      if (!this.connections.hasIdCapacity()) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return fail('id_overflow');
      }

      const pendingFrom = this.resolvePendingEndpoint(pending.from, placedSegmentIds);
      const pendingTo = this.resolvePendingEndpoint(pending.to, placedSegmentIds);
      if (!pendingFrom || !pendingTo) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return fail('tiles_blocked');
      }

      const connectionId = this.connect(pendingFrom, pendingTo);
      if (connectionId === null) {
        this.rollbackPlacedBelts(placedSegmentIds);
        return fail('tiles_blocked');
      }
    }

    this.publishSfx({ type: 'belt_place_success', segmentCount: placedSegmentIds.length });
    const result: PlaceBeltResult = {
      ok: true,
      segmentIds: placedSegmentIds,
      plan: planned.plan,
    };
    
    this.emitAction('place_belt', {
      from: { building: from.building, port: from.port },
      to: { building: to.building, port: to.port },
      segmentCount: placedSegmentIds.length,
    });
    
    return result;
  }

  removeBelt(segmentId: BuildingId): boolean {
    const building = this.buildings.get(segmentId);
    if (!building || !isBeltTypeId(building.typeId)) return false;

    const component = this.collectConnectedBeltComponent(segmentId);
    let removedAny = false;
    for (const beltId of component) {
      removedAny = this.removeBuildingInternal(beltId, false, false) || removedAny;
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
    this.emitAction('place_resource', { x, y, resource });
    return true;
  }

  removeResource(x: number, y: number): boolean {
    if (!isInBounds(x, y)) return false;
    this.grid.setResource(x, y, ResourceType.None);
    this.emitAction('remove_resource', { x, y });
    return true;
  }

  /** True when construction is paid for (campaign); sandbox building stays free. */
  get chargesConstruction(): boolean {
    return this.gameMode === GameModes.Campaign;
  }

  /** Cost the player pays for one building of this type: empty in sandbox. */
  getBuildingCost(typeId: BuildingTypeId): readonly ResourceCost[] {
    if (!this.chargesConstruction) return [];
    return getBuildingType(typeId)?.cost ?? [];
  }

  canAfford(cost: readonly ResourceCost[]): boolean {
    return cost.length === 0 || canAfford(this.walletInventories(), cost);
  }

  /**
   * Inventories construction is paid from (decision D2: global stock), in
   * draw order: hub first, then storages by ascending id.
   */
  private walletInventories(): ResourceInventory[] {
    const hubId = this.getHubId();
    const ids = [...this.storageInventories.keys()].filter((id) => id !== hubId).sort((a, b) => a - b);
    if (hubId !== null) ids.unshift(hubId);
    return ids.map((id) => this.storageInventories.get(id)!).filter(Boolean);
  }

  private spendFromWallet(cost: readonly ResourceCost[]): void {
    if (cost.length === 0) return;
    if (!spend(this.walletInventories(), cost)) {
      throw new Error('Construction cost not affordable: canPlaceBuilding must be checked first');
    }
  }

  /** Refunds into the hub, or the first storage when there is no hub; lost when there is none. */
  private refundToWallet(cost: readonly ResourceCost[]): void {
    if (cost.length === 0) return;
    const target = this.walletInventories()[0];
    if (target) refund(target, cost);
  }

  /** The campaign hub, or null in sandbox worlds. */
  getHubId(): BuildingId | null {
    // The hub is permanent and placed once, so a found id never goes stale.
    if (this.hubIdCache !== null) return this.hubIdCache;
    for (const building of this.buildings.getAll().values()) {
      if (building.typeId === HUB_BUILDING_TYPE_ID) {
        this.hubIdCache = building.id;
        return building.id;
      }
    }
    return null;
  }

  getHubInventory(): ResourceInventory | null {
    const hubId = this.getHubId();
    return hubId === null ? null : this.getStorageInventory(hubId);
  }

  /**
   * Campaign start: places the hub near the map center inside the initial
   * reveal, guarantees the starting deposits around it and credits the
   * starting kit. Idempotent: a world keeps a single hub, and its kit, across
   * map regenerations.
   */
  private setupCampaignStart(): void {
    if (this.getHubId() !== null) return;
    const footprint = getBuildingType(HUB_BUILDING_TYPE_ID)!.footprint;
    const isOccupied = (index: number) => this.buildings.occupantIdAt(index) !== 0;
    const searchRadius = INITIAL_FOG_REVEAL_RADIUS - Math.max(footprint.w, footprint.h);
    const origin =
      findHubOrigin(this.grid, footprint, MAP_CENTER, searchRadius, isOccupied) ??
      clearHubSite(this.grid, footprint, MAP_CENTER);
    const hubId = this.placeSystemBuilding(HUB_BUILDING_TYPE_ID, origin);
    if (hubId === null) {
      throw new Error(`Campaign hub could not be placed at ${origin.x},${origin.y}`);
    }
    ensureStartingDeposits(this.grid, origin, footprint, isOccupied);
    refund(this.storageInventories.get(hubId)!, STARTING_KIT);
  }

  getResourceAt(x: number, y: number): ResourceTypeT {
    return this.grid.getResource(x, y);
  }

  generateMap(seed: number): void {
    generateResources(this.grid, seed);
    this.grid.revealCircle(MAP_CENTER.x, MAP_CENTER.y, INITIAL_FOG_REVEAL_RADIUS);
    this.mapSeed = seed;
    if (this.gameMode === GameModes.Campaign) {
      this.setupCampaignStart();
    }
    this.notify('world');
    this.emitAction('generate_map', { seed });
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

  subscribeSfx(listener: GameSfxListener): () => void {
    this.sfxListeners.add(listener);
    return () => {
      this.sfxListeners.delete(listener);
    };
  }

  emitSfx(event: GameSfxEvent): void {
    this.publishSfx(event);
  }

  runWithoutNotifications<T>(work: () => T): T {
    this.notificationSuspendDepth += 1;
    try {
      return work();
    } finally {
      this.notificationSuspendDepth -= 1;
      if (this.notificationSuspendDepth === 0) {
        if (this.hasPendingWorldNotification) {
          this.hasPendingWorldNotification = false;
          this.hasPendingViewportNotification = false;
          this.notifyListeners('world');
        } else if (this.hasPendingViewportNotification) {
          this.hasPendingViewportNotification = false;
          this.notifyListeners('viewport');
        }
      }
    }
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

    const processorStates: Array<{ id: BuildingId; recipeId: RecipeId | null; cycleProgress: number }> = [];
    for (const [id, state] of this.processorStates) {
      processorStates.push({ id, recipeId: state.recipeId, cycleProgress: state.cycleProgress });
    }

    const storageInventories: Array<{ id: BuildingId; inventory: ResourceInventory }> = [];
    for (const [id, inventory] of this.storageInventories) {
      storageInventories.push({ id, inventory: { ...inventory } });
    }

    const producerOutputBuffers: Array<{ id: BuildingId; buffer: ProducerOutputBuffer }> = [];
    for (const [id, buffer] of this.producerOutputBuffers) {
      if (!buffer) continue;
      producerOutputBuffers.push({ id, buffer: { ...buffer } });
    }

    const processorReservations: Array<{ id: BuildingId; reservations: readonly ProcessorReservation[] }> = [];
    for (const [id, reservations] of this.processorReservations) {
      processorReservations.push({
        id,
        reservations: reservations.map((reservation) => ({ ...reservation })),
      });
    }

    return {
      version: SERIALIZE_VERSION,
      mapSeed: this.mapSeed,
      gameMode: this.gameMode,
      grid: this.grid.serialize(),
      buildings: this.buildings.serialize(),
      connections: this.connections.serialize(),
      energyLinks,
      simulationTime: this.simulationTime,
      batteryCharges,
      processorStates,
      storageInventories,
      producerOutputBuffers,
      processorReservations,
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
      gameMode: resolveGameMode(snapshot.gameMode),
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
        if (isStorageTypeId(building.typeId)) {
          engine.storageInventories.set(buildingId, GameEngine.EMPTY_RESOURCE_STOCK());
        }
        if (building.typeId === EXTRACTOR_BUILDING_TYPE_ID || isProcessorTypeId(building.typeId)) {
          engine.producerOutputBuffers.set(buildingId, null);
        }
        if (isProcessorTypeId(building.typeId)) {
          engine.processorStates.set(buildingId, { recipeId: null, cycleProgress: 0 });
        }
      }
    }
    for (const link of snapshot.energyLinks ?? []) {
      if (engine.buildings.get(link.a) && engine.buildings.get(link.b)) {
        engine.energyNetwork.connect(link.a, link.b);
      }
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

    // Restore processor states from snapshot
    for (const entry of snapshot.processorStates ?? []) {
      if (engine.processorStates.has(entry.id)) {
        engine.processorStates.set(entry.id, {
          recipeId: entry.recipeId,
          cycleProgress: entry.cycleProgress,
        });
      }
    }

    for (const entry of snapshot.storageInventories ?? []) {
      if (engine.storageInventories.has(entry.id)) {
        engine.storageInventories.set(entry.id, { ...GameEngine.EMPTY_RESOURCE_STOCK(), ...entry.inventory });
      }
    }

    for (const entry of snapshot.producerOutputBuffers ?? []) {
      if (engine.producerOutputBuffers.has(entry.id)) {
        engine.producerOutputBuffers.set(entry.id, { ...entry.buffer });
      }
    }

    for (const entry of snapshot.processorReservations ?? []) {
      if (engine.processorStates.has(entry.id)) {
        engine.processorReservations.set(entry.id, entry.reservations.map((reservation) => ({ ...reservation })));
      }
    }

    // Backward compatibility: old saves have no fog data — reveal default area
    if (!engine.grid.hasAnyRevealed()) {
      engine.grid.revealCircle(MAP_CENTER.x, MAP_CENTER.y, INITIAL_FOG_REVEAL_RADIUS);
    }

    engine.syncPowerState(false);

    return engine;
  }

  getViewportSnapshot(): ViewportSnapshot {
    return this.viewport.getSnapshot();
  }

  private isProcessorIdle(buildingId: BuildingId, state: ProcessorState): boolean {
    return (
      state.cycleProgress === 0 &&
      !this.producerOutputBuffers.get(buildingId) &&
      (this.processorReservations.get(buildingId)?.length ?? 0) === 0
    );
  }

  private hasValidDownstream(buildingId: BuildingId): boolean {
    const building = this.buildings.get(buildingId);
    if (!building) return false;
    const type = getBuildingType(building.typeId);
    const outputPort = type?.ports.find((port) => port.kind === PortKind.Output);
    if (!outputPort) return false;
    return resolveDownstreamTerminalFromOutput(this, buildingId, outputPort.id) !== null;
  }

  private flushProducerOutput(buildingId: BuildingId): boolean {
    const buffer = this.producerOutputBuffers.get(buildingId);
    if (!buffer) return false;

    const building = this.buildings.get(buildingId);
    if (!building) return false;
    const type = getBuildingType(building.typeId);
    const outputPort = type?.ports.find((port) => port.kind === PortKind.Output);
    if (!outputPort) return false;

    const terminal = resolveDownstreamTerminalFromOutput(this, buildingId, outputPort.id);
    if (!terminal || terminal.kind !== 'storage') return false;

    const inventory = this.storageInventories.get(terminal.buildingId);
    const key = RESOURCE_STOCK_KEY[buffer.resourceType];
    if (!inventory || !key) return false;

    inventory[key] += buffer.amount;
    this.producerOutputBuffers.set(buildingId, null);
    return true;
  }

  private reserveProcessorInputs(
    buildingId: BuildingId,
    inputs: readonly { readonly resourceType: ResourceTypeT; readonly amount: number }[],
  ): readonly ProcessorReservation[] | null {
    const logistics = this.getProcessorLogisticsStatus(buildingId);
    if (!logistics || logistics.badInput || logistics.missingInput || logistics.blockedOutput) {
      return null;
    }

    const reservations: ProcessorReservation[] = [];
    const usedProviders = new Set<BuildingId>();

    for (const assignment of logistics.assignments) {
      const input = inputs.find((entry) => entry.resourceType === assignment.requiredResourceType);
      if (!input) return null;

      const providers = this.resolveReachableProviders(buildingId, assignment.portId)
        .filter((providerId) => !usedProviders.has(providerId))
        .filter((providerId) => this.getProducerOutputBuffer(providerId)?.resourceType === assignment.requiredResourceType);

      if (providers.length < input.amount) return null;

      for (let index = 0; index < input.amount; index += 1) {
        const providerId = providers[index]!;
        const buffer = this.producerOutputBuffers.get(providerId);
        if (!buffer || buffer.amount <= 0) return null;
        this.producerOutputBuffers.set(providerId, null);
        usedProviders.add(providerId);
        reservations.push({
          resourceType: assignment.requiredResourceType,
          providerId,
          inputPortId: assignment.portId,
        });
      }
    }

    return reservations;
  }

  private resolveReachableProviders(buildingId: BuildingId, portId: PortId): BuildingId[] {
    const visited = new Set<BuildingId>();
    const queue = this
      .getConnectionsOf(buildingId)
      .filter((connection) => connection.to.building === buildingId && connection.to.port === portId)
      .map((connection) => connection.from.building);
    const providers: BuildingId[] = [];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);
      const building = this.buildings.get(currentId);
      if (!building) continue;
      if (building.typeId === EXTRACTOR_BUILDING_TYPE_ID || isProcessorTypeId(building.typeId)) {
        providers.push(currentId);
        continue;
      }
      if (isStorageTypeId(building.typeId)) continue;
      for (const connection of this.getConnectionsOf(currentId)) {
        if (connection.to.building !== currentId) continue;
        queue.push(connection.from.building);
      }
    }

    providers.sort((a, b) => a - b);
    return providers;
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

  /**
   * Refresh which consumers are powered. Returns true when any consumer gained
   * or lost power since the last sync, so time-driven changes (nightfall, a
   * battery running dry) can be reported to the views.
   */
  private syncPowerState(emitSfx = true): boolean {
    const nextExtractors = new Set<BuildingId>();
    const nextConsumers = new Set<BuildingId>();
    for (const [id, building] of this.buildings.getAll().entries()) {
      if (this.getBuildingPowerState(id) !== 'powered') continue;
      nextConsumers.add(id);
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;
      nextExtractors.add(id);
      if (emitSfx && !this.poweredExtractors.has(id)) {
        this.publishSfx({ type: 'extractor_on' });
      }
    }

    let changed = nextConsumers.size !== this.poweredConsumers.size;
    if (!changed) {
      for (const id of nextConsumers) {
        if (!this.poweredConsumers.has(id)) {
          changed = true;
          break;
        }
      }
    }

    this.poweredExtractors.clear();
    for (const id of nextExtractors) this.poweredExtractors.add(id);
    this.poweredConsumers.clear();
    for (const id of nextConsumers) this.poweredConsumers.add(id);
    return changed;
  }

  private notify(kind: GameEngineChangeKind): void {
    if (this.notificationSuspendDepth > 0) {
      if (kind === 'world') this.hasPendingWorldNotification = true;
      else this.hasPendingViewportNotification = true;
      return;
    }
    this.notifyListeners(kind);
  }

  private notifyListeners(kind: GameEngineChangeKind): void {
    for (const listener of this.listeners) {
      listener(kind);
    }
  }

  private publishSfx(event: GameSfxEvent): void {
    for (const listener of this.sfxListeners) {
      listener(event);
    }
  }
}
