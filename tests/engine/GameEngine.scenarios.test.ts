import { describe, expect, it, beforeEach } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
  getBuildingType,
  SOLAR_PANEL_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { getDaylightFactor } from '@/game/renderer/DayNightOverlayRenderer';

const EXTRACTION_INTERVAL_S = 60 / EXTRACTOR_RATE_PER_MIN;
const CYCLE_S = 120;

function groundEverywhere(engine: GameEngine) {
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
}

function simulate(engine: GameEngine, totalSeconds: number, step = 0.1) {
  let elapsed = 0;
  while (elapsed < totalSeconds) {
    const dt = Math.min(step, totalSeconds - elapsed);
    engine.update(dt);
    elapsed += dt;
  }
}

function steadyEngine(): GameEngine {
  const engine = new GameEngine(800, 600, { dayNightCycleSeconds: 1e9 });
  engine.simulationTime = 0.5;
  groundEverywhere(engine);
  return engine;
}

function noonEngine(): GameEngine {
  const engine = new GameEngine(800, 600);
  engine.simulationTime = 0.5;
  groundEverywhere(engine);
  return engine;
}

function placeExtractorWithResource(
  engine: GameEngine,
  x: number,
  y: number,
  resource: ResourceType,
) {
  engine.placeResource(x, y, resource);
  return engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x, y })!;
}

// ─────────────────────────────────────────────────────────────────────
// 1. EXTRACTION RATE ACCURACY
// ─────────────────────────────────────────────────────────────────────

