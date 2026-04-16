import { beforeEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
  getBuildingType,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { getDaylightFactor } from '@/game/renderer/DayNightOverlayRenderer';

const EXTRACTION_INTERVAL_SECONDS = 60 / EXTRACTOR_RATE_PER_MIN;
const FULL_DAY_NIGHT_CYCLE_SECONDS = 120;
const HALF_NIGHT_SECONDS = FULL_DAY_NIGHT_CYCLE_SECONDS / 2;

function groundEverywhere(engine: GameEngine) {
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
}

function simulate(engine: GameEngine, totalSeconds: number, stepSeconds = 0.1) {
  let elapsed = 0;
  while (elapsed < totalSeconds) {
    const dt = Math.min(stepSeconds, totalSeconds - elapsed);
    engine.update(dt);
    elapsed += dt;
  }
}

function connectExtractorToStorage(engine: GameEngine, extractorId: number, storageX: number, storageY: number, port = 'in_west') {
  const storageId = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: storageX, y: storageY })!;
  const belt = engine.placeBelt(
    { building: extractorId, port: 'out_east' },
    { building: storageId, port },
  );
  expect(belt.ok).toBe(true);
  return storageId;
}

function simulateUntil(
  engine: GameEngine,
  predicate: () => boolean,
  stepSeconds = 0.1,
  maxSeconds = FULL_DAY_NIGHT_CYCLE_SECONDS * 10,
): number {
  let elapsed = 0;
  while (elapsed < maxSeconds) {
    if (predicate()) return elapsed;
    engine.update(stepSeconds);
    elapsed += stepSeconds;
  }
  if (predicate()) return elapsed;
  throw new Error(`Condition not reached within ${maxSeconds}s`);
}

function expectedChargeTimeSeconds({
  startSimulationTime,
  capacity,
  chargeRate,
  solarProduction,
  panelCount,
  stepSeconds = 0.1,
  maxSeconds = FULL_DAY_NIGHT_CYCLE_SECONDS * 10,
}: {
  startSimulationTime: number;
  capacity: number;
  chargeRate: number;
  solarProduction: number;
  panelCount: number;
  stepSeconds?: number;
  maxSeconds?: number;
}): number {
  let simulationTime = startSimulationTime;
  let charge = 0;
  let elapsed = 0;

  while (elapsed < maxSeconds) {
    if (charge >= capacity) return elapsed;
    simulationTime = ((simulationTime + stepSeconds / FULL_DAY_NIGHT_CYCLE_SECONDS) % 1 + 1) % 1;
    const production = solarProduction * panelCount * getDaylightFactor(simulationTime);
    const dtHours = stepSeconds / FULL_DAY_NIGHT_CYCLE_SECONDS;
    const chargeWindow = Math.min(chargeRate * dtHours, capacity - charge);
    charge += Math.max(0, Math.min(production * dtHours, chargeWindow));
    elapsed += stepSeconds;
  }

  throw new Error(`Battery did not fill within ${maxSeconds}s`);
}

