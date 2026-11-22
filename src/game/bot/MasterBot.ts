import { GRID_HEIGHT, GRID_WIDTH } from '@/game/constants';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
  resourceTypeLabel,
} from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { Direction, PortKind, ResourceType, type BuildingId, type BuildingTypeId, type ResourceType as ResourceTypeT, type TileCoord } from '@/game/types';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { BotLifecycle, BotStatus } from './botTypes';
import { routeExtractorToStorage } from './util/beltRouting';
import { configureConnectedConverter, shouldConfigureProcessor } from './util/processorConfig';
import { calculateRequiredSolar, calculateRequiredBatteries } from './util/energyPlanning';
import { shouldThrottleExtractorPlacement } from './util/resourceAnalysis';

const MAX_ACTIONS_PER_TICK = 12;
/** Campaign: regolith kept in the hub before buying an extractor (its cost, a belt, a panel). */
const CAMPAIGN_EXTRACTOR_RESERVE = 40;

const RESOURCE_PRIORITY: Partial<Record<ResourceTypeT, number>> = {
  [ResourceType.None]: 0,
  [ResourceType.Regolith]: 1,
  [ResourceType.Hydrogen]: 2,
  [ResourceType.Oxygen]: 3,
};

interface StorageCluster {
  id: BuildingId;
  extractorCount: number;
  center: TileCoord;
  /** No free deposit left around it: a new cluster may open even below capacity. */
  exhausted?: boolean;
}

export class MasterBot implements BotLifecycle {
  private readonly engine: GameEngine;
  private readonly onStatusChange: (status: BotStatus) => void;
  private timerId: number | null = null;
  private active = false;
  private running = false;
  private spiralStep = 0;
  private storageClusters: StorageCluster[] = [];
  /** Campaign: rotations already tried on a deposit whose extractor could not be belted (by "x,y"). */
  private readonly routingAttempts = new Map<string, number>();
  private currentClusterIndex = 0;
  private status: BotStatus = { active: false, phase: 'booting', target: null };

  constructor(engine: GameEngine, onStatusChange: (status: BotStatus) => void) {
    this.engine = engine;
    this.onStatusChange = onStatusChange;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.setStatus({ active: true, phase: 'booting', target: 'scan' });
    this.tick();
    this.timerId = window.setInterval(() => this.tick(), 400);
  }

  stop(): void {
    this.active = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.setStatus({ active: false, phase: 'online', target: null });
  }

  private tick(): void {
    if (!this.active || this.running) return;
    this.running = true;

    try {
      const result = this.engine.runWithoutNotifications(() => this.runCycle());
      if (!result.didAct) {
        this.setStatus({ active: true, phase: 'online', target: this.describeTarget() });
      }
    } finally {
      this.running = false;
    }
  }

  private runCycle(): { didAct: boolean } {
    let didAct = false;

    for (let actions = 0; actions < MAX_ACTIONS_PER_TICK; actions++) {
      if (this.completeReadyMilestone()) {
        didAct = true;
        continue;
      }

      // Campaign: power what exists before buying more (construction is paid).
      if (this.engine.gameMode === GameMode.Campaign && (this.connectEnergyNetwork() || this.ensureEnergySupply())) {
        didAct = true;
        continue;
      }

      if (this.initializeStorageClusters()) {
        didAct = true;
        continue;
      }

      if (this.handleExplorationTrigger()) {
        didAct = true;
        continue;
      }

      if (this.placeExtractorNearCluster()) {
        didAct = true;
        continue;
      }

      if (this.createNewStorageCluster()) {
        didAct = true;
        continue;
      }

      if (this.routeExtractorsToStorage()) {
        didAct = true;
        continue;
      }

      if (this.configureProcessors()) {
        didAct = true;
        continue;
      }

      // Wire existing buildings before adding generators: an unlinked extractor
      // looks unpowered, and adding more panels or batteries never fixes that.
      if (this.connectEnergyNetwork()) {
        didAct = true;
        continue;
      }

      if (this.ensureEnergySupply()) {
        didAct = true;
        continue;
      }

      break;
    }

    return { didAct };
  }

  /** Campaign: confirm the active milestone as soon as the hub holds what it asks, like a player watching the panel. */
  private completeReadyMilestone(): boolean {
    if (this.engine.gameMode !== GameMode.Campaign) return false;
    const progress = this.engine.getMilestoneProgress();
    if (!progress?.ready || !this.engine.completeActiveMilestone()) return false;
    this.setStatus({ active: true, phase: 'milestone', target: progress.milestone.title });
    return true;
  }

