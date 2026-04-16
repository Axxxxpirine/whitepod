import { getDaylightFactor } from '@/game/renderer/DayNightOverlayRenderer';
import { GRID_HEIGHT, GRID_WIDTH } from '@/game/constants';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
  getBuildingType,
  resourceTypeLabel,
} from '@/game/data/buildingCatalog';
import { Direction, ResourceType, type BuildingId, type BuildingTypeId, type ResourceType as ResourceTypeT } from '@/game/types';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { BotLifecycle, BotStatus } from './botTypes';

const MAX_ACTIONS_PER_TICK = 14;

const RESOURCE_PRIORITY: Record<ResourceTypeT, number> = {
  [ResourceType.None]: 0,
  [ResourceType.Coal]: 1,
  [ResourceType.IronOre]: 2,
  [ResourceType.CopperOre]: 3,
};

function buildingPriority(typeId: BuildingTypeId): number {
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

export class LogisticsBot implements BotLifecycle {
  private readonly engine: GameEngine;
  private readonly onStatusChange: (status: BotStatus) => void;
  private timerId: number | null = null;
  private active = false;
  private running = false;
  private status: BotStatus = { active: false, phase: 'booting', target: null };

  constructor(engine: GameEngine, onStatusChange: (status: BotStatus) => void) {
    this.engine = engine;
    this.onStatusChange = onStatusChange;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.setStatus({ active: true, phase: 'booting', target: 'layout' });
    this.tick();
    this.timerId = window.setInterval(() => this.tick(), 420);
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
        this.setStatus({ active: true, phase: 'online', target: this.describeLogisticsTarget() });
      }
    } finally {
      this.running = false;
    }
  }

  private runCycle(): { didAct: boolean } {
    let didAct = false;

    for (let actions = 0; actions < MAX_ACTIONS_PER_TICK; actions++) {
      if (this.ensureEnergyBalance()) {
        didAct = true;
        continue;
      }

      if (this.placeBestExtractor()) {
        didAct = true;
        continue;
      }

      if (this.connectEnergyNetwork()) {
        didAct = true;
        continue;
      }

      if (this.placeWatchtowerIfSafe()) {
        didAct = true;
        continue;
      }

      break;
    }

    return { didAct };
  }

  private ensureEnergyBalance(): boolean {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    if (extractors.length === 0) return false;

    const unpoweredExtractors = extractors.filter((id) => this.engine.getBuildingPowerState(id) !== 'powered');
    const daylight = getDaylightFactor(this.engine.simulationTime);

    if (unpoweredExtractors.length > 0 && daylight >= 0.2) {
      const origin = this.findBestPlacement(SOLAR_PANEL_BUILDING_TYPE_ID, 'closest');
      if (origin) {
        const placedId = this.engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, origin, Direction.North, { emitSfx: false });
        if (placedId !== null) {
          this.setStatus({ active: true, phase: 'powering', target: `solar @ ${origin.x},${origin.y}` });
          return true;
        }
      }
    }

    return false;
  }

  private placeBestExtractor(): boolean {
    const candidates = this.collectVisibleDeposits();
    if (candidates.length === 0) return false;

    const target = candidates[0];
    if (!target) return false;

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

  private placeWatchtowerIfSafe(): boolean {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    const solarPanels = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID);
    if (solarPanels.length < extractors.length * 1.2) return false;

    const origin = this.findBestPlacement(WATCHTOWER_BUILDING_TYPE_ID, 'farthest');
    if (!origin) return false;

    const placedId = this.engine.placeBuilding(WATCHTOWER_BUILDING_TYPE_ID, origin, Direction.North, { emitSfx: false });
    if (placedId === null) return false;

    this.setStatus({ active: true, phase: 'expanding', target: `tower @ ${origin.x},${origin.y}` });
    return true;
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
          score: RESOURCE_PRIORITY[resource] * 1000 - (Math.abs(x - centerX) + Math.abs(y - centerY)),
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
        priority: buildingPriority(building.typeId),
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

  private findBestPlacement(typeId: BuildingTypeId, preference: 'closest' | 'farthest'): { x: number; y: number } | null {
    let best: { x: number; y: number; score: number } | null = null;
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (!this.engine.canPlaceBuilding(typeId, { x, y }, Direction.North).ok) continue;
        const distance = Math.abs(x - centerX) + Math.abs(y - centerY);
        if (preference === 'closest') {
          if (!best || distance < best.score || (distance === best.score && (y < best.y || (y === best.y && x < best.x)))) {
            best = { x, y, score: distance };
          }
        } else {
          if (!best || distance > best.score || (distance === best.score && (y < best.y || (y === best.y && x < best.x)))) {
            best = { x, y, score: distance };
          }
        }
      }
    }

    return best ? { x: best.x, y: best.y } : null;
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

  private describeLogisticsTarget(): string {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    const solarPanels = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID);
    return `e${extractors.length} s${solarPanels.length}`;
  }
}