describe('GameEngine energy networks', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine(800, 600);
    engine.simulationTime = 0.5; // noon — full solar production
    groundEverywhere(engine);
  });

  it('computes production, consumption and remaining for a linked network', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.placeResource(2, 1, ResourceType.Hydrogen);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;

    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    const network = engine.getEnergyNetworkForBuilding(extractorId);
    expect(network).toEqual({
      buildingIds: [solarId, extractorId].sort((a, b) => a - b),
      production: 10,
      consumption: 4,
      remaining: 6,
    });
  });

  it('merges networks when linking through an existing connected building', () => {
    const solarA = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.placeResource(2, 1, ResourceType.Hydrogen);
    const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    const solarB = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 3, y: 1 })!;

    engine.connectBuildings(solarA, extractor);
    engine.connectBuildings(solarB, solarA);

    const network = engine.getEnergyNetworkForBuilding(solarB)!;
    expect(network.buildingIds).toEqual([solarA, extractor, solarB].sort((a, b) => a - b));
    expect(network.production).toBe(20);
    expect(network.consumption).toBe(4);
    expect(network.remaining).toBe(16);
  });

  it('tracks isolated buildings as separate one-node networks', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 5, y: 5 })!;
    engine.placeResource(7, 5, ResourceType.Hydrogen);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 7, y: 5 })!;

    const networks = engine.getEnergyNetworkBalances();
    expect(networks).toHaveLength(2);

    const solarNetwork = networks.find((network) => network.buildingIds.includes(solarId));
    const extractorNetwork = networks.find((network) => network.buildingIds.includes(extractorId));

    expect(solarNetwork).toMatchObject({ production: 10, consumption: 0, remaining: 10 });
    expect(extractorNetwork).toMatchObject({ production: 0, consumption: 4, remaining: -4 });
  });

  it('drops links and recalculates balance when a building is removed', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.placeResource(11, 10, ResourceType.Hydrogen);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 11, y: 10 })!;
    engine.connectBuildings(solarId, extractorId);

    expect(engine.removeBuilding(solarId)).toBe(true);

    const network = engine.getEnergyNetworkForBuilding(extractorId)!;
    expect(network).toMatchObject({ production: 0, consumption: 4, remaining: -4 });
  });

  it('computes power states (neutral, powered, unpowered)', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.placeResource(2, 1, ResourceType.Hydrogen);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;

    expect(engine.getBuildingPowerState(solarId)).toBe('neutral');
    expect(engine.getBuildingPowerState(extractorId)).toBe('unpowered');

    engine.connectBuildings(solarId, extractorId);
    expect(engine.getBuildingPowerState(extractorId)).toBe('powered');

    expect(engine.removeBuilding(solarId)).toBe(true);
    expect(engine.getBuildingPowerState(extractorId)).toBe('unpowered');
  });

  it('aggregates global energy stats with online/offline consumers', () => {
    const solarA = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.placeResource(11, 10, ResourceType.Hydrogen);
    const extractorA = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 11, y: 10 })!;
    engine.connectBuildings(solarA, extractorA);

    engine.placeResource(20, 20, ResourceType.Hydrogen);
    const extractorB = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 20, y: 20 })!;

    const stats = engine.getEnergyGlobalStats();
    expect(stats).toEqual({
      production: 10,
      servedConsumption: 4,
      demandedConsumption: 8,
      surplusPower: 6,
      demandBalance: 2,
      unservedLoad: 4,
      onlineConsumers: 1,
      offlineConsumers: 1,
    });
    expect(engine.getBuildingPowerState(extractorA)).toBe('powered');
    expect(engine.getBuildingPowerState(extractorB)).toBe('unpowered');
  });

  it('reports explicit network stats for powered and unpowered components', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.placeResource(2, 1, ResourceType.Hydrogen);
    const poweredExtractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    engine.placeResource(8, 8, ResourceType.Regolith);
    const offlineExtractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 8, y: 8 })!;

    engine.connectBuildings(solarId, poweredExtractor);

    expect(engine.getEnergyStatsForBuilding(poweredExtractor)).toEqual({
      buildingIds: [solarId, poweredExtractor].sort((a, b) => a - b),
      isPowered: true,
      production: 10,
      servedConsumption: 4,
      demandedConsumption: 4,
      surplusPower: 6,
      demandBalance: 6,
      unservedLoad: 0,
    });

    expect(engine.getEnergyStatsForBuilding(offlineExtractor)).toEqual({
      buildingIds: [offlineExtractor],
      isPowered: false,
      production: 0,
      servedConsumption: 0,
      demandedConsumption: 4,
      surplusPower: 0,
      demandBalance: -4,
      unservedLoad: 4,
    });
  });

  it('keeps served load online when a battery can cover a deficit', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const batteryId = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    engine.placeResource(6, 1, ResourceType.Regolith);
    engine.placeResource(8, 1, ResourceType.Hydrogen);
    engine.placeResource(10, 1, ResourceType.Oxygen);
    const extractorA = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 6, y: 1 })!;
    const extractorB = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 8, y: 1 })!;
    const extractorC = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 10, y: 1 })!;

    engine.connectBuildings(solarId, batteryId);
    engine.connectBuildings(solarId, extractorA);
    engine.connectBuildings(solarId, extractorB);
    engine.connectBuildings(solarId, extractorC);
    engine.batteryCharges.set(batteryId, 10);

    expect(engine.getEnergyGlobalStats()).toEqual({
      production: 10,
      servedConsumption: 12,
      demandedConsumption: 12,
      surplusPower: -2,
      demandBalance: -2,
      unservedLoad: 0,
      onlineConsumers: 3,
      offlineConsumers: 0,
    });

    engine.update(12);

    expect(engine.batteryCharges.get(batteryId)).toBeLessThan(10);
  });

  it('treats isolated generation as pure surplus in display stats', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 14, y: 14 })!;

    expect(engine.getEnergyGlobalStats()).toEqual({
      production: 10,
      servedConsumption: 0,
      demandedConsumption: 0,
      surplusPower: 10,
      demandBalance: 10,
      unservedLoad: 0,
      onlineConsumers: 0,
      offlineConsumers: 0,
    });

    expect(engine.getEnergyStatsForBuilding(solarId)).toEqual({
      buildingIds: [solarId],
      isPowered: true,
      production: 10,
      servedConsumption: 0,
      demandedConsumption: 0,
      surplusPower: 10,
      demandBalance: 10,
      unservedLoad: 0,
    });
  });

  it('can disconnect an existing energy link', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.placeResource(2, 1, ResourceType.Hydrogen);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;

    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);
    expect(engine.areBuildingsEnergyLinked(solarId, extractorId)).toBe(true);
    expect(engine.disconnectBuildings(solarId, extractorId)).toBe(true);
    expect(engine.areBuildingsEnergyLinked(solarId, extractorId)).toBe(false);

    const solarNetwork = engine.getEnergyNetworkForBuilding(solarId)!;
    const extractorNetwork = engine.getEnergyNetworkForBuilding(extractorId)!;
    expect(solarNetwork).toMatchObject({ production: 10, consumption: 0, remaining: 10 });
    expect(extractorNetwork).toMatchObject({ production: 0, consumption: 4, remaining: -4 });
  });

  it('keeps a powered extractor producing after many extraction intervals', () => {
    const steadyEngine = new GameEngine(800, 600, { dayNightCycleSeconds: 1_000_000_000 });
    steadyEngine.simulationTime = 0.5;
    groundEverywhere(steadyEngine);

    const solarId = steadyEngine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    steadyEngine.placeResource(2, 1, ResourceType.Regolith);
    const extractorId = steadyEngine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    connectExtractorToStorage(steadyEngine, extractorId, 6, 0);

    expect(steadyEngine.connectBuildings(solarId, extractorId)).toBe(true);

    const initialAmount = steadyEngine.grid.getResourceAmount(2, 1);
    const extractionIntervalSeconds = 60 / EXTRACTOR_RATE_PER_MIN;

    for (let i = 0; i < 250; i++) {
      steadyEngine.update(extractionIntervalSeconds);
    }

    expect(steadyEngine.getResourceCounts().regolith).toBe(250);
    expect(steadyEngine.grid.getResourceAmount(2, 1)).toBe(initialAmount);
    expect(steadyEngine.getResourceRates().regolith).toBe(EXTRACTOR_RATE_PER_MIN);
    expect(steadyEngine.getResourceRates().hydrogen).toBe(0);
    expect(steadyEngine.getResourceRates().oxygen).toBe(0);
  });

  it('keeps a battery-backed extractor producing after many extraction intervals', () => {
    const solarAId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const solarBId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    const batteryId = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 4, y: 1 })!;
    engine.placeResource(7, 1, ResourceType.Regolith);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 7, y: 1 })!;
    connectExtractorToStorage(engine, extractorId, 11, 0);

    expect(engine.connectBuildings(solarAId, extractorId)).toBe(true);
    expect(engine.connectBuildings(solarBId, extractorId)).toBe(true);
    expect(engine.connectBuildings(batteryId, extractorId)).toBe(true);

    const initialAmount = engine.grid.getResourceAmount(7, 1);
    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;
    engine.batteryCharges.set(batteryId, battery.capacity);

    for (let i = 0; i < 250; i++) {
      engine.update(EXTRACTION_INTERVAL_SECONDS);
    }

    expect(engine.getResourceCounts().regolith).toBe(250);
    expect(engine.grid.getResourceAmount(7, 1)).toBe(initialAmount);
    expect(engine.getResourceRates().regolith).toBe(EXTRACTOR_RATE_PER_MIN);
    expect(engine.getResourceRates().hydrogen).toBe(0);
    expect(engine.getResourceRates().oxygen).toBe(0);
  });

  it('charges an empty battery to full with two solar panels over a daylight-aware simulation', () => {
    const solarAId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const solarBId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    const batteryId = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    engine.connectBuildings(solarAId, batteryId);
    engine.connectBuildings(solarBId, batteryId);

    const solarProd = getBuildingType(SOLAR_PANEL_BUILDING_TYPE_ID)!.energy!.production!;
    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;

    const elapsedSeconds = simulateUntil(
      engine,
      () => (engine.batteryCharges.get(batteryId) ?? 0) >= battery.capacity,
      0.1,
      FULL_DAY_NIGHT_CYCLE_SECONDS * 4,
    );
    const expectedSeconds = expectedChargeTimeSeconds({
      startSimulationTime: 0.5,
      capacity: battery.capacity,
      chargeRate: battery.chargeRate,
      solarProduction: solarProd,
      panelCount: 2,
    });

    expect(elapsedSeconds).toBeCloseTo(expectedSeconds, 5);
    expect(engine.batteryCharges.get(batteryId)).toBeCloseTo(battery.capacity, 5);
  });

  it('discharges a battery at the kW rate when demand exceeds production', () => {
    const batteryId = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.placeResource(4, 1, ResourceType.Hydrogen);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 4, y: 1 })!;
    engine.connectBuildings(batteryId, extractorId);

    const extractorCons = getBuildingType(EXTRACTOR_BUILDING_TYPE_ID)!.energy!.consumption!;
    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;
    engine.batteryCharges.set(batteryId, battery.capacity);

    engine.update(120);
    expect(engine.batteryCharges.get(batteryId)).toBeCloseTo(battery.capacity - extractorCons, 5);
    expect(engine.getBuildingPowerState(extractorId)).toBe('powered');
  });

  it('stores enough energy in one full battery to power one extractor for a full night', () => {
    const batteryId = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.placeResource(4, 1, ResourceType.Hydrogen);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 4, y: 1 })!;
    connectExtractorToStorage(engine, extractorId, 8, 0);
    expect(engine.connectBuildings(batteryId, extractorId)).toBe(true);

    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;
    const extractorConsumption = getBuildingType(EXTRACTOR_BUILDING_TYPE_ID)!.energy!.consumption!;
    engine.batteryCharges.set(batteryId, battery.capacity);
    engine.setSimulationTime(0.75);

    simulate(engine, HALF_NIGHT_SECONDS, EXTRACTION_INTERVAL_SECONDS);

    expect(engine.getBuildingPowerState(extractorId)).toBe('powered');
    expect(engine.getResourceCounts().hydrogen).toBe(EXTRACTOR_RATE_PER_MIN);
    expect(engine.batteryCharges.get(batteryId)).toBeCloseTo(
      battery.capacity - extractorConsumption * (HALF_NIGHT_SECONDS / FULL_DAY_NIGHT_CYCLE_SECONDS),
      5,
    );
  });

  it('does not discharge a battery when the network deficit exceeds available battery power', () => {
    const batteryId = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const extractorIds: number[] = [];

    for (let i = 0; i < 6; i++) {
      const x = 4 + i * 2;
      engine.placeResource(x, 1, ResourceType.Hydrogen);
      const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x, y: 1 })!;
      extractorIds.push(extractorId);
      expect(engine.connectBuildings(batteryId, extractorId)).toBe(true);
    }

    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;
    engine.batteryCharges.set(batteryId, battery.capacity);

    engine.update(120);

    expect(engine.batteryCharges.get(batteryId)).toBeCloseTo(battery.capacity, 5);
    expect(engine.getResourceCounts().hydrogen).toBe(0);
    for (const extractorId of extractorIds) {
      expect(engine.getBuildingPowerState(extractorId)).toBe('unpowered');
    }
  });

  it('reports global energy storage totals across all batteries', () => {
    const batteryA = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const batteryB = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 5, y: 1 })!;
    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;

    engine.batteryCharges.set(batteryA, battery.capacity);
    engine.batteryCharges.set(batteryB, battery.capacity / 2);

    const totals = engine.getEnergyStorageTotals();
    expect(totals.stored).toBeCloseTo(battery.capacity * 1.5, 5);
    expect(totals.capacity).toBeCloseTo(battery.capacity * 2, 5);
  });

  it('refuses energy links for buildings outside the electrical system', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const storageId = engine.placeBuilding('storage_basic', { x: 4, y: 4 })!;
    const placeholderId = engine.placeBuilding('placeholder_1x1', { x: 8, y: 8 })!;

    expect(engine.connectBuildings(solarId, storageId)).toBe(false);
    expect(engine.connectBuildings(solarId, placeholderId)).toBe(false);
    expect(engine.areBuildingsEnergyLinked(solarId, storageId)).toBe(false);
    expect(engine.areBuildingsEnergyLinked(solarId, placeholderId)).toBe(false);
  });
});
