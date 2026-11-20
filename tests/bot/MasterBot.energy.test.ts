import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { GameEngine } from '@/game/engine/GameEngine';
import { MasterBot } from '@/game/bot/MasterBot';
import {
  calculateRequiredBatteries,
  calculateRequiredSolar,
  checkBatteryChargeState,
  shouldPrioritizeBatteryOverSolar,
} from '@/game/bot/util/energyPlanning';
import { ResourceType, TileType } from '@/game/types';

const MIDNIGHT = 0;
const NOON = 0.5;
const TICK_MS = 400;

function createBase(simulationTime: number): GameEngine {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.setSimulationTime(simulationTime);
  for (const [x, y] of [[120, 120], [122, 120], [124, 120], [120, 124], [122, 124]]) {
    engine.placeResource(x, y, ResourceType.Regolith);
  }
  engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 126, y: 126 });
  return engine;
}

function countByType(engine: GameEngine, typeId: string): number {
  let count = 0;
  for (const building of engine.getBuildings().values()) {
    if (building.typeId === typeId) count += 1;
  }
  return count;
}

function runBot(engine: GameEngine, ticks: number, keepTime: number | null = null): void {
  const bot = new MasterBot(engine, () => {});
  bot.start();
  for (let i = 0; i < ticks; i++) {
    if (keepTime !== null) engine.setSimulationTime(keepTime);
    vi.advanceTimersByTime(TICK_MS);
  }
  bot.stop();
}

describe('MasterBot energy planning', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not keep adding batteries at night', () => {
    const engine = createBase(MIDNIGHT);
    runBot(engine, 50, MIDNIGHT);

    const extractors = countByType(engine, EXTRACTOR_BUILDING_TYPE_ID);
    expect(extractors).toBeGreaterThan(0);
    expect(countByType(engine, BATTERY_BASIC_BUILDING_TYPE_ID)).toBeLessThanOrEqual(
      calculateRequiredBatteries(engine),
    );
    expect(countByType(engine, SOLAR_PANEL_BUILDING_TYPE_ID)).toBeLessThanOrEqual(
      Math.max(calculateRequiredSolar(extractors), 2),
    );
  });

  it('wires every extractor to the grid instead of only adding generators', () => {
    const engine = createBase(NOON);
    runBot(engine, 50, NOON);

    for (const [id, building] of engine.getBuildings()) {
      if (building.typeId !== EXTRACTOR_BUILDING_TYPE_ID) continue;
      expect(engine.getBuildingPowerState(id)).toBe('powered');
    }
    const stats = engine.getEnergyGlobalStats();
    expect(stats.unservedLoad).toBe(0);
  });
});

describe('battery charge helpers', () => {
  it('reads battery charge as a share of capacity', () => {
    const engine = new GameEngine(640, 480);
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    const battery = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 10, y: 10 });
    expect(battery).not.toBeNull();
    const { capacity } = engine.getEnergyStorageTotals();

    engine.batteryCharges.set(battery!, capacity);
    expect(shouldPrioritizeBatteryOverSolar(engine)).toBe(false);
    expect(checkBatteryChargeState(engine).chargedPercent).toBeCloseTo(100);

    engine.batteryCharges.set(battery!, capacity * 0.25);
    expect(shouldPrioritizeBatteryOverSolar(engine)).toBe(true);
    expect(checkBatteryChargeState(engine).chargedPercent).toBeCloseTo(25);
  });
});
