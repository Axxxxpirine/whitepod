import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';

const EXTRACTION_INTERVAL_S = 60 / EXTRACTOR_RATE_PER_MIN;
const CYCLE_S = 120;

function makeEngine(dayNightCycleSeconds = 1e9): GameEngine {
  const engine = new GameEngine(800, 600, { dayNightCycleSeconds });
  engine.simulationTime = 0.5;
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  return engine;
}

function simulate(engine: GameEngine, totalSeconds: number, step = 0.1) {
  let elapsed = 0;
  while (elapsed < totalSeconds) {
    const dt = Math.min(step, totalSeconds - elapsed);
    engine.update(dt);
    elapsed += dt;
  }
}

function placeExtractorWithStorage(
  engine: GameEngine,
  depositX: number,
  depositY: number,
  resourceType: ResourceType,
  storageX: number,
  storageY: number,
) {
  engine.placeResource(depositX, depositY, resourceType);
  const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: depositX, y: depositY })!;
  const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: storageX, y: storageY })!;
  const belt = engine.placeBelt(
    { building: extractor, port: 'out_east' },
    { building: storage, port: 'in_west' },
  );
  expect(belt.ok).toBe(true);
  return { extractor, storage };
}

describe('connected extraction scenarios', () => {
  it('stores exactly N items after N extraction intervals', () => {
    const engine = makeEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const { extractor, storage } = placeExtractorWithStorage(engine, 2, 1, ResourceType.Regolith, 6, 0);
    engine.connectBuildings(solar, extractor);

    for (let n = 1; n <= 10; n += 1) {
      engine.update(EXTRACTION_INTERVAL_S);
      expect(engine.getStorageInventory(storage)?.regolith).toBe(n);
      expect(engine.getResourceCounts().regolith).toBe(n);
    }
  });

  it('does not store anything when the extractor is unpowered', () => {
    const engine = makeEngine();
    const { storage } = placeExtractorWithStorage(engine, 5, 5, ResourceType.Hydrogen, 9, 4);

    simulate(engine, 60, EXTRACTION_INTERVAL_S);

    expect(engine.getStorageInventory(storage)?.hydrogen).toBe(0);
    expect(engine.getResourceRates().hydrogen).toBe(0);
  });

  it('stores multiple resource types independently when each line has its own sink', () => {
    const engine = makeEngine();
    const solarA = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const solarB = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 5 })!;
    const regolith = placeExtractorWithStorage(engine, 2, 1, ResourceType.Regolith, 6, 0);
    const hydrogen = placeExtractorWithStorage(engine, 2, 5, ResourceType.Hydrogen, 6, 4);

    engine.connectBuildings(solarA, regolith.extractor);
    engine.connectBuildings(solarB, hydrogen.extractor);
    simulate(engine, 30, EXTRACTION_INTERVAL_S);

    expect(engine.getStorageInventory(regolith.storage)?.regolith).toBe(15);
    expect(engine.getStorageInventory(hydrogen.storage)?.hydrogen).toBe(15);
    expect(engine.getResourceCounts()).toMatchObject({
      regolith: 15,
      hydrogen: 15,
      oxygen: 0,
    });
  });

  it('reports extractor rates only for powered lines that have a real sink', () => {
    const engine = makeEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const powered = placeExtractorWithStorage(engine, 2, 1, ResourceType.Regolith, 6, 0);
    placeExtractorWithStorage(engine, 2, 5, ResourceType.Oxygen, 6, 4);

    engine.connectBuildings(solar, powered.extractor);

    const rates = engine.getResourceRates();
    expect(rates.regolith).toBe(EXTRACTOR_RATE_PER_MIN);
    expect(rates.oxygen).toBe(0);
  });

  it('stops storing resources immediately when power is disconnected', () => {
    const engine = makeEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const line = placeExtractorWithStorage(engine, 2, 1, ResourceType.Regolith, 6, 0);

    engine.connectBuildings(solar, line.extractor);
    simulate(engine, 10, EXTRACTION_INTERVAL_S);
    expect(engine.getStorageInventory(line.storage)?.regolith).toBe(5);

    engine.disconnectBuildings(solar, line.extractor);
    simulate(engine, 10, EXTRACTION_INTERVAL_S);
    expect(engine.getStorageInventory(line.storage)?.regolith).toBe(5);
  });

  it('resumes storing resources when power is restored', () => {
    const engine = makeEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const line = placeExtractorWithStorage(engine, 2, 1, ResourceType.Regolith, 6, 0);

    engine.connectBuildings(solar, line.extractor);
    simulate(engine, 10, EXTRACTION_INTERVAL_S);
    engine.disconnectBuildings(solar, line.extractor);
    simulate(engine, 10, EXTRACTION_INTERVAL_S);
    engine.connectBuildings(solar, line.extractor);
    simulate(engine, 10, EXTRACTION_INTERVAL_S);

    expect(engine.getStorageInventory(line.storage)?.regolith).toBe(10);
  });

  it('produces through a full day-night cycle when a battery bridges the night', () => {
    const engine = makeEngine(CYCLE_S);
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const battery = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const line = placeExtractorWithStorage(engine, 6, 1, ResourceType.Regolith, 10, 0);

    engine.connectBuildings(solar, battery);
    engine.connectBuildings(battery, line.extractor);
    simulate(engine, CYCLE_S, EXTRACTION_INTERVAL_S);

    expect(engine.getStorageInventory(line.storage)?.regolith ?? 0).toBeGreaterThan(0);
  });

  it('battery-backed extraction stores more than solar-only extraction over one cycle', () => {
    const solarOnly = makeEngine(CYCLE_S);
    const batteryBacked = makeEngine(CYCLE_S);

    const solarOnlySolar = solarOnly.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const solarOnlyLine = placeExtractorWithStorage(solarOnly, 4, 1, ResourceType.Regolith, 8, 0);
    solarOnly.connectBuildings(solarOnlySolar, solarOnlyLine.extractor);

    const batterySolar = batteryBacked.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const battery = batteryBacked.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const batteryLine = placeExtractorWithStorage(batteryBacked, 6, 1, ResourceType.Regolith, 10, 0);
    batteryBacked.connectBuildings(batterySolar, battery);
    batteryBacked.connectBuildings(battery, batteryLine.extractor);

    simulate(solarOnly, CYCLE_S, EXTRACTION_INTERVAL_S);
    simulate(batteryBacked, CYCLE_S, EXTRACTION_INTERVAL_S);

    expect(batteryBacked.getResourceCounts().regolith).toBeGreaterThan(solarOnly.getResourceCounts().regolith);
  });
});
