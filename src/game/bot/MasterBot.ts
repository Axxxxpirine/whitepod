import { GRID_HEIGHT, GRID_WIDTH } from '@/game/constants';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
  isProcessorTypeId,
  resourceTypeLabel,
} from '@/game/data/buildingCatalog';
import { Direction, ResourceType, type BuildingId, type BuildingTypeId, type ResourceType as ResourceTypeT } from '@/game/types';
import type { GameEngine } from '@/game/engine/GameEngine';
import { getDaylightFactor } from '@/game/renderer/DayNightOverlayRenderer';
import type { BotLifecycle, BotStatus } from './botTypes';
import {
  routeExtractorToStorage,
} from './util/beltRouting';
import {
  configureConverterForResource,
  configureSynthesizerForRecipe,
  checkProcessorLogisticsReadiness,
  shouldConfigureProcessor,
} from './util/processorConfig';
import {
  shouldTriggerExploration,
  findFrontierWatchtowerPosition,
  calculateSpiralAnchor,
  reserveBeltCorridors,
  isTileInCorridor,
  findAvailableTileNearModule,
  countBuildingsByTypeInRadius,
} from './util/spatialPlanning';
import {
  calculateRequiredSolar,
  calculateRequiredBatteries,
  shouldPrioritizeBatteryOverSolar,
} from './util/energyPlanning';
import {
  shouldThrottleExtractorPlacement,
  hasSufficientStock,
} from './util/resourceAnalysis';

const MAX_ACTIONS_PER_TICK = 12;

export class MasterBot implements BotLifecycle {
  private readonly engine: GameEngine;
  private readonly onStatusChange: (status: BotStatus) => void;
  private timerId: number | null = null;
  private active = false;
  private running = false;
  private spiralStep = 0;
  private storageId: BuildingId | null = null;
  private moduleCenters: Array<{ x: number; y: number }> = [];
  private reservedCorridors = new Set<string>();
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
    this.timerId = window.setInterval(() => this.tick(), 450);
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
      if (this.initializeStorageIfNeeded()) {
        didAct = true;
        continue;
      }

      if (this.handleExplorationTrigger()) {
        didAct = true;
        continue;
      }

      if (this.placeModule()) {
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

      if (this.ensureEnergyBalance()) {
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

  private placeModule(): boolean {
    const anchor = calculateSpiralAnchor(this.engine, this.spiralStep);
    const moduleCenter = { x: anchor.x, y: anchor.y };

    if (this.reservedCorridors.size === 0) {
      this.reservedCorridors = reserveBeltCorridors(this.engine, moduleCenter, 2);
    }

    const extractorCount = countBuildingsByTypeInRadius(this.engine, moduleCenter, EXTRACTOR_BUILDING_TYPE_ID, 3);

    if (extractorCount < 3) {
      return this.placeExtractorInModule(moduleCenter);
    }

    const mergerCount = countBuildingsByTypeInRadius(this.engine, moduleCenter, MERGER_BASIC_BUILDING_TYPE_ID, 3);
    if (mergerCount === 0) {
      return this.placeMergerInModule(moduleCenter);
    }

    const converterCount = countBuildingsByTypeInRadius(this.engine, moduleCenter, CONVERTER_BUILDING_TYPE_ID, 3);
    if (converterCount === 0) {
      return this.placeConverterInModule(moduleCenter);
    }

    const solarCount = countEnergyBuildingsByType(this.engine, SOLAR_PANEL_BUILDING_TYPE_ID, moduleCenter, 3);
    const targetSolar = calculateRequiredSolar(extractorCount);
    if (solarCount < targetSolar) {
      return this.placeSolarInModule(moduleCenter);
    }

    const batteryCount = countEnergyBuildingsByType(this.engine, BATTERY_BASIC_BUILDING_TYPE_ID, moduleCenter, 3);
    const targetBattery = calculateRequiredBatteries(this.engine);
    if (batteryCount < targetBattery) {
      return this.placeBatteryInModule(moduleCenter);
    }

    this.moduleCenters.push(moduleCenter);
    this.spiralStep += anchor.adaptiveStepSize;

    return false;
  }

  private placeExtractorInModule(moduleCenter: { x: number; y: number }): boolean {
    const availableTile = findAvailableTileNearModule(this.engine, moduleCenter, this.reservedCorridors, 3);
    if (!availableTile) return false;

    const resource = this.engine.getResourceAt(availableTile.x, availableTile.y);
    if (resource === 0) return false;

    if (shouldThrottleExtractorPlacement(this.engine, resource)) {
      return false;
    }

    if (!this.engine.canPlaceBuilding(EXTRACTOR_BUILDING_TYPE_ID, availableTile, Direction.North).ok) {
      return false;
    }

    const placedId = this.engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, availableTile, Direction.North, { emitSfx: false });
    if (placedId !== null) {
      this.setStatus({
        active: true,
        phase: 'mining',
        target: `${resourceTypeLabel(resource)} @ ${availableTile.x},${availableTile.y}`,
      });
      return true;
    }

    return false;
  }

  private placeMergerInModule(moduleCenter: { x: number; y: number }): boolean {
    const availableTile = findAvailableTileNearModule(this.engine, moduleCenter, this.reservedCorridors, 3);
    if (!availableTile) return false;

    if (!this.engine.canPlaceBuilding(MERGER_BASIC_BUILDING_TYPE_ID, availableTile, Direction.North).ok) {
      return false;
    }

    const placedId = this.engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, availableTile, Direction.North, { emitSfx: false });
    if (placedId !== null) {
      this.setStatus({ active: true, phase: 'logistics', target: `merger @ ${availableTile.x},${availableTile.y}` });
      return true;
    }

    return false;
  }

