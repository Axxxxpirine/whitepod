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
import { getDaylightFactor } from '@/game/renderer/DayNightOverlayRenderer';
import { isInBounds } from '@/game/data/coords';
import type { BotLifecycle, BotStatus } from './botTypes';

const MAX_ACTIONS_PER_TICK = 12;

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

function spiralCoordinate(step: number, centerX: number, centerY: number): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let dx = 0;
  let dy = -1;

  for (let index = 0; index < step; index++) {
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
      const previousDx = dx;
      dx = -dy;
      dy = previousDx;
    }
    x += dx;
    y += dy;
  }

  return { x: centerX + x, y: centerY + y };
}

export class FractalBot implements BotLifecycle {
  private readonly engine: GameEngine;
  private readonly onStatusChange: (status: BotStatus) => void;
  private timerId: number | null = null;
  private active = false;
  private running = false;
  private spiralStep = 0;
  private status: BotStatus = { active: false, phase: 'booting', target: null };

  constructor(engine: GameEngine, onStatusChange: (status: BotStatus) => void) {
    this.engine = engine;
    this.onStatusChange = onStatusChange;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.setStatus({ active: true, phase: 'booting', target: 'spiral' });
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
        this.setStatus({ active: true, phase: 'online', target: this.describeStockTarget() });
      }
    } finally {
      this.running = false;
    }
  }

  private runCycle(): { didAct: boolean } {
    let didAct = false;

    for (let actions = 0; actions < MAX_ACTIONS_PER_TICK; actions++) {
      if (this.placeSpiralWatchtower()) {
        didAct = true;
        continue;
      }

      if (this.placeBestExtractor()) {
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

  private placeSpiralWatchtower(): boolean {
    const target = this.findSpiralPlacement(WATCHTOWER_BUILDING_TYPE_ID, this.spiralStep);
    if (!target) return false;

    const placedId = this.engine.placeBuilding(WATCHTOWER_BUILDING_TYPE_ID, { x: target.x, y: target.y }, Direction.North, {
      emitSfx: false,
    });
    if (placedId === null) return false;

    this.spiralStep = target.step + 1;
    this.setStatus({ active: true, phase: 'spiraling', target: `tower @ ${target.x},${target.y}` });
    return true;
  }

  private placeBestExtractor(): boolean {
    const anchor = this.getSpiralAnchor();
    const candidates = this.collectVisibleDeposits(anchor);
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

  private ensureEnergySupply(): boolean {
    const extractors = this.getBuildingsByType(EXTRACTOR_BUILDING_TYPE_ID);
    if (extractors.length === 0) return false;

    const anchor = this.getSpiralAnchor();
    const solarPanels = this.getBuildingsByType(SOLAR_PANEL_BUILDING_TYPE_ID);
    const batteries = this.getBuildingsByType(BATTERY_BASIC_BUILDING_TYPE_ID);
    const unpoweredExtractors = extractors.filter((id) => this.engine.getBuildingPowerState(id) !== 'powered');
    const daylight = getDaylightFactor(this.engine.simulationTime);

    const targetSolarPanels = Math.max(extractors.length, Math.ceil(extractors.length * 1.25));
    const targetBatteries = Math.max(1, Math.ceil(extractors.length / 3));

    if (solarPanels.length < targetSolarPanels || (unpoweredExtractors.length > 0 && daylight >= 0.2)) {
      const origin = this.findBestPlacement(SOLAR_PANEL_BUILDING_TYPE_ID, anchor);
      if (origin) {
        const placedId = this.engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, origin, Direction.North, { emitSfx: false });
        if (placedId !== null) {
          this.setStatus({ active: true, phase: 'powering', target: `solar @ ${origin.x},${origin.y}` });
          return true;
        }
      }
    }

    if (batteries.length < targetBatteries || unpoweredExtractors.length > 0) {
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

  private collectVisibleDeposits(reference: { x: number; y: number }): Array<{ x: number; y: number; resource: ResourceTypeT; score: number }> {
    const deposits: Array<{ x: number; y: number; resource: ResourceTypeT; score: number }> = [];

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
          score:
            RESOURCE_PRIORITY[resource] * 1000 - (Math.abs(x - reference.x) + Math.abs(y - reference.y)),
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

  private findBestPlacement(typeId: BuildingTypeId, reference: { x: number; y: number }): { x: number; y: number } | null {
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

  private findSpiralPlacement(typeId: BuildingTypeId, startStep: number): { x: number; y: number; step: number } | null {
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);
    const limit = GRID_WIDTH * GRID_HEIGHT * 2;

    for (let step = startStep; step < limit; step++) {
      const candidate = spiralCoordinate(step, centerX, centerY);
      if (!isInBounds(candidate.x, candidate.y)) continue;
      if (!this.engine.canPlaceBuilding(typeId, candidate, Direction.North).ok) continue;
      return { ...candidate, step };
    }

    return null;
  }

  private getSpiralAnchor(): { x: number; y: number } {
    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);
    return spiralCoordinate(this.spiralStep, centerX, centerY);
  }

  private describeStockTarget(): string {
    const stock = this.engine.getResourceCounts();
    return `stock c${stock.coal} i${stock.ironOre} cu${stock.copperOre}`;
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
