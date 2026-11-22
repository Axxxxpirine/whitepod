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
  beltTierOf,
  beltTypeId,
  beltTypeIdInTier,
  getBuildingType,
  isBeltTypeId,
  type BeltTier,
  isProcessorTypeId,
  isStorageTypeId,
  validateCatalog,
  EXTRACTOR_MK2_RATE_PER_MIN,
  extractorRatePerMinute,
  isExtractorTypeId,
  CONVERTER_BUILDING_TYPE_ID,
  HUB_BUILDING_TYPE_ID,
} from '../data/buildingCatalog';
import { getRecipe, type RecipeId } from '../data/recipeCatalog';
import { DEFAULT_GAME_MODE, GameMode as GameModes, resolveGameMode, type GameMode } from '../data/gameMode';
import { clearHubSite, findHubOrigin } from '../campaign/hubPlacement';
import { CAMPAIGN_START_TIME, ensureStartingDeposits, STARTING_KIT } from '../campaign/campaignStart';
import {
  computeMilestoneProgress,
  consumeMilestoneRequirements,
  findActiveMilestone,
  type MilestoneProgress,
} from '../campaign/progression';
import { MILESTONES, STARTING_UNLOCKS, getMilestone, type Milestone, type MilestoneId } from '../data/milestoneCatalog';
import { computeUnlocks, findUnlockingMilestone, type UnlockKind, type UnlockState } from '../campaign/unlocks';
import { RESOURCE_STOCK_KEY } from '../data/resourceStock';
import { canAfford, costDifference, mergeCosts, missingFor, refund, spend } from '../economy/wallet';
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
  type BeltResult,
  type BeltRouteQuote,
  type BeltUpgradeQuote,
  type BuildingUpgradeQuote,
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
import { DAY_NIGHT_CYCLE_SECONDS, DEFAULT_MAP_SEED, INITIAL_FOG_REVEAL_RADIUS, MAP_CENTER, REVEALED_FLAG, WATCHTOWER_REVEAL_RADIUS } from '../constants';
import { isInBounds, toCoord, toIndex } from '../data/coords';
import { depositAmountAt } from '../data/depositAmounts';
import { screenToGrid } from './CoordinateTransform';
import { generateResources } from '../data/ResourceGenerator';
import { planBelt } from './BeltRouter';
import { EnergyNetwork } from '../systems/EnergyNetwork';
import { getDaylightFactor } from '../renderer/DayNightOverlayRenderer';
import { SOLAR_PANEL_BUILDING_TYPE_ID, WATCHTOWER_BUILDING_TYPE_ID } from '../data/buildingCatalog';
import type { GameSfxEvent, GameSfxListener } from '@/game/audio/sfxEvents';
import { BeltThroughput, type BeltRunStats } from '@/game/flow/beltThroughput';
import {
  resolveRoutesFromOutput,
  type FlowRoute,
  resolveProcessorLogisticsStatus,
  resolveUpstreamProvidersForInputPort,
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
  readonly simulationRemainder?: number;
  readonly extractionAccumulator?: number;
  readonly dayNightCycleSeconds?: number;
  readonly batteryCharges?: readonly { readonly id: BuildingId; readonly charge: number }[];
  readonly processorStates?: readonly { readonly id: BuildingId; readonly recipeId: RecipeId | null; readonly cycleProgress: number }[];
  readonly storageInventories?: readonly { readonly id: BuildingId; readonly inventory: ResourceInventory }[];
  readonly producerOutputBuffers?: readonly { readonly id: BuildingId; readonly buffer: ProducerOutputBuffer }[];
  readonly processorReservations?: readonly { readonly id: BuildingId; readonly reservations: readonly ProcessorReservation[] }[];
  /** Belt run token buckets (flow/beltThroughput.ts), by tail segment id. */
  readonly beltTokens?: readonly { readonly id: BuildingId; readonly tokens: number }[];
  /** Output each splitter serves next, as an index in catalog port order. */
  readonly splitterTurns?: readonly { readonly id: BuildingId; readonly turn: number }[];
  /**
   * Deposit model the grid amounts follow: absent for saves made while
   * deposits were endless (every tile 100), which get generated amounts on load.
   */
  readonly depositModel?: number;
  /** Extraction beats elapsed, so each extractor tier keeps its cadence across a reload. */
  readonly extractionBeat?: number;
  /** Seconds left in each fuel cell's current load. */
  readonly fuelBurn?: readonly { readonly id: BuildingId; readonly remaining: number }[];
  /** Completed campaign milestones; absent in saves written before milestones existed. */
  readonly completedMilestones?: readonly MilestoneId[];
}

export type MilestoneCompletedListener = (milestone: Milestone) => void;

interface GameEngineOptions {
  readonly grid?: TileGrid;
  readonly buildings?: BuildingRegistry;
  readonly connections?: ConnectionRegistry;
  readonly mapSeed?: number;
  readonly dayNightCycleSeconds?: number;
  readonly gameMode?: GameMode;
}

const SERIALIZE_VERSION = 3;
/** Finite deposits with generated amounts (data/depositAmounts.ts). */
const DEPOSIT_MODEL = 1;