describe('Extraction rate accuracy', () => {
  it('produces exactly N items after N extraction intervals', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 2, 1, ResourceType.Regolith);
    engine.connectBuildings(solar, ext);

    for (let n = 1; n <= 10; n++) {
      engine.update(EXTRACTION_INTERVAL_S);
      expect(engine.getResourceCounts().regolith).toBe(n);
    }
  });

  it('produces 30 items in exactly 60 seconds at steady state', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 2, 1, ResourceType.Regolith);
    engine.connectBuildings(solar, ext);

    simulate(engine, 60, EXTRACTION_INTERVAL_S);
    expect(engine.getResourceCounts().regolith).toBe(30);
  });

  it('produces 0 items when extractor is unpowered', () => {
    const engine = steadyEngine();
    placeExtractorWithResource(engine, 5, 5, ResourceType.Hydrogen);
    simulate(engine, 120, EXTRACTION_INTERVAL_S);
    expect(engine.getResourceCounts().hydrogen).toBe(0);
  });

  it('handles all three resource types independently', () => {
    const engine = steadyEngine();
    const s1 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const s2 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 3 })!;
    const s3 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 5 })!;
    const eRegolith = placeExtractorWithResource(engine, 2, 1, ResourceType.Regolith);
    const eHydrogen = placeExtractorWithResource(engine, 2, 3, ResourceType.Hydrogen);
    const eOxygen = placeExtractorWithResource(engine, 2, 5, ResourceType.Oxygen);
    engine.connectBuildings(s1, eRegolith);
    engine.connectBuildings(s2, eHydrogen);
    engine.connectBuildings(s3, eOxygen);

    for (let i = 0; i < 15; i++) engine.update(EXTRACTION_INTERVAL_S);

    const counts = engine.getResourceCounts();
    expect(counts.regolith).toBe(15);
    expect(counts.hydrogen).toBe(15);
    expect(counts.oxygen).toBe(15);
  });

  it('reports correct rates for mixed powered/unpowered extractors', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const powered = placeExtractorWithResource(engine, 2, 1, ResourceType.Regolith);
    placeExtractorWithResource(engine, 10, 10, ResourceType.Regolith);
    engine.connectBuildings(solar, powered);

    const rates = engine.getResourceRates();
    expect(rates.regolith).toBe(EXTRACTOR_RATE_PER_MIN);
    expect(rates.hydrogen).toBe(0);
    expect(rates.oxygen).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. ENERGY BALANCE ARITHMETIC
// ─────────────────────────────────────────────────────────────────────

describe('Energy balance arithmetic', () => {
  let engine: GameEngine;
  beforeEach(() => {
    engine = steadyEngine();
  });

  it('1 solar (10 kW) powers exactly 2 extractors (4 kW each) with 2 kW remaining', () => {
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const e1 = placeExtractorWithResource(engine, 3, 1, ResourceType.Regolith);
    const e2 = placeExtractorWithResource(engine, 5, 1, ResourceType.Hydrogen);
    engine.connectBuildings(solar, e1);
    engine.connectBuildings(solar, e2);

    const net = engine.getEnergyNetworkForBuilding(solar)!;
    expect(net.production).toBe(10);
    expect(net.consumption).toBe(8);
    expect(net.remaining).toBe(2);
    expect(engine.getBuildingPowerState(e1)).toBe('powered');
    expect(engine.getBuildingPowerState(e2)).toBe('powered');
  });

  it('1 solar cannot power 3 extractors (12 kW > 10 kW), all unpowered', () => {
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const extractors = [3, 5, 7].map((x) => {
      const ext = placeExtractorWithResource(engine, x, 1, ResourceType.Regolith);
      engine.connectBuildings(solar, ext);
      return ext;
    });

    const net = engine.getEnergyNetworkForBuilding(solar)!;
    expect(net.production).toBe(10);
    expect(net.consumption).toBe(12);
    expect(net.remaining).toBe(-2);
    for (const ext of extractors) {
      expect(engine.getBuildingPowerState(ext)).toBe('unpowered');
    }
  });

  it('2 solars power 5 extractors (20 kW = 20 kW), exactly balanced', () => {
    const s1 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const s2 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 3 })!;
    const extractors = [3, 5, 7, 9, 11].map((x) => {
      const ext = placeExtractorWithResource(engine, x, 1, ResourceType.Regolith);
      engine.connectBuildings(s1, ext);
      return ext;
    });
    engine.connectBuildings(s1, s2);

    const net = engine.getEnergyNetworkForBuilding(s1)!;
    expect(net.production).toBe(20);
    expect(net.consumption).toBe(20);
    expect(net.remaining).toBe(0);
    for (const ext of extractors) {
      expect(engine.getBuildingPowerState(ext)).toBe('powered');
    }
  });

  it('adding a solar to an underpowered network restores power', () => {
    const s1 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const extractors = [3, 5, 7].map((x) => {
      const ext = placeExtractorWithResource(engine, x, 1, ResourceType.Regolith);
      engine.connectBuildings(s1, ext);
      return ext;
    });

    for (const ext of extractors) {
      expect(engine.getBuildingPowerState(ext)).toBe('unpowered');
    }

    const s2 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 3 })!;
    engine.connectBuildings(s1, s2);
    for (const ext of extractors) {
      expect(engine.getBuildingPowerState(ext)).toBe('powered');
    }
  });

  it('removing a solar from a balanced network cuts all consumers', () => {
    const s1 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const s2 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 3 })!;
    const ext1 = placeExtractorWithResource(engine, 3, 1, ResourceType.Regolith);
    const ext2 = placeExtractorWithResource(engine, 5, 1, ResourceType.Hydrogen);
    const ext3 = placeExtractorWithResource(engine, 7, 1, ResourceType.Oxygen);
    engine.connectBuildings(s1, s2);
    engine.connectBuildings(s1, ext1);
    engine.connectBuildings(s1, ext2);
    engine.connectBuildings(s1, ext3);

    expect(engine.getBuildingPowerState(ext1)).toBe('powered');
    engine.removeBuilding(s2);

    for (const ext of [ext1, ext2, ext3]) {
      expect(engine.getBuildingPowerState(ext)).toBe('unpowered');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. BATTERY CHARGE/DISCHARGE NUMERICS
// ─────────────────────────────────────────────────────────────────────

describe('Battery charge/discharge numerics', () => {
  const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;
  const extractorCons = getBuildingType(EXTRACTOR_BUILDING_TYPE_ID)!.energy!.consumption!;
  const solarProd = getBuildingType(SOLAR_PANEL_BUILDING_TYPE_ID)!.energy!.production!;

  it('charges at surplus rate scaled by daylight over a full cycle', () => {
    const engine = noonEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    engine.connectBuildings(solar, bat);

    const step = 0.1;
    let expectedCharge = 0;
    let simTime = 0.5;
    for (let elapsed = 0; elapsed < CYCLE_S; elapsed += step) {
      simTime = ((simTime + step / CYCLE_S) % 1 + 1) % 1;
      const production = solarProd * getDaylightFactor(simTime);
      const dtHours = step / CYCLE_S;
      const available = production * dtHours;
      const maxByRate = battery.chargeRate * dtHours;
      const maxByCap = battery.capacity - expectedCharge;
      expectedCharge += Math.max(0, Math.min(available, maxByRate, maxByCap));
    }

    simulate(engine, CYCLE_S, step);
    expect(engine.batteryCharges.get(bat)).toBeCloseTo(expectedCharge, 1);
  });

  it('caps charge at battery capacity', () => {
    const engine = noonEngine();
    const s1 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const s2 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 3 })!;
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    engine.connectBuildings(s1, bat);
    engine.connectBuildings(s2, bat);

    simulate(engine, CYCLE_S * 2, 0.1);
    expect(engine.batteryCharges.get(bat)!).toBeLessThanOrEqual(battery.capacity + 1e-9);
  });

  it('discharges at deficit rate: 4 kW deficit for 1 sim-hour = 4 kWh', () => {
    const engine = noonEngine();
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 4, 1, ResourceType.Regolith);
    engine.connectBuildings(bat, ext);
    engine.batteryCharges.set(bat, battery.capacity);

    simulate(engine, CYCLE_S, 0.1);
    expect(engine.batteryCharges.get(bat)).toBeCloseTo(
      battery.capacity - extractorCons,
      0,
    );
  });

  it('battery fully depletes and extractor stops', () => {
    const engine = noonEngine();
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 4, 1, ResourceType.Regolith);
    engine.connectBuildings(bat, ext);
    engine.batteryCharges.set(bat, battery.capacity);

    simulate(engine, CYCLE_S * 5, 0.5);

    expect(engine.batteryCharges.get(bat)).toBeCloseTo(0, 1);
    expect(engine.getBuildingPowerState(ext)).toBe('unpowered');
  });

  it('battery runtime: charge decreases monotonically under pure deficit', () => {
    const engine = noonEngine();
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 4, 1, ResourceType.Regolith);
    engine.connectBuildings(bat, ext);
    engine.batteryCharges.set(bat, battery.capacity);

    let prevCharge = battery.capacity;
    for (let i = 0; i < 20; i++) {
      engine.update(1);
      const charge = engine.batteryCharges.get(bat)!;
      expect(charge).toBeLessThanOrEqual(prevCharge);
      prevCharge = charge;
    }
  });

  it('distributes charge proportionally across two batteries', () => {
    const engine = noonEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const bat1 = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const bat2 = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 6, y: 1 })!;
    engine.connectBuildings(solar, bat1);
    engine.connectBuildings(solar, bat2);

    engine.update(1);

    const c1 = engine.batteryCharges.get(bat1)!;
    const c2 = engine.batteryCharges.get(bat2)!;
    expect(c1).toBeCloseTo(c2, 5);
    expect(c1).toBeGreaterThan(0);
  });

  it('distributes discharge proportionally from two batteries', () => {
    const engine = noonEngine();
    const bat1 = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const bat2 = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 4, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 7, 1, ResourceType.Regolith);
    engine.connectBuildings(bat1, ext);
    engine.connectBuildings(bat2, ext);
    engine.batteryCharges.set(bat1, battery.capacity);
    engine.batteryCharges.set(bat2, battery.capacity);

    engine.update(1);

    const c1 = engine.batteryCharges.get(bat1)!;
    const c2 = engine.batteryCharges.get(bat2)!;
    expect(c1).toBeCloseTo(c2, 5);
    expect(c1).toBeLessThan(battery.capacity);
  });

  it('solar charges battery while also powering an extractor', () => {
    const engine = noonEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 6, 1, ResourceType.Regolith);
    engine.connectBuildings(solar, bat);
    engine.connectBuildings(solar, ext);

    engine.update(1);

    expect(engine.getBuildingPowerState(ext)).toBe('powered');
    expect(engine.batteryCharges.get(bat)!).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. DAY/NIGHT CYCLE & SOLAR PRODUCTION
// ─────────────────────────────────────────────────────────────────────

describe('Day/night cycle & solar production', () => {
  it('daylightFactor is 1.0 at noon (t=0.5)', () => {
    expect(getDaylightFactor(0.5)).toBeCloseTo(1.0, 10);
  });

  it('daylightFactor is 0.0 at midnight (t=0.0)', () => {
    expect(getDaylightFactor(0.0)).toBeCloseTo(0.0, 10);
  });

  it('daylightFactor is 0.0 at midnight (t=1.0 wraps)', () => {
    expect(getDaylightFactor(1.0)).toBeCloseTo(0.0, 10);
  });

  it('daylightFactor is symmetric around noon', () => {
    for (let offset = 0.05; offset <= 0.5; offset += 0.05) {
      const before = getDaylightFactor(0.5 - offset);
      const after = getDaylightFactor(0.5 + offset);
      expect(before).toBeCloseTo(after, 10);
    }
  });

  it('daylightFactor is monotonically increasing from midnight to noon', () => {
    let prev = getDaylightFactor(0);
    for (let t = 0.01; t <= 0.5; t += 0.01) {
      const current = getDaylightFactor(t);
      expect(current).toBeGreaterThanOrEqual(prev);
      prev = current;
    }
  });

  it('solar production at noon gives full network balance', () => {
    const engine = new GameEngine(800, 600);
    engine.simulationTime = 0.5;
    groundEverywhere(engine);

    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 2, 1, ResourceType.Regolith);
    engine.connectBuildings(solar, ext);

    const net = engine.getEnergyNetworkForBuilding(solar)!;
    expect(net.production).toBe(10);
  });

  it('solar production at midnight gives zero', () => {
    const engine = new GameEngine(800, 600);
    engine.simulationTime = 0.0;
    groundEverywhere(engine);

    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const net = engine.getEnergyNetworkForBuilding(solar)!;
    expect(net.production).toBeCloseTo(0, 10);
  });

  it('solar production at quarter-day matches daylightFactor formula', () => {
    const solarProd = getBuildingType(SOLAR_PANEL_BUILDING_TYPE_ID)!.energy!.production!;
    for (const t of [0.1, 0.25, 0.35, 0.5, 0.65, 0.75, 0.9]) {
      const engine = new GameEngine(800, 600);
      engine.simulationTime = t;
      groundEverywhere(engine);
      const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
      const net = engine.getEnergyNetworkForBuilding(solar)!;
      expect(net.production).toBeCloseTo(solarProd * getDaylightFactor(t), 10);
    }
  });

  it('unpowered extractor produces nothing through a full night', () => {
    const engine = new GameEngine(800, 600);
    engine.simulationTime = 0.75;
    groundEverywhere(engine);

    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 2, 1, ResourceType.Regolith);
    engine.connectBuildings(solar, ext);

    simulate(engine, CYCLE_S / 2, EXTRACTION_INTERVAL_S);
    expect(engine.getResourceCounts().regolith).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. INTEGRATED ECONOMY SCENARIOS
// ─────────────────────────────────────────────────────────────────────

describe('Integrated economy scenarios', () => {
  it('solar + battery + extractor: produces through one full day-night cycle', () => {
    const engine = new GameEngine(800, 600);
    engine.simulationTime = 0.5;
    groundEverywhere(engine);

    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 6, 1, ResourceType.Regolith);
    engine.connectBuildings(solar, bat);
    engine.connectBuildings(solar, ext);

    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;
    engine.batteryCharges.set(bat, battery.capacity);

    simulate(engine, CYCLE_S, EXTRACTION_INTERVAL_S);
    expect(engine.getResourceCounts().regolith).toBeGreaterThan(0);
  });

  it('scaling: N extractors need ceil(N*4/10) solars', () => {
    for (let n = 1; n <= 5; n++) {
      const engine = steadyEngine();
      const solarCount = Math.ceil((n * 4) / 10);
      const solars: number[] = [];
      for (let i = 0; i < solarCount; i++) {
        solars.push(engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 + i * 2 })!);
      }
      for (let i = 1; i < solars.length; i++) engine.connectBuildings(solars[0], solars[i]);

      const extractors: number[] = [];
      for (let i = 0; i < n; i++) {
        const x = 10 + i * 2;
        const ext = placeExtractorWithResource(engine, x, 1, ResourceType.Regolith);
        engine.connectBuildings(solars[0], ext);
        extractors.push(ext);
      }

      const net = engine.getEnergyNetworkForBuilding(solars[0])!;
      expect(net.remaining).toBeGreaterThanOrEqual(0);
      for (const ext of extractors) {
        expect(engine.getBuildingPowerState(ext)).toBe('powered');
      }
    }
  });

  it('battery bridges a solar deficit: 1 solar + 1 battery powers 3 extractors until depleted', () => {
    const engine = noonEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const extractors = [6, 8, 10].map((x) => {
      const ext = placeExtractorWithResource(engine, x, 1, ResourceType.Regolith);
      engine.connectBuildings(solar, ext);
      return ext;
    });
    engine.connectBuildings(solar, bat);

    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;
    engine.batteryCharges.set(bat, battery.capacity);

    engine.update(1);
    for (const ext of extractors) {
      expect(engine.getBuildingPowerState(ext)).toBe('powered');
    }

    simulate(engine, CYCLE_S * 10, 1);
    expect(engine.batteryCharges.get(bat)).toBeCloseTo(0, 1);
    for (const ext of extractors) {
      expect(engine.getBuildingPowerState(ext)).toBe('unpowered');
    }
  });

  it('multiple extractors on different resources accumulate correctly', () => {
    const engine = steadyEngine();
    const s1 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const s2 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 3 })!;
    engine.connectBuildings(s1, s2);

    const regolith1 = placeExtractorWithResource(engine, 3, 1, ResourceType.Regolith);
    const regolith2 = placeExtractorWithResource(engine, 5, 1, ResourceType.Regolith);
    const hydrogen1 = placeExtractorWithResource(engine, 7, 1, ResourceType.Hydrogen);
    const oxygen1 = placeExtractorWithResource(engine, 9, 1, ResourceType.Oxygen);
    for (const ext of [regolith1, regolith2, hydrogen1, oxygen1]) {
      engine.connectBuildings(s1, ext);
    }

    for (let i = 0; i < 20; i++) engine.update(EXTRACTION_INTERVAL_S);

    const counts = engine.getResourceCounts();
    expect(counts.regolith).toBe(40);
    expect(counts.hydrogen).toBe(20);
    expect(counts.oxygen).toBe(20);
  });

  it('disconnecting power mid-extraction stops production immediately', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 2, 1, ResourceType.Regolith);
    engine.connectBuildings(solar, ext);

    for (let i = 0; i < 5; i++) engine.update(EXTRACTION_INTERVAL_S);
    expect(engine.getResourceCounts().regolith).toBe(5);

    engine.disconnectBuildings(solar, ext);

    for (let i = 0; i < 10; i++) engine.update(EXTRACTION_INTERVAL_S);
    expect(engine.getResourceCounts().regolith).toBe(5);
  });

  it('reconnecting power resumes production', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 2, 1, ResourceType.Regolith);
    engine.connectBuildings(solar, ext);

    for (let i = 0; i < 5; i++) engine.update(EXTRACTION_INTERVAL_S);
    engine.disconnectBuildings(solar, ext);
    for (let i = 0; i < 5; i++) engine.update(EXTRACTION_INTERVAL_S);
    engine.connectBuildings(solar, ext);
    for (let i = 0; i < 5; i++) engine.update(EXTRACTION_INTERVAL_S);

    expect(engine.getResourceCounts().regolith).toBe(10);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 6. EDGE CASES & INVARIANTS
