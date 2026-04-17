import { getDaylightFactor } from '@/game/renderer/DayNightOverlayRenderer';
import { GRID_HEIGHT, GRID_WIDTH } from '@/game/constants';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  getBuildingType,
  isProcessorTypeId,
  resourceTypeLabel,
} from '@/game/data/buildingCatalog';
import { Direction, ResourceType, type BuildingId, type BuildingTypeId, type ResourceType as ResourceTypeT } from '@/game/types';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { BotLifecycle, BotStatus } from './botTypes';
import { routeExtractorToStorage } from './util/beltRouting';
import { configureConverterForResource, checkProcessorLogisticsReadiness, shouldConfigureProcessor } from './util/processorConfig';
import { shouldTriggerExploration, findFrontierWatchtowerPosition } from './util/spatialPlanning';
import { shouldPrioritizeBatteryOverSolar } from './util/energyPlanning';
import { shouldThrottleExtractorPlacement } from './util/resourceAnalysis';

const MAX_ACTIONS_PER_TICK = 16;

const RESOURCE_PRIORITY: Partial<Record<ResourceTypeT, number>> = {
  [ResourceType.None]: 0,
  [ResourceType.Regolith]: 1,
  [ResourceType.Hydrogen]: 2,
  [ResourceType.Oxygen]: 3,
};

export class AutonomousBot implements BotLifecycle {
  private readonly engine: GameEngine;
  private readonly onStatusChange: (status: BotStatus) => void;
  private timerId: number | null = null;
  private active = false;
  private running = false;
  private storageId: BuildingId | null = null;
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
        this.setStatus({ active: true, phase: 'online', target: this.describeStockTarget() });
      }
    } finally {
      this.running = false;
    }
  }

  private runCycle(): { didAct: boolean } {
    let didAct = false;
    let extractorBurst = 0;

    for (let actions = 0; actions < MAX_ACTIONS_PER_TICK; actions++) {
      if (this.initializeStorageIfNeeded()) {
        didAct = true;
        continue;
      }

      if (this.handleExplorationTrigger()) {
        didAct = true;
        continue;
      }

      if (extractorBurst < 3 && this.placeBestExtractor()) {
        didAct = true;
        extractorBurst += 1;
        continue;
      }

      extractorBurst = 0;

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

      if (extractorBurst < 1 && this.placeBestExtractor()) {
        didAct = true;
        extractorBurst = 1;
        continue;
      }

      break;
    }

    return { didAct };
  }

  private initializeStorageIfNeeded(): boolean {
    if (this.storageId !== null) return false;

    for (const [id, building] of this.engine.getBuildings()) {
      const type = getBuildingType(building.typeId);
      if (type?.id === STORAGE_BUILDING_TYPE_ID) {
        this.storageId = id;
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
          this.storageId = placedId;
          this.setStatus({ active: true, phase: 'booting', target: `storage @ ${x},${y}` });
          return true;
        }
      }
    }

    return false;
  }

  private handleExplorationTrigger(): boolean {
    if (!shouldTriggerExploration(this.engine, 0.3)) return false;

    const frontierPos = findFrontierWatchtowerPosition(this.engine);
    if (!frontierPos) return false;

    if (!this.engine.canPlaceBuilding('watchtower_basic', frontierPos, Direction.North).ok) {
      return false;
    }

    const placedId = this.engine.placeBuilding('watchtower_basic', frontierPos, Direction.North, { emitSfx: false });
    if (placedId !== null) {
      this.setStatus({ active: true, phase: 'expanding', target: `tower @ ${frontierPos.x},${frontierPos.y}` });
      return true;
    }

    return false;
  }

  private placeBestExtractor(): boolean {
    const candidates = this.collectVisibleDeposits();
    if (candidates.length === 0) return false;

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

    this.setStatus({
      active: true,
      phase: 'mining',
      target: `${resourceTypeLabel(target.resource)} @ ${target.x},${target.y}`,
    });
    return true;
  }

  private routeExtractorsToStorage(): boolean {
    if (this.storageId === null) return false;

    for (const [id, building] of this.engine.getBuildings()) {
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;

      const type = getBuildingType(building.typeId);
      if (!type) continue;

      const result = routeExtractorToStorage(this.engine, id, this.storageId);
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
    const solarPanels = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID);
    const batteries = this.getBuildingsByType(BATTERY_BASIC_BUILDING_TYPE_ID);
    const unpoweredExtractors = extractors.filter((id) => this.engine.getBuildingPowerState(id) !== 'powered');
    const daylight = getDaylightFactor(this.engine.simulationTime);

    const targetSolarPanels = Math.max(extractors.length, Math.ceil(extractors.length * 1.5));
    const targetBatteries = Math.max(1, Math.ceil(extractors.length / 2));

    if (solarPanels.length < targetSolarPanels || (unpoweredExtractors.length > 0 && daylight >= 0.2)) {
      const origin = this.findBestPlacement(SOLAR_PANEL_BUILDING_TYPE_ID);
      if (origin) {
        const placedId = this.engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, origin, Direction.North, { emitSfx: false });
        if (placedId !== null) {
          this.setStatus({ active: true, phase: 'powering', target: `solar @ ${origin.x},${origin.y}` });
          return true;
        }
      }
    }

    if (batteries.length < targetBatteries || unpoweredExtractors.length > 0 || shouldPrioritizeBattery) {
      const origin = this.findBestPlacement(BATTERY_BASIC_BUILDING_TYPE_ID);
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

  private collectVisibleDeposits(): Array<{ x: number; y: number; resource: ResourceTypeT; score: number }> {
    const deposits: Array<{ x: number; y: number; resource: ResourceTypeT; score: number }> = [];
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
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

  private findBestPlacement(typeId: BuildingTypeId): { x: number; y: number } | null {
    let best: { x: number; y: number; score: number } | null = null;
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (!this.engine.canPlaceBuilding(typeId, { x, y }, Direction.North).ok) continue;

        const distance = Math.abs(x - centerX) + Math.abs(y - centerY);
        if (!best || distance < best.score || (distance === best.score && (y < best.y || (y === best.y && x < best.x)))) {
          best = { x, y, score: distance };
        }
      }
    }

    return best ? { x: best.x, y: best.y } : null;
  }

  private describeStockTarget(): string {
    const stock = this.engine.getResourceCounts();
    return `stock r${stock.regolith} h${stock.hydrogen} o${stock.oxygen}`;
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