  private placeConverterInModule(moduleCenter: { x: number; y: number }): boolean {
    const availableTile = findAvailableTileNearModule(this.engine, moduleCenter, this.reservedCorridors, 3);
    if (!availableTile) return false;

    if (!this.engine.canPlaceBuilding(CONVERTER_BUILDING_TYPE_ID, availableTile, Direction.North).ok) {
      return false;
    }

    const placedId = this.engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, availableTile, Direction.North, { emitSfx: false });
    if (placedId !== null) {
      this.setStatus({ active: true, phase: 'processing', target: `converter @ ${availableTile.x},${availableTile.y}` });
      return true;
    }

    return false;
  }

  private placeSolarInModule(moduleCenter: { x: number; y: number }): boolean {
    const availableTile = findAvailableTileNearModule(this.engine, moduleCenter, this.reservedCorridors, 3);
    if (!availableTile) return false;

    if (!this.engine.canPlaceBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, availableTile, Direction.North).ok) {
      return false;
    }

    const placedId = this.engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, availableTile, Direction.North, { emitSfx: false });
    if (placedId !== null) {
      this.setStatus({ active: true, phase: 'powering', target: `solar @ ${availableTile.x},${availableTile.y}` });
      return true;
    }

    return false;
  }

  private placeBatteryInModule(moduleCenter: { x: number; y: number }): boolean {
    const availableTile = findAvailableTileNearModule(this.engine, moduleCenter, this.reservedCorridors, 3);
    if (!availableTile) return false;

    if (!this.engine.canPlaceBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, availableTile, Direction.North).ok) {
      return false;
    }

    const placedId = this.engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, availableTile, Direction.North, { emitSfx: false });
    if (placedId !== null) {
      this.setStatus({ active: true, phase: 'powering', target: `battery @ ${availableTile.x},${availableTile.y}` });
      return true;
    }

    return false;
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
      } else if (building.typeId === SYNTHESIZER_BUILDING_TYPE_ID) {
        if (hasSufficientStock(this.engine, ResourceType.IronOxide, 50) &&
            hasSufficientStock(this.engine, ResourceType.AluminumOxide, 50)) {
          if (configureSynthesizerForRecipe(this.engine, id, 'ceramic_plates')) {
            this.setStatus({ active: true, phase: 'processing', target: 'recipe: ceramic_plates' });
            return true;
          }
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

  private ensureEnergyBalance(): boolean {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    if (extractors.length === 0) return false;

    const shouldPrioritizeBattery = shouldPrioritizeBatteryOverSolar(this.engine);
    const daylight = getDaylightFactor(this.engine.simulationTime);

    const solarPanels = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID);
    const targetSolar = calculateRequiredSolar(extractors.length);

    if (solarPanels.length < targetSolar && daylight >= 0.2) {
      const anchor = calculateSpiralAnchor(this.engine, this.spiralStep);
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
    if (batteries.length < targetBatteries || shouldPrioritizeBattery) {
      const anchor = calculateSpiralAnchor(this.engine, this.spiralStep);
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
      case WATCHTOWER_BUILDING_TYPE_ID:
        return 0;
      default:
        return 0;
    }
  }

  private findBestPlacement(typeId: BuildingTypeId, reference: { x: number; y: number }): { x: number; y: number } | null {
    let best: { x: number; y: number; score: number } | null = null;

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (!this.engine.canPlaceBuilding(typeId, { x, y }, Direction.North).ok) continue;
        if (isTileInCorridor({ x, y }, this.reservedCorridors)) continue;

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
    const stock = this.engine.getResourceCounts();
    return `e${extractors.length} s${solarPanels.length} r${stock.regolith} h${stock.hydrogen}`;
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

function countEnergyBuildingsByType(
  engine: GameEngine,
  typeId: string,
  center: { x: number; y: number },
  radius: number,
): number {
  let count = 0;

  for (const [, building] of engine.getBuildings()) {
    const type = getBuildingType(building.typeId);
    if (!type || type.id !== typeId) continue;

    const distance = Math.abs(building.origin.x - center.x) + Math.abs(building.origin.y - center.y);
    if (distance <= radius) {
      count++;
    }
  }

  return count;
}