// ─────────────────────────────────────────────────────────────────────

describe('Edge cases & invariants', () => {
  it('battery charge never exceeds capacity', () => {
    const engine = steadyEngine();
    const s1 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const s2 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 3 })!;
    const s3 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 5 })!;
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    engine.connectBuildings(s1, bat);
    engine.connectBuildings(s2, bat);
    engine.connectBuildings(s3, bat);

    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;
    simulate(engine, CYCLE_S * 5, 0.5);
    expect(engine.batteryCharges.get(bat)!).toBeLessThanOrEqual(battery.capacity);
  });

  it('battery charge never goes negative', () => {
    const engine = steadyEngine();
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 4, 1, ResourceType.Regolith);
    engine.connectBuildings(bat, ext);
    engine.batteryCharges.set(bat, 0.5);

    simulate(engine, CYCLE_S * 3, 0.5);
    expect(engine.batteryCharges.get(bat)!).toBeGreaterThanOrEqual(0);
  });

  it('resource counts never decrease', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 2, 1, ResourceType.Regolith);
    engine.connectBuildings(solar, ext);

    let prevRegolith = 0;
    for (let i = 0; i < 100; i++) {
      engine.update(EXTRACTION_INTERVAL_S);
      const regolith = engine.getResourceCounts().regolith;
      expect(regolith).toBeGreaterThanOrEqual(prevRegolith);
      prevRegolith = regolith;
    }
  });

  it('many small dt steps produce same result as fewer large steps', () => {
    const eng1 = steadyEngine();
    const s1 = eng1.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const b1 = eng1.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    eng1.connectBuildings(s1, b1);

    const eng2 = steadyEngine();
    const s2 = eng2.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const b2 = eng2.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    eng2.connectBuildings(s2, b2);

    simulate(eng1, 60, 0.1);
    simulate(eng2, 60, 1.0);

    expect(eng1.batteryCharges.get(b1)).toBeCloseTo(eng2.batteryCharges.get(b2)!, 3);
  });

  it('zero-production network with battery does not discharge (no consumers)', () => {
    const engine = steadyEngine();
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;
    engine.batteryCharges.set(bat, battery.capacity);

    simulate(engine, CYCLE_S * 3, 1);
    expect(engine.batteryCharges.get(bat)).toBeCloseTo(battery.capacity, 5);
  });

  it('global stats remain consistent across network mutations', () => {
    const engine = steadyEngine();
    const s1 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const s2 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 3 })!;
    const e1 = placeExtractorWithResource(engine, 3, 1, ResourceType.Regolith);
    const e2 = placeExtractorWithResource(engine, 5, 1, ResourceType.Hydrogen);

    engine.connectBuildings(s1, e1);
    let stats = engine.getEnergyGlobalStats();
    expect(stats.onlineConsumers).toBe(1);
    expect(stats.offlineConsumers).toBe(1);

    engine.connectBuildings(s1, s2);
    engine.connectBuildings(s1, e2);
    stats = engine.getEnergyGlobalStats();
    expect(stats.onlineConsumers).toBe(2);
    expect(stats.offlineConsumers).toBe(0);
    expect(stats.production).toBe(20);
    expect(stats.servedConsumption).toBe(8);
    expect(stats.demandedConsumption).toBe(8);
  });

  it('storage totals track correctly as batteries join and leave', () => {
    const engine = steadyEngine();
    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;

    const b1 = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.batteryCharges.set(b1, 5);

    let totals = engine.getEnergyStorageTotals();
    expect(totals.stored).toBeCloseTo(5, 5);
    expect(totals.capacity).toBeCloseTo(battery.capacity, 5);

    const b2 = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 5, y: 1 })!;
    engine.batteryCharges.set(b2, 8);

    totals = engine.getEnergyStorageTotals();
    expect(totals.stored).toBeCloseTo(13, 5);
    expect(totals.capacity).toBeCloseTo(battery.capacity * 2, 5);

    engine.removeBuilding(b1);
    totals = engine.getEnergyStorageTotals();
    expect(totals.stored).toBeCloseTo(8, 5);
    expect(totals.capacity).toBeCloseTo(battery.capacity, 5);
  });
});