  /** Campaign: what the active milestone still needs in the hub, so extraction goes there first. */
  private resourcesWanted(): ReadonlySet<ResourceTypeT> {
    const wanted = new Set<ResourceTypeT>();
    if (this.engine.gameMode !== GameMode.Campaign) return wanted;
    for (const requirement of this.engine.getMilestoneProgress()?.requirements ?? []) {
      if (requirement.available < requirement.required) wanted.add(requirement.resourceType);
    }
    return wanted;
  }

  private initializeStorageClusters(): boolean {
    if (this.storageClusters.length > 0) return false;

    // Campaign: the hub is the first cluster, so the first lines deliver what milestones count.
    const hubId = this.engine.getHubId();
    if (hubId !== null) {
      this.storageClusters.push({ id: hubId, extractorCount: 0, center: this.engine.getBuildings().get(hubId)!.origin });
      return false;
    }

    for (const [id, building] of this.engine.getBuildings()) {
      const type = getBuildingType(building.typeId);
      if (type?.id === STORAGE_BUILDING_TYPE_ID) {
        this.storageClusters.push({ id, extractorCount: 0, center: building.origin });
        return false;
      }
    }

    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);

    for (let y = centerY - 2; y <= centerY + 2; y++) {
      for (let x = centerX - 2; x <= centerX + 2; x++) {
        if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) continue;
        if (!this.engine.grid.isRevealed(x, y)) continue;
        if (!this.engine.canPlaceBuilding(STORAGE_BUILDING_TYPE_ID, { x, y }, Direction.North).ok) continue;

        const placedId = this.engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x, y }, Direction.North, { emitSfx: false });
        if (placedId !== null) {
          this.storageClusters.push({ id: placedId, extractorCount: 0, center: { x, y } });
          this.setStatus({ active: true, phase: 'booting', target: `storage @ ${x},${y}` });
          return true;
        }
      }
    }

    return false;
  }

  private handleExplorationTrigger(): boolean {
    if (!this.shouldTriggerExploration()) return false;

    const frontierPos = this.findFrontierWatchtowerPosition();
    if (!frontierPos) return false;

    if (!this.engine.canPlaceBuilding(WATCHTOWER_BUILDING_TYPE_ID, frontierPos, Direction.North).ok) {
      return false;
    }

    const placedId = this.engine.placeBuilding(WATCHTOWER_BUILDING_TYPE_ID, frontierPos, Direction.North, { emitSfx: false });
    if (placedId !== null) {
      this.setStatus({ active: true, phase: 'expanding', target: `tower @ ${frontierPos.x},${frontierPos.y}` });
      return true;
    }

    return false;
  }

  private shouldTriggerExploration(): boolean {
    const occupiedTiles = this.countOccupiedTiles();
    const revealedTiles = this.countRevealedTiles();

    if (revealedTiles === 0) return false;

    const ratio = occupiedTiles / revealedTiles;
    return ratio > 0.10;
  }

  private countOccupiedTiles(): number {
    const occupied = new Set<string>();

    for (const [, building] of this.engine.getBuildings()) {
      const type = getBuildingType(building.typeId);
      if (!type) continue;

      for (let dy = 0; dy < type.footprint.h; dy++) {
        for (let dx = 0; dx < type.footprint.w; dx++) {
          const tileX = building.origin.x + dx;
          const tileY = building.origin.y + dy;
          if (tileX >= 0 && tileX < GRID_WIDTH && tileY >= 0 && tileY < GRID_HEIGHT) {
            occupied.add(`${tileX},${tileY}`);
          }
        }
      }
    }

    return occupied.size;
  }

  private countRevealedTiles(): number {
    let count = 0;
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (this.engine.grid.isRevealed(x, y)) count++;
      }
    }
    return count;
  }

  private findFrontierWatchtowerPosition(): TileCoord | null {
    const frontierTiles: Array<{ x: number; y: number; distance: number }> = [];
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (!this.engine.grid.isRevealed(x, y)) continue;

        const hasUnrevealedNeighbor = [
          { x: x + 1, y },
          { x: x - 1, y },
          { x, y: y + 1 },
          { x, y: y - 1 },
        ].some((n) => {
          if (n.x < 0 || n.x >= GRID_WIDTH || n.y < 0 || n.y >= GRID_HEIGHT) return false;
          return !this.engine.grid.isRevealed(n.x, n.y);
        });

        if (hasUnrevealedNeighbor) {
          const distance = Math.abs(x - centerX) + Math.abs(y - centerY);
          frontierTiles.push({ x, y, distance });
        }
      }
    }

    if (frontierTiles.length === 0) return null;

    frontierTiles.sort((a, b) => b.distance - a.distance || a.x - b.x || a.y - b.y);

    return { x: frontierTiles[0]!.x, y: frontierTiles[0]!.y };
  }

  /**
   * Campaign: building is paid, so the bot finishes what it started (belts,
   * power) before buying another extractor; otherwise the kit goes into
   * extractors that never run.
   */
  private extractorsAwaitingSetup(): boolean {
    if (this.engine.gameMode !== GameMode.Campaign) return false;
    for (const [id, building] of this.engine.getBuildings()) {
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;
      if (this.engine.getConnectionsOf(id).length === 0) return true;
      if (this.engine.getBuildingPowerState(id) === 'unpowered' && this.getPeakProduction() < this.engine.getEnergyGlobalStats().demandedConsumption) return true;
    }
    return false;
  }

  private placeExtractorNearCluster(): boolean {
    if (this.storageClusters.length === 0) return false;
    if (this.extractorsAwaitingSetup()) return false;
    // Keep enough regolith for the extractor's belt and the panel it will need.
    if (this.engine.gameMode === GameMode.Campaign && (this.engine.getHubInventory()?.regolith ?? 0) < CAMPAIGN_EXTRACTOR_RESERVE) return false;

    const currentCluster = this.storageClusters[this.currentClusterIndex];
    if (!currentCluster) return false;

    const candidates = this.collectVisibleDepositsNearPoint(currentCluster.center, 8);
    if (candidates.length === 0) {
      // Campaign: nothing left to mine here, so let the next cluster open (sandbox keeps its 4-extractor rhythm).
      if (this.engine.gameMode === GameMode.Campaign) currentCluster.exhausted = true;
      this.currentClusterIndex = (this.currentClusterIndex + 1) % this.storageClusters.length;
      return false;
    }

    const target = candidates[0];
    if (!target) return false;

    if (shouldThrottleExtractorPlacement(this.engine, target.resource)) {
      return false;
    }

    // A deposit whose extractor could not be belted is retried facing another way.
    const rotation = ([Direction.North, Direction.East, Direction.South, Direction.West] as const)[this.routingAttempts.get(`${target.x},${target.y}`) ?? 0]!;
    const placement = this.engine.canPlaceBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: target.x, y: target.y }, rotation);
    if (!placement.ok) return false;

    const placedId = this.engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: target.x, y: target.y }, rotation, {
      emitSfx: false,
    });
    if (placedId === null) return false;

    currentCluster.extractorCount++;

    this.setStatus({
      active: true,
      phase: 'mining',
      target: `${resourceTypeLabel(target.resource)} @ ${target.x},${target.y}`,
    });
    return true;
  }

  private createNewStorageCluster(): boolean {
    const currentCluster = this.storageClusters[this.currentClusterIndex];
    if (!currentCluster) return false;

    if (currentCluster.extractorCount < this.clusterCapacity(currentCluster) && !currentCluster.exhausted) return false;
    if (this.extractorsAwaitingSetup()) return false;

    const anchor = this.calculateSpiralAnchor();
    const target = { x: anchor.x, y: anchor.y };

    // Campaign: a storage costs regolith, so only open one where there is something to mine.
    const worthIt = this.engine.gameMode !== GameMode.Campaign || this.collectVisibleDepositsNearPoint(target, 8).length > 0;
    if (!worthIt || !this.engine.canPlaceBuilding(STORAGE_BUILDING_TYPE_ID, target, Direction.North).ok) {
      this.spiralStep += 5;
      return false;
    }

    const placedId = this.engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, target, Direction.North, { emitSfx: false });
    if (placedId !== null) {
      this.storageClusters.push({ id: placedId, extractorCount: 0, center: target });
      this.currentClusterIndex = this.storageClusters.length - 1;
      this.spiralStep += 5;
      this.setStatus({ active: true, phase: 'booting', target: `new storage @ ${target.x},${target.y}` });
      return true;
    }

    return false;
  }

  /** Extractors a cluster takes: one per input of its storage (8 on the hub, 4 on a storage). */
  private clusterCapacity(cluster: StorageCluster): number {
    const building = this.engine.getBuildings().get(cluster.id);
    return building ? getBuildingType(building.typeId)?.ports.filter((port) => port.kind === PortKind.Input).length ?? 4 : 4;
  }

  private routeExtractorsToStorage(): boolean {
    if (this.storageClusters.length === 0) return false;

    for (const [id, building] of this.engine.getBuildings()) {
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;

      const type = getBuildingType(building.typeId);
      if (!type) continue;

      const nearestCluster = this.findNearestStorageCluster(building.origin);
      if (!nearestCluster) continue;

      const result = routeExtractorToStorage(this.engine, id, nearestCluster.id, {
        tryAllInputs: this.engine.gameMode === GameMode.Campaign,
      });
      if (result.success) {
        this.setStatus({ active: true, phase: 'logistics', target: `belt: extractor → storage` });
        return true;
      }
      // Campaign: an extractor no belt can reach would hold the bot back for good.
      // Take it back (refunded) and try the deposit facing another way, four times at most.
      if (this.engine.gameMode === GameMode.Campaign && result.error === 'belt_path_blocked' && this.engine.getConnectionsOf(id).length === 0) {
        const key = `${building.origin.x},${building.origin.y}`;
        this.routingAttempts.set(key, (this.routingAttempts.get(key) ?? 0) + 1);
        this.engine.removeBuilding(id, { emitSfx: false });
        const cluster = this.storageClusters.find((entry) => entry.id === nearestCluster.id);
        if (cluster) cluster.extractorCount = Math.max(0, cluster.extractorCount - 1);
        return true;
      }
    }

    return false;
  }

  private configureProcessors(): boolean {
    for (const [id, building] of this.engine.getBuildings()) {
      if (building.typeId !== CONVERTER_BUILDING_TYPE_ID || !shouldConfigureProcessor(this.engine, id)) continue;
      const recipeId = configureConnectedConverter(this.engine, id);
      if (recipeId) {
        this.setStatus({ active: true, phase: 'processing', target: `recipe: ${recipeId}` });
        return true;
      }
    }
    return false;
  }

  private ensureEnergySupply(): boolean {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    if (extractors.length === 0) return false;

    // Compare demand with full-sun output rather than current output, so the bot
    // neither stops at night nor overbuilds at dawn. Each panel raises the peak,
    // so this condition settles by itself.
    const solarPanels = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID);
    const targetSolar = calculateRequiredSolar(extractors.length);
    const { demandedConsumption } = this.engine.getEnergyGlobalStats();

    if (solarPanels.length < targetSolar || this.getPeakProduction() < demandedConsumption) {
      const anchor = this.calculateSpiralAnchor();
      const origin = this.findBestPlacement(SOLAR_PANEL_BUILDING_TYPE_ID, anchor);
      if (origin) {
        const placedId = this.engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, origin, Direction.North, { emitSfx: false });
        if (placedId !== null) {
          this.setStatus({ active: true, phase: 'powering', target: `solar @ ${origin.x},${origin.y}` });
          return true;
        }
      }
    }

    // Batteries only store energy: they never cure a deficit, so stop at the
    // target sized from consumption.
    const batteries = this.getBuildingsByType(BATTERY_BASIC_BUILDING_TYPE_ID);
    const targetBatteries = calculateRequiredBatteries(this.engine);

    if (batteries.length < targetBatteries) {
      const anchor = this.calculateSpiralAnchor();
      const origin = this.findBestPlacement(BATTERY_BASIC_BUILDING_TYPE_ID, anchor);
      if (origin) {
        const placedId = this.engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, origin, Direction.North, { emitSfx: false });
        if (placedId !== null) {
          this.setStatus({ active: true, phase: 'powering', target: `battery @ ${origin.x},${origin.y}` });
          return true;
        }
      }
    }

    return false;
  }

  /** Total generation under full sun, from the catalog. */
  private getPeakProduction(): number {
    let peak = 0;
    for (const building of this.engine.getBuildings().values()) {
      peak += getBuildingType(building.typeId)?.energy?.production ?? 0;
    }
    return peak;
  }

  private connectEnergyNetwork(): boolean {
    const nodes = this.getEnergyNodes();
    if (nodes.length < 2) return false;

    const hub = this.chooseEnergyHub(nodes);
    for (const node of nodes) {
      if (node.id === hub.id) continue;
      if (this.engine.areBuildingsEnergyLinked(hub.id, node.id)) continue;
      if (this.engine.connectBuildings(hub.id, node.id)) {
        this.setStatus({ active: true, phase: 'powering', target: `${hub.label} ↔ ${node.label}` });
        return true;
      }
    }

    return false;
  }

  private collectVisibleDepositsNearPoint(center: TileCoord, radius: number): Array<{ x: number; y: number; resource: ResourceTypeT; score: number }> {
    const deposits: Array<{ x: number; y: number; resource: ResourceTypeT; score: number }> = [];
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);
    const wanted = this.resourcesWanted();

    for (let y = Math.max(0, center.y - radius); y <= Math.min(GRID_HEIGHT - 1, center.y + radius); y++) {
      for (let x = Math.max(0, center.x - radius); x <= Math.min(GRID_WIDTH - 1, center.x + radius); x++) {
        const resource = this.engine.getResourceAt(x, y);
        if (resource === ResourceType.None) continue;
        if (!this.engine.grid.isRevealed(x, y)) continue;
        if (this.engine.getBuildingAt(x, y) !== null) continue;
        // Exhausted deposits (campaign) take no extractor.
        if (this.engine.grid.getResourceAmount(x, y) === 0) continue;
        if ((this.routingAttempts.get(`${x},${y}`) ?? 0) >= 4) continue;
        // Campaign: only what the active milestone asks, plus regolith to build with.
        if (this.engine.gameMode === GameMode.Campaign && !wanted.has(resource) && resource !== ResourceType.Regolith) continue;
        // What the active milestone asks comes before the usual priorities.
        const priority = (wanted.has(resource) ? 10 : 0) + (RESOURCE_PRIORITY[resource] ?? 0);
        deposits.push({
          x,
          y,
          resource,
          score: priority * 1000 - (Math.abs(x - centerX) + Math.abs(y - centerY)),
        });
      }
    }

    deposits.sort((left, right) => right.score - left.score || left.y - right.y || left.x - right.x);
    return deposits;
  }

  private findNearestStorageCluster(origin: TileCoord): { id: BuildingId; distance: number } | null {
    let nearest: { id: BuildingId; distance: number } | null = null;

    for (const cluster of this.storageClusters) {
      const distance = Math.abs(cluster.center.x - origin.x) + Math.abs(cluster.center.y - origin.y);
      if (!nearest || distance < nearest.distance) {
        nearest = { id: cluster.id, distance };
      }
    }

    return nearest;
  }

  private calculateSpiralAnchor(): TileCoord {
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);

    let x = 0;
    let y = 0;
    let dx = 0;
    let dy = -1;

    for (let index = 0; index < this.spiralStep; index++) {
      if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
        const prevDx = dx;
        dx = -dy;
        dy = prevDx;
      }
      x += dx;
      y += dy;
    }

    return { x: centerX + x, y: centerY + y };
  }

  private getBuildingsByType(typeId: BuildingTypeId): BuildingId[] {
    const ids: BuildingId[] = [];
    for (const [id, building] of this.engine.getBuildings()) {
      if (building.typeId === typeId) ids.push(id);
    }
    return ids;
  }

  private getEnergyNodes(): Array<{ id: BuildingId; label: string; priority: number }> {
    const nodes: Array<{ id: BuildingId; label: string; priority: number }> = [];
    for (const [id, building] of this.engine.getBuildings()) {
      const type = getBuildingType(building.typeId);
      if (!type?.energy) continue;
      nodes.push({
        id,
        label: type.name,
        priority: this.buildingPriority(building.typeId),
      });
    }
    return nodes;
  }

  private chooseEnergyHub(nodes: ReadonlyArray<{ id: BuildingId; label: string; priority: number }>): {
    id: BuildingId;
    label: string;
  } {
    const hub = [...nodes].sort((left, right) => right.priority - left.priority || left.id - right.id)[0]!;
    return { id: hub.id, label: hub.label };
  }

  private buildingPriority(typeId: BuildingTypeId): number {
    switch (typeId) {
      case BATTERY_BASIC_BUILDING_TYPE_ID:
        return 3;
      case SOLAR_PANEL_BUILDING_TYPE_ID:
        return 2;
      case EXTRACTOR_BUILDING_TYPE_ID:
        return 1;
      default:
        return 0;
    }
  }

  private findBestPlacement(typeId: BuildingTypeId, reference: TileCoord): TileCoord | null {
    let best: { x: number; y: number; score: number } | null = null;

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (!this.engine.canPlaceBuilding(typeId, { x, y }, Direction.North).ok) continue;

        const distance = Math.abs(x - reference.x) + Math.abs(y - reference.y);
        if (!best || distance < best.score || (distance === best.score && (y < best.y || (y === best.y && x < best.x)))) {
          best = { x, y, score: distance };
        }
      }
    }

    return best ? { x: best.x, y: best.y } : null;
  }

  private describeTarget(): string {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    const solarPanels = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID);
    return `clusters:${this.storageClusters.length} e${extractors.length} s${solarPanels.length}`;
  }

  private setStatus(status: BotStatus): void {
    if (
      this.status.active === status.active &&
      this.status.phase === status.phase &&
      this.status.target === status.target
    ) {
      return;
    }

    this.status = status;
    this.onStatusChange(status);
  }
}