interface SimulationNetwork {
  readonly consumers: BuildingId[];
  readonly batteries: BuildingId[];
  /** Produce only while burning fuel: added per tick by `fuelPower`. */
  readonly fuelCells: BuildingId[];
  readonly solar: number;
  readonly generation: number;
  readonly demand: number;
}

interface BatteryBuildingRef {
  readonly id: BuildingId;
  readonly charge: number;
  readonly capacity: number;
  readonly chargeRate: number;
  readonly dischargeRate: number;
}

export class GameEngine {
  // The clock, production and battery integration use identical quanta at any frame rate.
  private static readonly STEP_SECONDS = 0.1;
  /**
   * Extraction beat: the fastest extractor makes a unit every beat, slower
   * ones every few beats (60 / rate seconds), all on the same clock.
   */
  private static readonly EXTRACTION_INTERVAL_S = 60 / EXTRACTOR_MK2_RATE_PER_MIN;
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
  private stepTime = 0;
  private simulationRemainder = 0;
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
  /** Extraction beats since the world began, so each tier keeps its cadence. */
  private extractionBeat = 0;
  private readonly beltThroughput: BeltThroughput;
  /** Bumped when belts change type in place, which keeps the connections. */
  private beltTypeRevision = 0;
  private energyTopologyVersion = -1;
  private simulationNetworks: SimulationNetwork[] = [];
  private logisticsVersion = -1;
  /** Routes from a building output, by `id:port` (flow/processorLogistics resolveRoutesFromOutput). */
  private readonly routes = new Map<string, readonly FlowRoute[]>();
  /** Seconds left in each fuel cell's current load (0: waiting for fuel). */
  private readonly fuelBurn = new Map<BuildingId, number>();
  /** Index, in catalog port order, of the output each splitter serves next. */
  private readonly splitterTurns = new Map<BuildingId, number>();
  private readonly providersByPort = new Map<BuildingId, Map<PortId, readonly BuildingId[]>>();
  private readonly logisticsByProcessor = new Map<BuildingId, ProcessorLogisticsStatus | null>();
  private readonly poweredExtractors = new Set<BuildingId>();
  private readonly poweredConsumers = new Set<BuildingId>();
  private hubIdCache: BuildingId | null = null;
  private readonly completedMilestones = new Set<MilestoneId>();
  private readonly milestoneListeners = new Set<MilestoneCompletedListener>();
  /** Derived from `completedMilestones`; reset whenever that set changes. */
  private unlockCache: UnlockState | null = null;

  constructor(screenWidth: number, screenHeight: number, options: GameEngineOptions = {}) {
    validateCatalog();
    this.grid = options.grid ?? new TileGrid();
    this.grid.setOnChange(() => {
      this.logisticsByProcessor.clear();
      this.providersByPort.clear();
      this.notify('world');
    });
    this.viewport = new Viewport(screenWidth, screenHeight, () => this.notify('viewport'));
    this.buildings = options.buildings ?? new BuildingRegistry();
    this.connections = options.connections ?? new ConnectionRegistry();
    this.beltThroughput = new BeltThroughput({
      topologyKey: () => `${this.connections.version}:${this.beltTypeRevision}`,
      getBuilding: (id) => this.buildings.get(id) ?? undefined,
      getBuildings: () => this.buildings.getAll(),
      getConnectionsOf: (id) => this.getConnectionsOf(id),
    });
    this.energyNetwork = new EnergyNetwork();
    this.mapSeed = options.mapSeed ?? DEFAULT_MAP_SEED;
    this.gameMode = options.gameMode ?? DEFAULT_GAME_MODE;
    this.dayNightCycleSeconds =
      typeof options.dayNightCycleSeconds === 'number' && Number.isFinite(options.dayNightCycleSeconds) && options.dayNightCycleSeconds > 0
        ? options.dayNightCycleSeconds
        : DAY_NIGHT_CYCLE_SECONDS;
  }

  get simulationTime(): number {
    return (this.stepTime + this.simulationRemainder / this.dayNightCycleSeconds) % 1;
  }

  set simulationTime(value: number) {
    this.setSimulationTime(value);
  }

