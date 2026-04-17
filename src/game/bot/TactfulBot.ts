import { GRID_HEIGHT, GRID_WIDTH } from '@/game/constants';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
  isProcessorTypeId,
  resourceTypeLabel,
} from '@/game/data/buildingCatalog';
import { Direction, type BuildingId, type BuildingTypeId, type ResourceType as ResourceTypeT, type TileCoord } from '@/game/types';
import type { GameEngine } from '@/game/engine/GameEngine';
import { getDaylightFactor } from '@/game/renderer/DayNightOverlayRenderer';
import type { BotLifecycle, BotStatus } from './botTypes';
import {
  routeExtractorToStorage,
  routeExtractorToMerger,
} from './util/beltRouting';
import {
  configureConverterForResource,
  checkProcessorLogisticsReadiness,
  shouldConfigureProcessor,
} from './util/processorConfig';
import {
  findFrontierWatchtowerPosition,
  calculateBuildDensity,
} from './util/spatialPlanning';
import {
  calculateRequiredSolar,
  calculateRequiredBatteries,
  shouldPrioritizeBatteryOverSolar,
} from './util/energyPlanning';

const MAX_ACTIONS_PER_TICK = 10;

export class TactfulBot implements BotLifecycle {
  private readonly engine: GameEngine;
  private readonly onStatusChange: (status: BotStatus) => void;
  private timerId: number | null = null;
  private active = false;
  private running = false;
  private storageId: BuildingId | null = null;
  private energyHubId: BuildingId | null = null;
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

      if (this.placeExtractorClustered()) {
        didAct = true;
        continue;
      }

      if (this.placeMergerIfNeeded()) {
        didAct = true;
        continue;
      }

      if (this.routeExtractorsWithComplexPaths()) {
        didAct = true;
        continue;
      }

      if (this.placeSolarInArray()) {
        didAct = true;
        continue;
      }

      if (this.placeBatteryGroups()) {
        didAct = true;
        continue;
      }

      if (this.connectEnergyNetwork()) {
        didAct = true;
        continue;
      }

      if (this.configureProcessors()) {
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
    const density = calculateBuildDensity(this.engine);
    const buildingCount = this.getTotalBuildingCount();

    if (density < 0.3 && buildingCount < 50) return false;

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

  private placeExtractorClustered(): boolean {
    const existingExtractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);

    let clusterCenter: TileCoord | null = null;
    if (existingExtractors.length > 0) {
      let sumX = 0;
      let sumY = 0;
      for (const id of existingExtractors) {
        const building = this.engine.getBuildings().get(id);
        if (building) {
          sumX += building.origin.x;
          sumY += building.origin.y;
        }
      }
      clusterCenter = {
        x: Math.floor(sumX / existingExtractors.length),
        y: Math.floor(sumY / existingExtractors.length),
      };
    }

    const searchRadius = clusterCenter ? 8 : 12;
    const searchOrigin = clusterCenter ?? { x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) };

    const bestTile = this.findBestExtractorTile(searchOrigin, searchRadius);
    if (!bestTile) return false;

    const resource = this.engine.getResourceAt(bestTile.x, bestTile.y);
    if (resource === 0) return false;

    if (!this.engine.canPlaceBuilding(EXTRACTOR_BUILDING_TYPE_ID, bestTile, Direction.North).ok) {
      return false;
    }

