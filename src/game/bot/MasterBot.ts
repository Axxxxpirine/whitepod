import { GRID_HEIGHT, GRID_WIDTH } from '@/game/constants';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
  isProcessorTypeId,
  resourceTypeLabel,
} from '@/game/data/buildingCatalog';
import { Direction, ResourceType, type BuildingId, type BuildingTypeId, type ResourceType as ResourceTypeT, type TileCoord } from '@/game/types';
import type { GameEngine } from '@/game/engine/GameEngine';
import { getDaylightFactor } from '@/game/renderer/DayNightOverlayRenderer';
import type { BotLifecycle, BotStatus } from './botTypes';
import { routeExtractorToStorage } from './util/beltRouting';
import { configureConverterForResource, checkProcessorLogisticsReadiness, shouldConfigureProcessor } from './util/processorConfig';
import { calculateRequiredSolar, calculateRequiredBatteries, shouldPrioritizeBatteryOverSolar } from './util/energyPlanning';
import { shouldThrottleExtractorPlacement } from './util/resourceAnalysis';

const MAX_ACTIONS_PER_TICK = 12;

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
}

export class MasterBot implements BotLifecycle {
  private readonly engine: GameEngine;
  private readonly onStatusChange: (status: BotStatus) => void;
  private timerId: number | null = null;
  private active = false;
  private running = false;
  private spiralStep = 0;
  private storageClusters: StorageCluster[] = [];
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

      if (this.ensureEnergySupply()) {
        didAct = true;
        continue;
      }

      if (this.connectEnergyNetwork()) {
        didAct = true;
        continue;
      }

      break;
    }

    return { didAct };
  }

  private initializeStorageClusters(): boolean {
    if (this.storageClusters.length > 0) return false;

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

  private placeExtractorNearCluster(): boolean {
    if (this.storageClusters.length === 0) return false;

    const currentCluster = this.storageClusters[this.currentClusterIndex];
    if (!currentCluster) return false;

    const candidates = this.collectVisibleDepositsNearPoint(currentCluster.center, 8);
    if (candidates.length === 0) {
      this.currentClusterIndex = (this.currentClusterIndex + 1) % this.storageClusters.length;
      return false;
    }

    const target = candidates[0];
    if (!target) return false;

    if (shouldThrottleExtractorPlacement(this.engine, target.resource)) {
      return false;
    }

    const placement = this.engine.canPlaceBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: target.x, y: target.y }, Direction.North);
    if (!placement.ok) return false;

    const placedId = this.engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: target.x, y: target.y }, Direction.North, {
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

    if (currentCluster.extractorCount < 4) return false;

    const anchor = this.calculateSpiralAnchor();
    const target = { x: anchor.x, y: anchor.y };

    if (!this.engine.canPlaceBuilding(STORAGE_BUILDING_TYPE_ID, target, Direction.North).ok) {
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

  private routeExtractorsToStorage(): boolean {
    if (this.storageClusters.length === 0) return false;

    for (const [id, building] of this.engine.getBuildings()) {
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;

      const type = getBuildingType(building.typeId);
      if (!type) continue;

      const nearestCluster = this.findNearestStorageCluster(building.origin);
      if (!nearestCluster) continue;

      const result = routeExtractorToStorage(this.engine, id, nearestCluster.id);
      if (result.success) {
        this.setStatus({ active: true, phase: 'logistics', target: `belt: extractor → storage` });
        return true;
      }
    }

    return false;
  }

  private configureProcessors(): boolean {
    for (const [id, building] of this.engine.getBuildings()) {
      if (!isProcessorTypeId(building.typeId)) continue;

      if (!shouldConfigureProcessor(this.engine, id)) continue;

      if (!checkProcessorLogisticsReadiness(this.engine, id)) continue;

      const resourceType = this.findResourceForProcessor(id);
      if (!resourceType) continue;

      if (building.typeId === CONVERTER_BUILDING_TYPE_ID) {
        const recipeId = configureConverterForResource(this.engine, id, resourceType);
        if (recipeId) {
          this.setStatus({ active: true, phase: 'processing', target: `recipe: ${recipeId}` });
          return true;
        }
      }
    }

    return false;
  }

  private findResourceForProcessor(_processorId: BuildingId): ResourceTypeT | null {
    for (const [, building] of this.engine.getBuildings()) {
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;

      const extractorResource = this.engine.getResourceAt(building.origin.x, building.origin.y);
      if (extractorResource !== 0) {
        return extractorResource;
      }
    }

    return ResourceType.Regolith;
  }

  private ensureEnergySupply(): boolean {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    if (extractors.length === 0) return false;

    const shouldPrioritizeBattery = shouldPrioritizeBatteryOverSolar(this.engine);
    const daylight = getDaylightFactor(this.engine.simulationTime);

    const solarPanels = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID);
    const targetSolar = calculateRequiredSolar(extractors.length);

    if (solarPanels.length < targetSolar || (daylight >= 0.2 && this.hasUnpoweredExtractors())) {
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

    const batteries = this.getBuildingsByType(BATTERY_BASIC_BUILDING_TYPE_ID);
    const targetBatteries = calculateRequiredBatteries(this.engine);

    if (batteries.length < targetBatteries || shouldPrioritizeBattery || this.hasUnpoweredExtractors()) {
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

  private hasUnpoweredExtractors(): boolean {
    for (const [id, building] of this.engine.getBuildings()) {
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;
      if (this.engine.getBuildingPowerState(id) !== 'powered') return true;
    }
    return false;
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

    for (let y = Math.max(0, center.y - radius); y <= Math.min(GRID_HEIGHT - 1, center.y + radius); y++) {
      for (let x = Math.max(0, center.x - radius); x <= Math.min(GRID_WIDTH - 1, center.x + radius); x++) {
        const resource = this.engine.getResourceAt(x, y);
        if (resource === ResourceType.None) continue;
        if (!this.engine.grid.isRevealed(x, y)) continue;
        if (this.engine.getBuildingAt(x, y) !== null) continue;
        deposits.push({
          x,
          y,
          resource,
          score: (RESOURCE_PRIORITY[resource] ?? 0) * 1000 - (Math.abs(x - centerX) + Math.abs(y - centerY)),
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