  setSimulationTime(value: number): void {
    const stepTime = value - this.simulationRemainder / this.dayNightCycleSeconds;
    this.stepTime = ((stepTime % 1) + 1) % 1;
    if (this.syncPowerState()) this.notify('world');
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

  update(dt: number, { emitSfx = true }: { emitSfx?: boolean } = {}): void {
    if (!Number.isFinite(dt) || dt <= 0) return;

    const step = GameEngine.STEP_SECONDS;
    const accumulated = this.simulationRemainder + dt;
    // Absorb roundoff when repeated frame deltas land exactly on a tick.
    const ticks = Math.floor((accumulated + 1e-10) / step);
    this.simulationRemainder = 0;
    for (let tick = 0; tick < ticks; tick++) {
      this.stepTime = ((this.stepTime + step / this.dayNightCycleSeconds) % 1 + 1) % 1;
      this.beltThroughput.refill(step);
      let powerChanged = this.syncPowerState(emitSfx);
      // Advance work already supplied during this interval before the next extraction arrives.
      this.processProcessors(step);
      if (this.fuelBurn.size > 0 && this.processFuelCells(step)) powerChanged = this.syncPowerState(emitSfx) || powerChanged;
      this.extractionAccumulator += step;
      if (this.extractionAccumulator + 1e-10 >= GameEngine.EXTRACTION_INTERVAL_S) {
        this.extractionAccumulator = Math.max(0, this.extractionAccumulator - GameEngine.EXTRACTION_INTERVAL_S);
        this.extractionBeat++;
        this.processExtraction();
      }
      if (this.batteryCharges.size > 0) {
        this.updateBatteries(step);
        powerChanged = this.syncPowerState(emitSfx) || powerChanged;
      }
      if (powerChanged) this.notify('world');
    }
    this.simulationRemainder = Math.max(0, accumulated - ticks * step);
  }

  private processExtraction(): void {
    let changed = false;
    // By id, so which extractor a saturated belt lets through never depends on insertion order.
    for (const id of [...this.poweredExtractors].sort((a, b) => a - b)) {
      if (!this.releaseHeldOutput(id)) continue;
      const { x, y } = this.buildings.get(id)!.origin;
      const idx = toIndex(x, y);
      const resourceType = this.grid.resourceType[idx] as ResourceTypeT;
      if (resourceType === ResourceType.None) continue;
      // An exhausted deposit stops its extractor; sandbox deposits never run out.
      if (this.grid.resourceAmount[idx] === 0) continue;
      // Slower tiers make a unit every few beats (a held unit above is still released every beat).
      const beatsPerUnit = Math.max(1, Math.round(60 / extractorRatePerMinute(this.buildings.get(id)!.typeId) / GameEngine.EXTRACTION_INTERVAL_S));
      if (this.extractionBeat % beatsPerUnit !== 0) continue;
      if (this.depletesDeposits) this.grid.resourceAmount[idx] -= 1;
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
      if (!this.poweredConsumers.has(id)) continue;
      if (!this.releaseHeldOutput(id)) continue;
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
      if (state.cycleProgress + 1e-10 >= recipe.cycleSeconds) {
        state.cycleProgress = 0;
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
    if (!this.isProcessorIdle(buildingId)) return false;

    if (recipeId !== null) {
      const recipe = getRecipe(recipeId);
      if (!recipe) return false;
      const expectedBuilding = building.typeId === CONVERTER_BUILDING_TYPE_ID ? 'converter' : 'synthesizer';
      if (recipe.building !== expectedBuilding) return false;
      if (!this.isRecipeUnlocked(recipeId)) return false;
    }

    this.logisticsByProcessor.clear();
    this.providersByPort.clear();
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
    const daylight = getDaylightFactor(this.stepTime);
    for (const network of this.getSimulationNetworks()) {
      if (network.batteries.length === 0) continue;
      const netPower = network.generation + network.solar * daylight + this.fuelPower(network) - network.demand;
      const batteries = this.collectBatteries(network.batteries);

      if (netPower > 0) {
        this.distributeBatteryCharge(batteries, netPower, dtHours);
      } else if (netPower < 0 && this.getNetworkDischargeRate(network.batteries) >= -netPower) {
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
    if (!this.isBuildingUnlocked(typeId)) return { ok: false, reason: 'locked' };
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
      if (isExtractorTypeId(typeId) || isProcessorTypeId(typeId)) {
        this.producerOutputBuffers.set(id, null);
      }
      if (isProcessorTypeId(typeId)) {
        this.processorStates.set(id, { recipeId: null, cycleProgress: 0 });
      }
      if (type.fuel) this.fuelBurn.set(id, 0);
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
    this.poweredConsumers.delete(id);
    this.poweredExtractors.delete(id);
    this.batteryCharges.delete(id);
    this.splitterTurns.delete(id);
    this.fuelBurn.delete(id);
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
    if (isExtractorTypeId(building.typeId)) {
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
    this.refreshLogisticsCache();
    if (!this.logisticsByProcessor.has(buildingId)) {
      this.logisticsByProcessor.set(buildingId, resolveProcessorLogisticsStatus(this, buildingId));
    }
    return this.logisticsByProcessor.get(buildingId) ?? null;
  }

  getBuildingTypeDefinition(typeId: BuildingTypeId) {
    return getBuildingType(typeId);
  }

  /**
   * How fast the stock grows: what reaches storages per minute. Machines and
   * fuel cells pull straight from the producers before them, so a unit headed
   * for one never counts; a machine counts by what it sends on to a storage.
   */
  getResourceRates(): ResourceStock {
    const rates = GameEngine.EMPTY_RESOURCE_STOCK();
    // What each source would send, then what the belts let through.
    const nominal = new Map<BuildingId, number>();
    const output = new Map<BuildingId, ResourceTypeT>();

    for (const [id, building] of this.buildings.getAll().entries()) {
      if (!isExtractorTypeId(building.typeId)) continue;
      if (this.getBuildingPowerState(id) !== 'powered') continue;
      if (this.getDepositRemaining(id) === 0) continue;
      nominal.set(id, extractorRatePerMinute(building.typeId));
      output.set(id, this.grid.getResource(building.origin.x, building.origin.y));
    }

    for (const [id, state] of this.processorStates) {
      if (!state.recipeId) continue;
      if (this.getBuildingPowerState(id) !== 'powered') continue;
      const logistics = this.getProcessorLogisticsStatus(id);
      if (!logistics || logistics.badInput || logistics.missingInput || logistics.blockedOutput) continue;
      const recipe = getRecipe(state.recipeId);
      if (!recipe) continue;
      nominal.set(id, (recipe.output.amount / recipe.cycleSeconds) * 60);
      output.set(id, recipe.output.resourceType);
    }

    // A producer behind splitters shares its output evenly among its routes;
    // only the share headed for a storage adds to the stock.
    const flows: { readonly producer: BuildingId; readonly path: readonly BuildingId[]; readonly perMinute: number }[] = [];
    for (const [producer, perMinute] of nominal) {
      const routes = this.producerRoutes(producer);
      for (const route of routes) {
        if (route.terminal.kind === 'storage') flows.push({ producer, path: route.nodes, perMinute: perMinute / routes.length });
      }
    }
    this.beltThroughput.cappedRates(flows).forEach((perMinute, index) => {
      const key = RESOURCE_STOCK_KEY[output.get(flows[index]!.producer)!];
      if (key) rates[key] += perMinute;
    });

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

  canPlaceBelt(from: PortEndpoint, to: PortEndpoint, tier: BeltTier = 'basic'): BeltResult {
    const quote = this.quoteBelt(from, to, tier);
    if (!quote.ok) return quote;
    if (quote.missing.length > 0) return { ok: false, reason: 'insufficient_resources' };
    return { ok: true, plan: quote.plan };
  }

  /**
   * Plans a belt route and prices it without refusing it for cost, so the
   * preview can show an unaffordable route and what it lacks.
   */
  quoteBelt(from: PortEndpoint, to: PortEndpoint, tier: BeltTier = 'basic'): BeltRouteQuote {
    if (!this.isBuildingUnlocked(beltTypeId(tier, 'straight'))) return { ok: false, reason: 'locked' };
    const planned = planBelt(this, from, to, tier);
    if (!planned.ok) return planned;
    const cost = this.getBeltRouteCost(planned.plan.segments);
    return { ok: true, plan: planned.plan, cost, missing: this.getMissingResources(cost) };
  }

  /**
   * Prices turning the belt route of `segmentId` (every segment `removeBelt`
   * would remove) into `tier`: the player pays the difference with the
   * segments it replaces, which are refunded.
   */
  quoteBeltUpgrade(segmentId: BuildingId, tier: BeltTier): BeltUpgradeQuote {
    const building = this.buildings.get(segmentId);
    if (!building || !isBeltTypeId(building.typeId)) return { ok: false, reason: 'unknown_building' };
    if (!this.isBuildingUnlocked(beltTypeId(tier, 'straight'))) return { ok: false, reason: 'locked' };
    const segments = this.collectConnectedBeltComponent(segmentId).filter(
      (id) => beltTierOf(this.buildings.get(id)!.typeId) !== tier,
    );
    if (segments.length === 0) return { ok: false, reason: 'already_tier' };
    const pay = mergeCosts(segments.map((id) => this.getBuildingCost(beltTypeIdInTier(this.buildings.get(id)!.typeId, tier)!)));
    const refund = mergeCosts(segments.map((id) => this.getBuildingCost(this.buildings.get(id)!.typeId)));
    const net = costDifference(pay, refund);
    return { ok: true, segments, net, refund: costDifference(refund, pay), missing: this.getMissingResources(net) };
  }

  /** The building on `tile` that can be upgraded into `typeId` (its catalog `upgradesTo`), if any. */
  upgradableBuildingAt(tile: TileCoord, typeId: BuildingTypeId): BuildingId | null {
    const building = this.getBuildingAt(tile.x, tile.y);
    return building && getBuildingType(building.typeId)?.upgradesTo === typeId ? building.id : null;
  }

  /**
   * Prices upgrading `buildingId` into `typeId` in place: the player pays the
   * new building minus the refund of the old one (`net`), and gets back what
   * the new one needs less of (`refund`).
   */
  quoteBuildingUpgrade(buildingId: BuildingId, typeId: BuildingTypeId): BuildingUpgradeQuote {
    const building = this.buildings.get(buildingId);
    if (!building) return { ok: false, reason: 'unknown_building' };
    if (getBuildingType(building.typeId)?.upgradesTo !== typeId) return { ok: false, reason: 'not_upgradable' };
    if (!this.isBuildingUnlocked(typeId)) return { ok: false, reason: 'locked' };
    const pay = this.getBuildingCost(typeId);
    const refund = this.getBuildingCost(building.typeId);
    const net = costDifference(pay, refund);
    return { ok: true, net, refund: costDifference(refund, pay), missing: this.getMissingResources(net) };
  }

  /** Upgrades a building in place: same id, tile, belts and power links; only its type and cost change. */
  upgradeBuilding(buildingId: BuildingId, typeId: BuildingTypeId): boolean {
    const quote = this.quoteBuildingUpgrade(buildingId, typeId);
    if (!quote.ok || quote.missing.length > 0) {
      const reason = quote.ok ? 'insufficient_resources' : quote.reason === 'locked' ? 'locked' : null;
      if (reason) this.publishSfx({ type: 'building_place_fail', buildingType: typeId, reason });
      return false;
    }
    this.spendFromWallet(quote.net);
    this.refundToWallet(quote.refund);
    this.buildings.retype(buildingId, typeId);
    // Power demand changed with the type: rebuild the cached networks.
    this.energyTopologyVersion = -1;
    this.syncPowerState(false);
    this.notify('world');
    this.emitAction('upgrade_building', { buildingId, typeId });
    this.publishSfx({ type: 'building_place_success', buildingType: typeId });
    return true;
  }

  /** Upgrades the belt route of `segmentId` to `tier` in place: same ids, same connections. */
  upgradeBelt(segmentId: BuildingId, tier: BeltTier): boolean {
    const quote = this.quoteBeltUpgrade(segmentId, tier);
    if (!quote.ok || quote.missing.length > 0) {
      const reason = quote.ok ? 'insufficient_resources' : quote.reason;
      if (reason === 'insufficient_resources' || reason === 'locked') this.publishSfx({ type: 'belt_place_fail', reason });
      return false;
    }
    this.spendFromWallet(quote.net);
    this.refundToWallet(quote.refund);
    for (const id of quote.segments) {
      this.buildings.retype(id, beltTypeIdInTier(this.buildings.get(id)!.typeId, tier)!);
    }
    this.beltTypeRevision++;
    this.notify('world');
    this.emitAction('upgrade_belt', { segmentId, tier, segmentCount: quote.segments.length });
    this.publishSfx({ type: 'belt_place_success', segmentCount: quote.segments.length });
    return true;
  }

  /** Total cost of a planned belt route (one segment cost per tile). */
  getBeltRouteCost(segments: readonly { readonly typeId: BuildingTypeId }[]): ResourceCost[] {
    return mergeCosts(segments.map((segment) => this.getBuildingCost(segment.typeId)));
  }

  placeBelt(from: PortEndpoint, to: PortEndpoint, tier: BeltTier = 'basic'): PlaceBeltResult {
    const planned = this.canPlaceBelt(from, to, tier);
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

  /** Capacity and saturation of the belt run `segmentId` belongs to, or null for a non-belt. */
  getBeltRunStats(segmentId: BuildingId): BeltRunStats | null {
    return this.beltThroughput.statsFor(segmentId);
  }

  /** Belt segments on runs that refused a unit in the last few seconds. */
  getSaturatedBeltSegments(): readonly BuildingId[] {
    return this.beltThroughput.saturatedSegments();
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

  /** True when extraction uses up deposits (campaign); sandbox deposits are endless. */
  get depletesDeposits(): boolean {
    return this.gameMode === GameModes.Campaign;
  }

  /** Seconds left in a fuel cell's current load (0 when out of fuel), or null for another building. */
  getFuelBurnRemaining(buildingId: BuildingId): number | null {
    return this.fuelBurn.get(buildingId) ?? null;
  }

  /** Units left in the deposit under an extractor, or null for another building. */
  getDepositRemaining(buildingId: BuildingId): number | null {
    const building = this.buildings.get(buildingId);
    if (!building || !isExtractorTypeId(building.typeId)) return null;
    return this.grid.getResourceAmount(building.origin.x, building.origin.y);
  }

  /** Cost the player pays for one building of this type: empty in sandbox. */
  getBuildingCost(typeId: BuildingTypeId): readonly ResourceCost[] {
    if (!this.chargesConstruction) return [];
    return getBuildingType(typeId)?.cost ?? [];
  }

  canAfford(cost: readonly ResourceCost[]): boolean {
    return cost.length === 0 || canAfford(this.walletInventories(), cost);
  }

  /** What the global stock lacks to pay `cost`, per resource (empty when affordable). */
  getMissingResources(cost: readonly ResourceCost[]): ResourceCost[] {
    return cost.length === 0 ? [] : missingFor(this.walletInventories(), cost);
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

  /** Completed milestones in completion order (empty in sandbox). */
  getCompletedMilestoneIds(): readonly MilestoneId[] {
    return [...this.completedMilestones];
  }

  /** The milestone the hub currently requests, or null in sandbox and once the campaign is done. */
  getActiveMilestone(): Milestone | null {
    if (this.gameMode !== GameModes.Campaign) return null;
    return findActiveMilestone(MILESTONES, this.completedMilestones);
  }

  /** Progress of the active milestone against the hub inventory, or null when there is none. */
  getMilestoneProgress(): MilestoneProgress | null {
    const milestone = this.getActiveMilestone();
    const hubId = this.getHubId();
    if (!milestone || hubId === null) return null;
    return computeMilestoneProgress(milestone, this.storageInventories.get(hubId)!);
  }

  /**
   * Player confirmation: consumes the active milestone requirements from the
   * hub and marks it completed. Returns false (nothing changes) when it is not
   * ready, so the player keeps the choice between building now or completing.
   */
  completeActiveMilestone(): boolean {
    const milestone = this.getActiveMilestone();
    const hubId = this.getHubId();
    if (!milestone || hubId === null) return false;
    if (!consumeMilestoneRequirements(milestone, this.storageInventories.get(hubId)!)) return false;
    this.completedMilestones.add(milestone.id);
    this.unlockCache = null;
    this.notify('world');
    this.emitAction('complete_milestone', { id: milestone.id });
    for (const listener of this.milestoneListeners) listener(milestone);
    return true;
  }

  private getUnlocks(): UnlockState {
    this.unlockCache ??= computeUnlocks(MILESTONES, this.completedMilestones, STARTING_UNLOCKS);
    return this.unlockCache;
  }

  /** True when the player may build this type: always in sandbox, unlocked content only in campaign. */
  isBuildingUnlocked(typeId: BuildingTypeId): boolean {
    if (this.gameMode !== GameModes.Campaign) return true;
    return this.getUnlocks().buildings.has(typeId);
  }

  /** True when processors may run this recipe: always in sandbox, unlocked recipes only in campaign. */
  isRecipeUnlocked(recipeId: RecipeId): boolean {
    if (this.gameMode !== GameModes.Campaign) return true;
    return this.getUnlocks().recipes.has(recipeId);
  }

  /** The milestone that unlocks this content, or null when none does (starting or later-chapter content). */
  getUnlockingMilestone(kind: UnlockKind, id: BuildingTypeId | RecipeId): Milestone | null {
    return findUnlockingMilestone(MILESTONES, kind, id);
  }

  onMilestoneCompleted(listener: MilestoneCompletedListener): () => void {
    this.milestoneListeners.add(listener);
    return () => this.milestoneListeners.delete(listener);
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
    this.setSimulationTime(CAMPAIGN_START_TIME);
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
      simulationTime: this.stepTime,
      simulationRemainder: this.simulationRemainder,
      extractionAccumulator: this.extractionAccumulator,
      dayNightCycleSeconds: this.dayNightCycleSeconds,
      batteryCharges,
      processorStates,
      storageInventories,
      producerOutputBuffers,
      processorReservations,
      completedMilestones: [...this.completedMilestones],
      beltTokens: this.beltThroughput.serialize(),
      splitterTurns: [...this.splitterTurns].map(([id, turn]) => ({ id, turn })),
      depositModel: DEPOSIT_MODEL,
      extractionBeat: this.extractionBeat,
      fuelBurn: [...this.fuelBurn].map(([id, remaining]) => ({ id, remaining })),
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
      dayNightCycleSeconds: snapshot.dayNightCycleSeconds,
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
        if (isExtractorTypeId(building.typeId) || isProcessorTypeId(building.typeId)) {
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
      engine.stepTime = snapshot.simulationTime >= 0 && snapshot.simulationTime < 1
        ? snapshot.simulationTime
        : ((snapshot.simulationTime % 1) + 1) % 1;
    }
    const remainder = snapshot.simulationRemainder ?? 0;
    if (Number.isFinite(remainder) && remainder >= 0 && remainder < GameEngine.STEP_SECONDS) engine.simulationRemainder = remainder;
    const extraction = snapshot.extractionAccumulator ?? 0;
    if (Number.isFinite(extraction) && extraction >= 0 && extraction < GameEngine.EXTRACTION_INTERVAL_S) engine.extractionAccumulator = extraction;
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

    // Ids no longer in the catalog are dropped rather than failing the load.
    for (const id of snapshot.completedMilestones ?? []) {
      if (getMilestone(id)) engine.completedMilestones.add(id);
    }
    engine.unlockCache = null;
    engine.beltThroughput.restore(snapshot.beltTokens);
    if (Number.isInteger(snapshot.extractionBeat) && snapshot.extractionBeat! >= 0) engine.extractionBeat = snapshot.extractionBeat!;
    for (const [id, building] of engine.buildings.getAll()) {
      if (getBuildingType(building.typeId)?.fuel) engine.fuelBurn.set(id, 0);
    }
    for (const { id, remaining } of snapshot.fuelBurn ?? []) {
      if (engine.fuelBurn.has(id) && Number.isFinite(remaining) && remaining >= 0) engine.fuelBurn.set(id, remaining);
    }
    engine.syncPowerState(false);
    if (snapshot.depositModel !== DEPOSIT_MODEL) {
      // Saved while deposits were endless: give every remaining deposit its generated amount.
      const { grid } = engine;
      for (let index = 0; index < grid.resourceType.length; index++) {
        if (grid.resourceType[index] === ResourceType.None) continue;
        const { x, y } = toCoord(index);
        grid.resourceAmount[index] = depositAmountAt(x, y, engine.mapSeed);
      }
    }
    for (const { id, turn } of snapshot.splitterTurns ?? []) {
      const outputs = engine.splitterOutputs(id).length;
      if (outputs > 0 && Number.isInteger(turn) && turn >= 0 && turn < outputs) engine.splitterTurns.set(id, turn);
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

  private isProcessorIdle(buildingId: BuildingId): boolean {
    return (
      !this.producerOutputBuffers.get(buildingId) &&
      (this.processorReservations.get(buildingId)?.length ?? 0) === 0
    );
  }

  private refreshLogisticsCache(): void {
    if (this.connections.version === this.logisticsVersion) return;
    this.logisticsVersion = this.connections.version;
    this.routes.clear();
    this.providersByPort.clear();
    this.logisticsByProcessor.clear();
  }

  private routesFrom(buildingId: BuildingId, portId: PortId): readonly FlowRoute[] {
    this.refreshLogisticsCache();
    const key = `${buildingId}:${portId}`;
    let routes = this.routes.get(key);
    if (!routes) {
      routes = resolveRoutesFromOutput(this, buildingId, portId);
      this.routes.set(key, routes);
    }
    return routes;
  }

  /** Every way a unit from this producer can go, through any splitter output. */
  private producerRoutes(buildingId: BuildingId): readonly FlowRoute[] {
    const building = this.buildings.get(buildingId);
    const outputPort = building && getBuildingType(building.typeId)?.ports.find((port) => port.kind === PortKind.Output);
    return outputPort ? this.routesFrom(buildingId, outputPort.id) : [];
  }

  /**
   * The route a producer's next unit takes: at each splitter, the output whose
   * turn it is, skipping outputs that cannot take a unit now. Null when no
   * output can (the unit waits with its producer).
   */
  private selectRoute(routes: readonly FlowRoute[]): FlowRoute | null {
    if (routes.length <= 1) return routes[0] ?? null;
    return routes.find((route) => route.choices.every((choice) => this.splitterTurnPort(choice.splitter) === choice.port)) ?? null;
  }

  private splitterOutputs(splitterId: BuildingId): readonly PortId[] {
    const building = this.buildings.get(splitterId);
    return (building ? getBuildingType(building.typeId)?.ports ?? [] : [])
      .filter((port) => port.kind === PortKind.Output)
      .map((port) => port.id);
  }

  /** The output a splitter serves now: its turn, or the next one able to take a unit. */
  private splitterTurnPort(splitterId: BuildingId): PortId | null {
    const outputs = this.splitterOutputs(splitterId);
    const start = this.splitterTurns.get(splitterId) ?? 0;
    for (let offset = 0; offset < outputs.length; offset++) {
      const port = outputs[(start + offset) % outputs.length]!;
      if (this.splitterOutputAccepts(splitterId, port)) return port;
    }
    return null;
  }

  /**
   * An output takes a unit when one of its routes leads to a storage with room
   * on the belts, or to a machine ready to pull its next inputs.
   */
  private splitterOutputAccepts(splitterId: BuildingId, portId: PortId): boolean {
    return this.routesFrom(splitterId, portId).some((route) =>
      route.terminal.kind === 'storage'
        ? this.beltThroughput.canPass([route.nodes])
        : this.processorReadyForInputs(route.terminal.buildingId),
    );
  }

  private processorReadyForInputs(buildingId: BuildingId): boolean {
    // A fuel cell wants its next load once the current one is burnt.
    if (this.fuelBurn.has(buildingId)) return (this.fuelBurn.get(buildingId) ?? 0) <= 1e-9;
    return (
      !!this.processorStates.get(buildingId)?.recipeId &&
      this.poweredConsumers.has(buildingId) &&
      this.isProcessorIdle(buildingId)
    );
  }

  /** After a unit went through, each splitter on its route moves its turn past the output used. */
  private advanceSplitters(route: FlowRoute): void {
    for (const { splitter, port } of route.choices) {
      const outputs = this.splitterOutputs(splitter);
      this.splitterTurns.set(splitter, (outputs.indexOf(port) + 1) % outputs.length);
    }
  }

  /**
   * True when the producer can make its next unit. A unit made while nothing
   * led to a storage (belt not built yet, or removed) is delivered as soon as
   * one does; one waiting for a processor stays put until the processor takes it.
   */
  private releaseHeldOutput(buildingId: BuildingId): boolean {
    if (!this.producerOutputBuffers.get(buildingId)) return true;
    if (!this.flushProducerOutput(buildingId)) return false;
    this.notify('world');
    return true;
  }

  private flushProducerOutput(buildingId: BuildingId): boolean {
    const buffer = this.producerOutputBuffers.get(buildingId);
    if (!buffer) return false;

    // A unit routed to a machine waits for the machine to pull it.
    const route = this.selectRoute(this.producerRoutes(buildingId));
    if (!route || route.terminal.kind !== 'storage') return false;

    const inventory = this.storageInventories.get(route.terminal.buildingId);
    const key = RESOURCE_STOCK_KEY[buffer.resourceType];
    if (!inventory || !key) return false;
    if (!this.beltThroughput.tryPass([route.nodes])) return false;

    inventory[key] += buffer.amount;
    this.producerOutputBuffers.set(buildingId, null);
    this.advanceSplitters(route);
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
    const routes: FlowRoute[] = [];
    const usedProviders = new Set<BuildingId>();
    // A provider behind a splitter serves this input only when the splitter's turn routes it here.
    const routeHere = (providerId: BuildingId, portId: PortId): FlowRoute | null => {
      const route = this.selectRoute(this.producerRoutes(providerId));
      return route?.terminal.kind === 'processor' && route.terminal.buildingId === buildingId && route.terminal.portId === portId
        ? route
        : null;
    };

    for (const assignment of logistics.assignments) {
      const input = inputs.find((entry) => entry.resourceType === assignment.requiredResourceType);
      if (!input) return null;

      const providers = this.resolveReachableProviders(buildingId, assignment.portId)
        .filter((providerId) => !usedProviders.has(providerId))
        .filter((providerId) => this.getProducerOutputBuffer(providerId)?.resourceType === assignment.requiredResourceType)
        .filter((providerId) => routeHere(providerId, assignment.portId) !== null);

      if (providers.length < input.amount) return null;

      for (let index = 0; index < input.amount; index += 1) {
        const providerId = providers[index]!;
        const buffer = this.producerOutputBuffers.get(providerId);
        if (!buffer || buffer.amount <= 0) return null;
        usedProviders.add(providerId);
        routes.push(routeHere(providerId, assignment.portId)!);
        reservations.push({
          resourceType: assignment.requiredResourceType,
          providerId,
          inputPortId: assignment.portId,
        });
      }
    }

    // The belts between the providers and this processor must have room for every unit.
    if (!this.beltThroughput.tryPass(routes.map((route) => route.nodes))) return null;
    // Commit only once all inputs are available. An empty second port must leave the first intact.
    for (const { providerId } of reservations) this.producerOutputBuffers.set(providerId, null);
    for (const route of routes) this.advanceSplitters(route);
    return reservations;
  }

  private resolveReachableProviders(buildingId: BuildingId, portId: PortId): readonly BuildingId[] {
    this.refreshLogisticsCache();
    let byPort = this.providersByPort.get(buildingId);
    if (!byPort) {
      byPort = new Map();
      this.providersByPort.set(buildingId, byPort);
    }
    const cached = byPort.get(portId);
    if (cached) return cached;
    const { reachableProviders } = resolveUpstreamProvidersForInputPort(this, buildingId, portId);
    byPort.set(portId, reachableProviders);
    return reachableProviders;
  }

  private computeEnergyBalance(buildingIds: readonly BuildingId[]): EnergyNetworkBalance {
    const network = this.describeEnergyNetwork(buildingIds);
    const production = network.generation + network.solar * getDaylightFactor(this.simulationTime) + this.fuelPower(network);
    return {
      buildingIds: [...buildingIds].sort((a, b) => a - b),
      production,
      consumption: network.demand,
      remaining: production - network.demand,
    };
  }

  private isEnergyLinkableBuilding(typeId: BuildingTypeId): boolean {
    const type = getBuildingType(typeId);
    if (type?.fuel) return true;
    if (!type?.energy) return false;
    return (type.energy.production ?? 0) > 0 || (type.energy.consumption ?? 0) > 0 || !!type.energy.battery;
  }

  /** Electrical topology is stable between edits, including during a long offline replay. */
  private getSimulationNetworks(): readonly SimulationNetwork[] {
    if (this.energyTopologyVersion === this.energyNetwork.version) return this.simulationNetworks;
    this.energyTopologyVersion = this.energyNetwork.version;
    this.simulationNetworks = [];
    for (const ids of this.energyNetwork.getComponents()) {
      const network = this.describeEnergyNetwork(ids);
      if (network.consumers.length || network.batteries.length || network.fuelCells.length) this.simulationNetworks.push(network);
    }
    return this.simulationNetworks;
  }

  private describeEnergyNetwork(ids: readonly BuildingId[]): SimulationNetwork {
    const consumers: BuildingId[] = [];
    const batteries: BuildingId[] = [];
    const fuelCells: BuildingId[] = [];
    let solar = 0;
    let generation = 0;
    let demand = 0;
    for (const id of ids) {
      const building = this.buildings.get(id);
      const type = building && getBuildingType(building.typeId);
      if (type?.fuel) fuelCells.push(id);
      const energy = type?.energy;
      if (!building || !energy) continue;
      if (energy.battery) batteries.push(id);
      if (energy.consumption) {
        consumers.push(id);
        demand += energy.consumption;
      }
      if (building.typeId === SOLAR_PANEL_BUILDING_TYPE_ID) solar += energy.production ?? 0;
      else generation += energy.production ?? 0;
    }
    return { consumers, batteries, fuelCells, solar, generation, demand };
  }

  /** Power the network's fuel cells give right now: those burning a load of fuel. */
  private fuelPower(network: SimulationNetwork): number {
    let power = 0;
    for (const id of network.fuelCells) {
      if ((this.fuelBurn.get(id) ?? 0) <= 0) continue;
      power += getBuildingType(this.buildings.get(id)!.typeId)?.fuel?.powerKw ?? 0;
    }
    return power;
  }

  /**
   * Fuel cells: each burns one load for `burnSeconds`, then pulls the next one
   * from its providers right away, so a fed cell gives steady power.
   */
  private processFuelCells(dt: number): boolean {
    let changed = false;
    for (const [id, remaining] of this.fuelBurn) {
      const left = Math.max(0, remaining - dt);
      this.fuelBurn.set(id, left);
      if (left > 1e-9) continue;
      const fuel = getBuildingType(this.buildings.get(id)!.typeId)?.fuel;
      if (!fuel || this.reserveProcessorInputs(id, fuel.inputs) === null) continue;
      this.fuelBurn.set(id, fuel.burnSeconds);
      changed = true;
    }
    return changed;
  }

  private syncPowerState(emitSfx = true): boolean {
    const daylight = getDaylightFactor(this.stepTime);
    let changed = false;
    for (const network of this.getSimulationNetworks()) {
      const deficit = network.demand - (network.generation + network.solar * daylight + this.fuelPower(network));
      const powered = deficit <= 0 || this.getNetworkDischargeRate(network.batteries) >= deficit;
      for (const id of network.consumers) {
        if (this.poweredConsumers.has(id) === powered) continue;
        changed = true;
        if (powered) {
          this.poweredConsumers.add(id);
          if (isExtractorTypeId(this.buildings.get(id)?.typeId ?? '')) {
            this.poweredExtractors.add(id);
            if (emitSfx) this.publishSfx({ type: 'extractor_on' });
          }
        } else {
          this.poweredConsumers.delete(id);
          this.poweredExtractors.delete(id);
        }
      }
    }
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