// ─────────────────────────────────────────────────────────────────────
// 7. FULL CYCLE NUMERICAL VERIFICATION
// ─────────────────────────────────────────────────────────────────────

describe('Full cycle numerical verification', () => {
  it('solar energy integrated over one full cycle matches analytical expectation', () => {
    const solarProd = getBuildingType(SOLAR_PANEL_BUILDING_TYPE_ID)!.energy!.production!;
    const step = 0.001;
    let integral = 0;
    for (let t = 0; t < 1; t += step) {
      integral += getDaylightFactor(t) * step;
    }
    const averageFactor = integral;
    const expectedKWhPerCycle = solarProd * averageFactor;

    const engine = new GameEngine(800, 600);
    engine.simulationTime = 0;
    groundEverywhere(engine);

    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const bat = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    engine.connectBuildings(solar, bat);

    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;

    simulate(engine, CYCLE_S, 0.1);
    const charged = engine.batteryCharges.get(bat)!;
    const cappedExpected = Math.min(expectedKWhPerCycle, battery.capacity);
    expect(charged).toBeCloseTo(cappedExpected, 1);
  });

  it('extractor throughput over full cycle matches expected powered-time production', () => {
    const engine = new GameEngine(800, 600);
    engine.simulationTime = 0;
    groundEverywhere(engine);

    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext = placeExtractorWithResource(engine, 2, 1, ResourceType.Regolith);
    engine.connectBuildings(solar, ext);

    const extractorCons = getBuildingType(EXTRACTOR_BUILDING_TYPE_ID)!.energy!.consumption!;
    const solarProd = getBuildingType(SOLAR_PANEL_BUILDING_TYPE_ID)!.energy!.production!;

    let expectedItems = 0;
    let simTime = 0;
    const step = EXTRACTION_INTERVAL_S;
    for (let elapsed = 0; elapsed < CYCLE_S; elapsed += step) {
      simTime = ((simTime + step / CYCLE_S) % 1 + 1) % 1;
      const production = solarProd * getDaylightFactor(simTime);
      if (production >= extractorCons) expectedItems++;
    }

    simulate(engine, CYCLE_S, step);
    expect(engine.getResourceCounts().regolith).toBe(expectedItems);
  });

  it('battery-backed extractor produces more items per cycle than solar-only', () => {
    const eng1 = new GameEngine(800, 600);
    eng1.simulationTime = 0;
    groundEverywhere(eng1);
    const s1 = eng1.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const ext1 = placeExtractorWithResource(eng1, 2, 1, ResourceType.Regolith);
    eng1.connectBuildings(s1, ext1);

    const eng2 = new GameEngine(800, 600);
    eng2.simulationTime = 0;
    groundEverywhere(eng2);
    const s2 = eng2.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const bat2 = eng2.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const ext2 = placeExtractorWithResource(eng2, 6, 1, ResourceType.Regolith);
    eng2.connectBuildings(s2, bat2);
    eng2.connectBuildings(s2, ext2);
    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;
    eng2.batteryCharges.set(bat2, battery.capacity);

    simulate(eng1, CYCLE_S, EXTRACTION_INTERVAL_S);
    simulate(eng2, CYCLE_S, EXTRACTION_INTERVAL_S);

    expect(eng2.getResourceCounts().regolith).toBeGreaterThan(eng1.getResourceCounts().regolith);
  });
});