    const placedId = this.engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, bestTile, Direction.North, { emitSfx: false });
    if (placedId !== null) {
      this.setStatus({
        active: true,
        phase: 'mining',
        target: `${resourceTypeLabel(resource)} @ ${bestTile.x},${bestTile.y}`,
      });
      return true;
    }

    return false;
  }

  private findBestExtractorTile(origin: TileCoord, radius: number): TileCoord | null {
    let best: TileCoord | null = null;
    let minDistanceToCluster = Infinity;

    const existingExtractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    let clusterCenter: TileCoord | null = null;

    if (existingExtractors.length > 0) {
      let sumX = 0;
      let sumY = 0;
      for (const id of existingExtractors) {
        const building = this.engine.getBuildings().get(id);
        if (building) {
          sumX += building.origin.x;
          sumY += building.origin.y;
        }
      }
      clusterCenter = {
        x: Math.floor(sumX / existingExtractors.length),
        y: Math.floor(sumY / existingExtractors.length),
      };
    }

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = origin.x + dx;
        const y = origin.y + dy;

        if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) continue;
        if (!this.engine.grid.isRevealed(x, y)) continue;
        if (this.engine.getBuildingAt(x, y) !== null) continue;

        const resource = this.engine.getResourceAt(x, y);
        if (resource === 0) continue;

        let distanceToCluster = Infinity;
        if (clusterCenter) {
          distanceToCluster = Math.abs(x - clusterCenter.x) + Math.abs(y - clusterCenter.y);
        }

        if (distanceToCluster < minDistanceToCluster) {
          minDistanceToCluster = distanceToCluster;
          best = { x, y };
        }
      }
    }

    return best;
  }

  private placeMergerIfNeeded(): boolean {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    if (extractors.length < 3) return false;

    const existingMergers = this.getBuildingsByType(MERGER_BASIC_BUILDING_TYPE_ID);
    if (existingMergers.length > 0) return false;

    const clusterCenter = this.getExtractorClusterCenter();
    if (!clusterCenter) return false;

    const availableTile = this.findAvailableTileNear(clusterCenter, 6);
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

  private routeExtractorsWithComplexPaths(): boolean {
    if (this.storageId === null) return false;

    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    const mergers = this.getBuildingsByType(MERGER_BASIC_BUILDING_TYPE_ID);

    for (const extractorId of extractors) {
      const building = this.engine.getBuildings().get(extractorId);
      if (!building) continue;

      let targetId: BuildingId | null = null;

      if (mergers.length > 0) {
        targetId = this.findNearestMerger(building.origin);
      }

      if (!targetId) {
        targetId = this.storageId;
      }

      const routeResult = targetId === this.storageId
        ? routeExtractorToStorage(this.engine, extractorId, this.storageId)
        : routeExtractorToMerger(this.engine, extractorId, targetId);

      if (routeResult.success) {
        this.setStatus({ active: true, phase: 'logistics', target: `belt: extractor → ${mergers.length > 0 ? 'merger' : 'storage'}` });
        return true;
      }
    }

    return false;
  }

  private findNearestMerger(origin: TileCoord): BuildingId | null {
    const mergers = this.getBuildingsByType(MERGER_BASIC_BUILDING_TYPE_ID);
    if (mergers.length === 0) return null;

    let nearest: BuildingId | null = null;
    let minDistance = Infinity;

    for (const id of mergers) {
      const building = this.engine.getBuildings().get(id);
      if (!building) continue;

      const distance = Math.abs(building.origin.x - origin.x) + Math.abs(building.origin.y - origin.y);
      if (distance < minDistance) {
        minDistance = distance;
        nearest = id;
      }
    }

    return nearest;
  }

  private placeSolarInArray(): boolean {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    const targetSolar = calculateRequiredSolar(extractors.length);
    const existingSolar = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID);

    if (existingSolar.length >= targetSolar) return false;

    const daylight = getDaylightFactor(this.engine.simulationTime);
    if (daylight < 0.2) return false;

    const solarArrayCenter = this.getEnergyArrayCenter('solar');
    const placementOrigin = solarArrayCenter ?? { x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) };

    const adjacentTile = this.findAdjacentEnergyBuildingTile(placementOrigin, SOLAR_PANEL_BUILDING_TYPE_ID, 3);
    const availableTile = adjacentTile ?? this.findAvailableTileNear(placementOrigin, 8);

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

  private placeBatteryGroups(): boolean {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    const solarCount = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID).length;
    const batteryCount = this.getBuildingsByType(BATTERY_BASIC_BUILDING_TYPE_ID).length;

    const targetBatteries = calculateRequiredBatteries(this.engine);
    const solarThreshold = 2 * extractors.length;

    if (solarCount < solarThreshold) return false;
    if (batteryCount >= targetBatteries) return false;

    const shouldPrioritize = shouldPrioritizeBatteryOverSolar(this.engine);
    if (!shouldPrioritize && solarCount < targetBatteries * 2) return false;

    const batteryArrayCenter = this.getEnergyArrayCenter('battery');
    const placementOrigin = batteryArrayCenter ?? { x: Math.floor(GRID_WIDTH / 2), y: Math.floor(GRID_HEIGHT / 2) };

    const adjacentTile = this.findAdjacentEnergyBuildingTile(placementOrigin, BATTERY_BASIC_BUILDING_TYPE_ID, 4);
    const availableTile = adjacentTile ?? this.findAvailableTileNear(placementOrigin, 8);

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

  private connectEnergyNetwork(): boolean {
    if (this.energyHubId === null) {
      this.energyHubId = this.findOrCreateEnergyHub();
    }

    if (this.energyHubId === null) return false;

    const energyBuildings = this.getAllEnergyBuildings();
    for (const node of energyBuildings) {
      if (node.id === this.energyHubId) continue;
      if (this.engine.areBuildingsEnergyLinked(this.energyHubId, node.id)) continue;

      if (this.engine.connectBuildings(this.energyHubId, node.id)) {
        const hubType = getBuildingType(this.engine.getBuildings().get(this.energyHubId)!.typeId);
        const nodeType = getBuildingType(node.typeId);
        this.setStatus({ active: true, phase: 'powering', target: `${hubType?.name} ↔ ${nodeType?.name}` });
        return true;
      }
    }

    return false;
  }

  private findOrCreateEnergyHub(): BuildingId | null {
    const batteries = this.getBuildingsByType(BATTERY_BASIC_BUILDING_TYPE_ID);
    const solarPanels = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID);

    if (batteries.length > 0) {
      return batteries[0];
    }

    if (solarPanels.length > 0) {
      return solarPanels[0];
    }

    return null;
  }

  private getAllEnergyBuildings(): Array<{ id: BuildingId; typeId: BuildingTypeId }> {
    const buildings: Array<{ id: BuildingId; typeId: BuildingTypeId }> = [];

    for (const [id, building] of this.engine.getBuildings()) {
      const type = getBuildingType(building.typeId);
      if (type?.energy) {
        buildings.push({ id, typeId: building.typeId });
      }
    }

    return buildings;
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

      return false;
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

    return null;
  }

  private getExtractorClusterCenter(): TileCoord | null {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    if (extractors.length === 0) return null;

    let sumX = 0;
    let sumY = 0;
    for (const id of extractors) {
      const building = this.engine.getBuildings().get(id);
      if (building) {
        sumX += building.origin.x;
        sumY += building.origin.y;
      }
    }

    return {
      x: Math.floor(sumX / extractors.length),
      y: Math.floor(sumY / extractors.length),
    };
  }

  private getEnergyArrayCenter(type: 'solar' | 'battery'): TileCoord | null {
    const typeId = type === 'solar' ? SOLAR_PANEL_BUILDING_TYPE_ID : BATTERY_BASIC_BUILDING_TYPE_ID;
    const buildings = this.getBuildingsByType(typeId);

    if (buildings.length === 0) return null;

    let sumX = 0;
    let sumY = 0;
    for (const id of buildings) {
      const building = this.engine.getBuildings().get(id);
      if (building) {
        sumX += building.origin.x;
        sumY += building.origin.y;
      }
    }

    return {
      x: Math.floor(sumX / buildings.length),
      y: Math.floor(sumY / buildings.length),
    };
  }

  private findAdjacentEnergyBuildingTile(origin: TileCoord, typeId: BuildingTypeId, maxDistance: number): TileCoord | null {
    const existingBuildings = this.getBuildingsByType(typeId);

    for (const id of existingBuildings) {
      const building = this.engine.getBuildings().get(id);
      if (!building) continue;

      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        const x = building.origin.x + dx;
        const y = building.origin.y + dy;

        if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) continue;
        if (!this.engine.grid.isRevealed(x, y)) continue;
        if (this.engine.getBuildingAt(x, y) !== null) continue;

        const distance = Math.abs(x - origin.x) + Math.abs(y - origin.y);
        if (distance <= maxDistance) {
          return { x, y };
        }
      }
    }

    return null;
  }

  private findAvailableTileNear(origin: TileCoord, radius: number): TileCoord | null {
    for (let r = 1; r <= radius; r++) {
      for (let y = origin.y - r; y <= origin.y + r; y++) {
        for (let x = origin.x - r; x <= origin.x + r; x++) {
          if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) continue;
          if (!this.engine.grid.isRevealed(x, y)) continue;
          if (this.engine.getBuildingAt(x, y) !== null) continue;

          return { x, y };
        }
      }
    }

    return null;
  }

  private getBuildingsByType(typeId: BuildingTypeId): BuildingId[] {
    const ids: BuildingId[] = [];
    for (const [id, building] of this.engine.getBuildings()) {
      if (building.typeId === typeId) ids.push(id);
    }
    return ids;
  }

  private getTotalBuildingCount(): number {
    let count = 0;
    for (const [, ] of this.engine.getBuildings()) {
      count++;
    }
    return count;
  }

  private describeTarget(): string {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    const solarPanels = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID);
    const batteries = this.getBuildingsByType(BATTERY_BASIC_BUILDING_TYPE_ID);
    const stock = this.engine.getResourceCounts();
    return `e${extractors.length} s${solarPanels.length} b${batteries.length} r${stock.regolith}`;
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
