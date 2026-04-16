import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { TileType, ResourceType } from '@/game/types';
import {
  CONVERTER_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  getBuildingType,
  isProcessorTypeId,
} from '@/game/data/buildingCatalog';
import { getRecipe, getRecipesForBuilding } from '@/game/data/recipeCatalog';
import { resolveBeltFlow } from '@/game/flow/resolveBeltFlow';

function groundEverywhere(engine: GameEngine) {
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
}

function steadyEngine(): GameEngine {
  const engine = new GameEngine(800, 600, { dayNightCycleSeconds: 1e9 });
  engine.simulationTime = 0.5;
  groundEverywhere(engine);
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

function poweredConverter(engine: GameEngine, x: number, y: number) {
  const solar1 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: x - 2, y })!;
  const solar2 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: x - 1, y })!;
  const converter = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x, y })!;
  engine.connectBuildings(solar1, converter);
  engine.connectBuildings(solar2, converter);
  return converter;
}

function poweredSynthesizer(engine: GameEngine, x: number, y: number) {
  const solar1 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: x - 2, y })!;
  const solar2 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: x - 1, y })!;
  const synth = engine.placeBuilding(SYNTHESIZER_BUILDING_TYPE_ID, { x, y })!;
  engine.connectBuildings(solar1, synth);
  engine.connectBuildings(solar2, synth);
  return synth;
}

// -- Recipe catalog tests --

describe('recipeCatalog', () => {
  it('returns converter recipes only for converter building', () => {
    const recipes = getRecipesForBuilding('converter');
    expect(recipes.length).toBe(4);
    for (const r of recipes) {
      expect(r.building).toBe('converter');
      expect(r.inputs.length).toBe(1);
    }
  });

  it('returns synthesizer recipes only for synthesizer building', () => {
    const recipes = getRecipesForBuilding('synthesizer');
    expect(recipes.length).toBe(5);
    for (const r of recipes) {
      expect(r.building).toBe('synthesizer');
      expect(r.inputs.length).toBe(2);
    }
  });

  it('getRecipe returns undefined for unknown id', () => {
    expect(getRecipe('nonexistent')).toBeUndefined();
  });

  it('all recipes have positive cycle times and amounts', () => {
    for (const r of [...getRecipesForBuilding('converter'), ...getRecipesForBuilding('synthesizer')]) {
      expect(r.cycleSeconds).toBeGreaterThan(0);
      expect(r.output.amount).toBeGreaterThan(0);
      for (const i of r.inputs) {
        expect(i.amount).toBeGreaterThan(0);
      }
    }
  });

  it('each converter recipe has a unique input signature', () => {
    const signatures = new Set<string>();
    for (const r of getRecipesForBuilding('converter')) {
      const sig = `${r.inputs[0].resourceType}:${r.inputs[0].amount}`;
      expect(signatures.has(sig)).toBe(false);
      signatures.add(sig);
    }
  });
});

// -- Building catalog tests --

describe('processor building catalog', () => {
  it('isProcessorTypeId identifies converter and synthesizer', () => {
    expect(isProcessorTypeId(CONVERTER_BUILDING_TYPE_ID)).toBe(true);
    expect(isProcessorTypeId(SYNTHESIZER_BUILDING_TYPE_ID)).toBe(true);
    expect(isProcessorTypeId(EXTRACTOR_BUILDING_TYPE_ID)).toBe(false);
  });

  it('converter has correct footprint and ports', () => {
    const type = getBuildingType(CONVERTER_BUILDING_TYPE_ID)!;
    expect(type.footprint).toEqual({ w: 3, h: 3 });
    expect(type.ports.length).toBe(2);
    expect(type.energy?.consumption).toBe(6);
  });

  it('synthesizer has correct footprint and ports', () => {
    const type = getBuildingType(SYNTHESIZER_BUILDING_TYPE_ID)!;
    expect(type.footprint).toEqual({ w: 4, h: 4 });
    expect(type.ports.length).toBe(3);
    expect(type.energy?.consumption).toBe(10);
  });
});

// -- Placement and lifecycle tests --

describe('processor placement', () => {
  it('places a converter and initializes processor state', () => {
    const engine = steadyEngine();
    const id = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    expect(id).not.toBeNull();
    const state = engine.getProcessorState(id);
    expect(state).toEqual({ recipeId: null, cycleProgress: 0 });
  });

  it('places a synthesizer and initializes processor state', () => {
    const engine = steadyEngine();
    const id = engine.placeBuilding(SYNTHESIZER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    expect(id).not.toBeNull();
    const state = engine.getProcessorState(id);
    expect(state).toEqual({ recipeId: null, cycleProgress: 0 });
  });

  it('removes processor state on building removal', () => {
    const engine = steadyEngine();
    const id = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    expect(engine.getProcessorState(id)).toBeDefined();
    engine.removeBuilding(id);
    expect(engine.getProcessorState(id)).toBeUndefined();
  });

  it('forbids placement on resource deposits', () => {
    const engine = steadyEngine();
    engine.placeResource(10, 10, ResourceType.Regolith);
    const result = engine.canPlaceBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 });
    expect(result.ok).toBe(false);
  });
});

// -- Recipe assignment tests --

describe('setProcessorRecipe', () => {
  it('assigns a valid converter recipe', () => {
    const engine = steadyEngine();
    const id = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    expect(engine.setProcessorRecipe(id, 'iron_oxide')).toBe(true);
    expect(engine.getProcessorState(id)?.recipeId).toBe('iron_oxide');
  });

  it('rejects a synthesizer recipe on a converter', () => {
    const engine = steadyEngine();
    const id = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    expect(engine.setProcessorRecipe(id, 'water')).toBe(false);
    expect(engine.getProcessorState(id)?.recipeId).toBeNull();
  });

  it('rejects a converter recipe on a synthesizer', () => {
    const engine = steadyEngine();
    const id = engine.placeBuilding(SYNTHESIZER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    expect(engine.setProcessorRecipe(id, 'iron_oxide')).toBe(false);
  });

  it('assigns a valid synthesizer recipe', () => {
    const engine = steadyEngine();
    const id = engine.placeBuilding(SYNTHESIZER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    expect(engine.setProcessorRecipe(id, 'water')).toBe(true);
    expect(engine.getProcessorState(id)?.recipeId).toBe('water');
  });

  it('clears recipe with null', () => {
    const engine = steadyEngine();
    const id = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.setProcessorRecipe(id, 'iron_oxide');
    expect(engine.setProcessorRecipe(id, null)).toBe(true);
    expect(engine.getProcessorState(id)?.recipeId).toBeNull();
  });

  it('resets cycle progress when changing recipe', () => {
    const engine = steadyEngine();
    const id = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(id, 'iron_oxide');
    engine.playerStock.regolith = 100;
    simulate(engine, 1);
    expect(engine.getProcessorState(id)!.cycleProgress).toBeGreaterThan(0);
    engine.setProcessorRecipe(id, 'aluminum_oxide');
    expect(engine.getProcessorState(id)!.cycleProgress).toBe(0);
  });

  it('rejects recipe on non-processor building', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    expect(engine.setProcessorRecipe(solar, 'iron_oxide')).toBe(false);
  });

  it('rejects unknown recipe id', () => {
    const engine = steadyEngine();
    const id = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    expect(engine.setProcessorRecipe(id, 'nonexistent')).toBe(false);
  });
});

// -- Processing (production) tests --

describe('processProcessors', () => {
  it('converter produces iron oxide from regolith', () => {
    const engine = steadyEngine();
    const id = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(id, 'iron_oxide');
    engine.playerStock.regolith = 10;

    // iron_oxide: 1x Regolith → 1x IronOxide, 2s cycle
    simulate(engine, 2);
    expect(engine.playerStock.ironOxide).toBe(1);
    expect(engine.playerStock.regolith).toBe(9);
  });

  it('converter produces multiple cycles over time', () => {
    const engine = steadyEngine();
    const id = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(id, 'iron_oxide');
    engine.playerStock.regolith = 100;

    // 10 seconds = 5 cycles of 2s each
    simulate(engine, 10);
    expect(engine.playerStock.ironOxide).toBe(5);
    expect(engine.playerStock.regolith).toBe(95);
  });

  it('converter stops when input is exhausted', () => {
    const engine = steadyEngine();
    const id = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(id, 'iron_oxide');
    engine.playerStock.regolith = 2;

    simulate(engine, 10);
    expect(engine.playerStock.ironOxide).toBe(2);
    expect(engine.playerStock.regolith).toBe(0);
  });

  it('converter does not produce without power', () => {
    const engine = steadyEngine();
    const id = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.setProcessorRecipe(id, 'iron_oxide');
    engine.playerStock.regolith = 100;

    expect(engine.getBuildingPowerState(id)).not.toBe('powered');
    simulate(engine, 10);
    expect(engine.playerStock.ironOxide).toBe(0);
    expect(engine.playerStock.regolith).toBe(100);
  });

  it('converter does not produce without recipe', () => {
    const engine = steadyEngine();
    poweredConverter(engine, 10, 10);
    engine.playerStock.regolith = 100;

    simulate(engine, 10);
    expect(engine.playerStock.ironOxide).toBe(0);
  });

  it('aluminum_oxide recipe consumes 2x regolith per cycle', () => {
    const engine = steadyEngine();
    const id = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(id, 'aluminum_oxide');
    engine.playerStock.regolith = 10;

    // aluminum_oxide: 2x Regolith → 1x AluminumOxide, 3s cycle
    simulate(engine, 3);
    expect(engine.playerStock.aluminumOxide).toBe(1);
    expect(engine.playerStock.regolith).toBe(8);
  });

  it('silicon_dioxide recipe is slow and expensive', () => {
    const engine = steadyEngine();
    const id = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(id, 'silicon_dioxide');
    engine.playerStock.regolith = 20;

    // silicon_dioxide: 4x Regolith → 1x SiliconDioxide, 5s cycle
    simulate(engine, 10);
    expect(engine.playerStock.siliconDioxide).toBe(2);
    expect(engine.playerStock.regolith).toBe(12);
  });

  it('nitrogen_gas recipe uses oxygen input', () => {
    const engine = steadyEngine();
    const id = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(id, 'nitrogen_gas');
    engine.playerStock.oxygen = 6;

    // nitrogen_gas: 3x Oxygen → 1x NitrogenGas, 4s cycle
    simulate(engine, 4);
    expect(engine.playerStock.nitrogenGas).toBe(1);
    expect(engine.playerStock.oxygen).toBe(3);
  });
});

// -- Synthesizer tests --

describe('synthesizer production', () => {
  it('synthesizer produces water from hydrogen + oxygen', () => {
    const engine = steadyEngine();
    const id = poweredSynthesizer(engine, 10, 10);
    engine.setProcessorRecipe(id, 'water');
    engine.playerStock.hydrogen = 10;
    engine.playerStock.oxygen = 5;

    // water: 2x Hydrogen + 1x Oxygen → 1x Water, 4s
    simulate(engine, 4);
    expect(engine.playerStock.water).toBe(1);
    expect(engine.playerStock.hydrogen).toBe(8);
    expect(engine.playerStock.oxygen).toBe(4);
  });

  it('synthesizer stops when one input runs out', () => {
    const engine = steadyEngine();
    const id = poweredSynthesizer(engine, 10, 10);
    engine.setProcessorRecipe(id, 'water');
    engine.playerStock.hydrogen = 4;
    engine.playerStock.oxygen = 100;

    // Can only do 2 cycles (4 hydrogen / 2 per cycle)
    simulate(engine, 20);
    expect(engine.playerStock.water).toBe(2);
    expect(engine.playerStock.hydrogen).toBe(0);
  });

  it('ceramic_plates chains tier 1 inputs', () => {
    const engine = steadyEngine();
    const id = poweredSynthesizer(engine, 10, 10);
    engine.setProcessorRecipe(id, 'ceramic_plates');
    engine.playerStock.aluminumOxide = 3;
    engine.playerStock.ironOxide = 3;

    // ceramic_plates: 1x AluminumOxide + 1x IronOxide → 1x CeramicPlates, 6s
    simulate(engine, 12);
    expect(engine.playerStock.ceramicPlates).toBe(2);
    expect(engine.playerStock.aluminumOxide).toBe(1);
    expect(engine.playerStock.ironOxide).toBe(1);
  });

  it('ammonia recipe with asymmetric inputs', () => {
    const engine = steadyEngine();
    const id = poweredSynthesizer(engine, 10, 10);
    engine.setProcessorRecipe(id, 'ammonia');
    engine.playerStock.hydrogen = 6;
    engine.playerStock.oxygen = 4;

    // ammonia: 3x Hydrogen + 2x Oxygen → 1x Ammonia, 6s
    simulate(engine, 6);
    expect(engine.playerStock.ammonia).toBe(1);
    expect(engine.playerStock.hydrogen).toBe(3);
    expect(engine.playerStock.oxygen).toBe(2);
  });
});

// -- Serialization tests --

describe('processor serialization', () => {
  it('round-trips processor state through serialize/deserialize', () => {
    const engine = steadyEngine();
    const id = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(id, 'iron_oxide');
    engine.playerStock.regolith = 100;
    simulate(engine, 1); // partial cycle

    const snapshot = engine.serializeWorld();
    const restored = GameEngine.fromSnapshot(snapshot, 800, 600);

    const restoredState = restored.getProcessorState(id);
    expect(restoredState).toBeDefined();
    expect(restoredState!.recipeId).toBe('iron_oxide');
    expect(restoredState!.cycleProgress).toBeGreaterThan(0);
  });

  it('round-trips extended resource stock', () => {
    const engine = steadyEngine();
    engine.playerStock.ironOxide = 5;
    engine.playerStock.water = 3;
    engine.playerStock.ceramicPlates = 1;

    const snapshot = engine.serializeWorld();
    const restored = GameEngine.fromSnapshot(snapshot, 800, 600);

    expect(restored.getResourceCounts().ironOxide).toBe(5);
    expect(restored.getResourceCounts().water).toBe(3);
    expect(restored.getResourceCounts().ceramicPlates).toBe(1);
  });

  it('old saves without processorStates load with defaults', () => {
    const engine = steadyEngine();
    const id = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    const snapshot = engine.serializeWorld();

    // Simulate old save by removing processorStates
    const oldSnapshot = { ...snapshot, processorStates: undefined };
    const restored = GameEngine.fromSnapshot(oldSnapshot, 800, 600);

    const state = restored.getProcessorState(id);
    expect(state).toEqual({ recipeId: null, cycleProgress: 0 });
  });
});

// -- Full production chain test --

describe('full production chain', () => {
  it('extractor + converter produces refined resources', () => {
    const engine = steadyEngine();

    // Set up extractor producing regolith
    engine.placeResource(5, 5, ResourceType.Regolith);
    const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 5, y: 5 })!;

    // Set up powered converter with iron_oxide recipe
    const converter = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(converter, 'iron_oxide');

    // Power the extractor too
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 4, y: 5 })!;
    engine.connectBuildings(solar, extractor);

    // Simulate: extractor produces regolith, converter consumes it
    simulate(engine, 10);

    expect(engine.playerStock.regolith).toBeGreaterThanOrEqual(0);
    expect(engine.playerStock.ironOxide).toBeGreaterThan(0);
  });
});

// ===================================================================
// Advanced integration tests (PRIMITIVES.md patterns)
// ===================================================================

// -- Belt flow with processor as source --

describe('belt flow: processor as source', () => {
  it('resolveBeltFlow returns converter output rate when powered with active recipe', () => {
    const engine = steadyEngine();
    const converter = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(converter, 'iron_oxide');

    // Place a target node east of converter output port (offset x=2, y=1 → world x=12, y=11)
    const target = engine.placeBuilding('placeholder_node_1x1', { x: 15, y: 11 })!;
    const belt = engine.placeBelt(
      { building: converter, port: 'out' },
      { building: target, port: 'in_west' },
    );
    expect(belt.ok).toBe(true);
    if (!belt.ok) return;

    const flow = resolveBeltFlow(engine, belt.segmentIds[0]!);
    expect(flow.length).toBe(1);
    expect(flow[0].resourceType).toBe(ResourceType.IronOxide);
    // iron_oxide: 1 output / 2s cycle → 30/min
    expect(flow[0].ratePerMinute).toBe(30);
    expect(flow[0].sources).toEqual([converter]);
  });

  it('resolveBeltFlow returns empty when converter has no recipe', () => {
    const engine = steadyEngine();
    const converter = poweredConverter(engine, 10, 10);
    // No recipe set

    const target = engine.placeBuilding('placeholder_node_1x1', { x: 15, y: 11 })!;
    const belt = engine.placeBelt(
      { building: converter, port: 'out' },
      { building: target, port: 'in_west' },
    );
    expect(belt.ok).toBe(true);
    if (!belt.ok) return;

    const flow = resolveBeltFlow(engine, belt.segmentIds[0]!);
    expect(flow.length).toBe(0);
  });

  it('resolveBeltFlow returns empty when converter is unpowered', () => {
    const engine = steadyEngine();
    // No solar panels — unpowered converter
    const converter = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.setProcessorRecipe(converter, 'iron_oxide');

    const target = engine.placeBuilding('placeholder_node_1x1', { x: 15, y: 11 })!;
    const belt = engine.placeBelt(
      { building: converter, port: 'out' },
      { building: target, port: 'in_west' },
    );
    expect(belt.ok).toBe(true);
    if (!belt.ok) return;

    const flow = resolveBeltFlow(engine, belt.segmentIds[0]!);
    expect(flow.length).toBe(0);
  });

  it('resolveBeltFlow does NOT traverse upstream through a processor', () => {
    const engine = steadyEngine();

    // Extractor → belt → converter → belt → target
    engine.placeResource(5, 11, ResourceType.Regolith);
    const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 5, y: 11 })!;
    const solar1 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 4, y: 11 })!;
    engine.connectBuildings(solar1, extractor);

    // Belt from extractor to converter input
    const converter = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(converter, 'iron_oxide');
    const beltIn = engine.placeBelt(
      { building: extractor, port: 'out_east' },
      { building: converter, port: 'in' },
    );
    expect(beltIn.ok).toBe(true);

    // Belt from converter output to target
    const target = engine.placeBuilding('placeholder_node_1x1', { x: 15, y: 11 })!;
    const beltOut = engine.placeBelt(
      { building: converter, port: 'out' },
      { building: target, port: 'in_west' },
    );
    expect(beltOut.ok).toBe(true);
    if (!beltOut.ok) return;

    // Belt downstream of converter should see converter output, NOT the extractor
    const flow = resolveBeltFlow(engine, beltOut.segmentIds[0]!);
    expect(flow.length).toBe(1);
    expect(flow[0].resourceType).toBe(ResourceType.IronOxide);
    expect(flow[0].sources).toEqual([converter]);
    // Should NOT contain the extractor as a source
    expect(flow[0].sources).not.toContain(extractor);
  });
});

// -- Energy network interactions with processors --

describe('energy interactions with processors', () => {
  it('converter requires 6kW — two solar panels (2×10kW) is sufficient', () => {
    const engine = steadyEngine();
    const converter = poweredConverter(engine, 10, 10);
    expect(engine.getBuildingPowerState(converter)).toBe('powered');
  });

  it('converter with single solar panel (10kW) is still powered', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 8, y: 10 })!;
    const converter = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.connectBuildings(solar, converter);
    expect(engine.getBuildingPowerState(converter)).toBe('powered');
  });

  it('synthesizer requires 10kW — single solar (10kW) powers it exactly', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 8, y: 10 })!;
    const synth = engine.placeBuilding(SYNTHESIZER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.connectBuildings(solar, synth);
    expect(engine.getBuildingPowerState(synth)).toBe('powered');
  });

  it('processor loses power when energy link is removed', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 8, y: 10 })!;
    const converter = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.connectBuildings(solar, converter);
    expect(engine.getBuildingPowerState(converter)).toBe('powered');

    engine.disconnectBuildings(solar, converter);
    expect(engine.getBuildingPowerState(converter)).not.toBe('powered');
  });

  it('production stops when power is lost mid-cycle', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 8, y: 10 })!;
    const converter = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.connectBuildings(solar, converter);
    engine.setProcessorRecipe(converter, 'iron_oxide');
    engine.playerStock.regolith = 100;

    // Advance half a cycle
    simulate(engine, 0.5);
    expect(engine.getProcessorState(converter)!.cycleProgress).toBeGreaterThan(0);
    const ironBefore = engine.playerStock.ironOxide;

    // Kill power
    engine.disconnectBuildings(solar, converter);
    simulate(engine, 10);

    // No additional production
    expect(engine.playerStock.ironOxide).toBe(ironBefore);
  });

  it('production resumes when power is restored', () => {
    const engine = steadyEngine();
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 8, y: 10 })!;
    const converter = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.connectBuildings(solar, converter);
    engine.setProcessorRecipe(converter, 'iron_oxide');
    engine.playerStock.regolith = 100;

    // Produce some
    simulate(engine, 4);
    const ironAfterPowered = engine.playerStock.ironOxide;
    expect(ironAfterPowered).toBeGreaterThan(0);

    // Kill power, simulate, then restore
    engine.disconnectBuildings(solar, converter);
    simulate(engine, 5);
    expect(engine.playerStock.ironOxide).toBe(ironAfterPowered);

    engine.connectBuildings(solar, converter);
    simulate(engine, 4);
    expect(engine.playerStock.ironOxide).toBeGreaterThan(ironAfterPowered);
  });
});

// -- Processor mid-cycle interruptions --

describe('mid-cycle interruptions', () => {
  it('removing a processor mid-cycle does not produce output', () => {
    const engine = steadyEngine();
    const converter = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(converter, 'iron_oxide');
    engine.playerStock.regolith = 100;

    simulate(engine, 0.5); // partial cycle, no output yet
    expect(engine.playerStock.ironOxide).toBe(0);

    engine.removeBuilding(converter);
    // Even after more time passes, no iron oxide from that converter
    simulate(engine, 10);
    expect(engine.playerStock.ironOxide).toBe(0);
  });

  it('clearing recipe mid-cycle resets progress and does not produce', () => {
    const engine = steadyEngine();
    const converter = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(converter, 'iron_oxide');
    engine.playerStock.regolith = 100;

    simulate(engine, 1.5); // 75% through a 2s cycle
    expect(engine.getProcessorState(converter)!.cycleProgress).toBeGreaterThan(0);

    engine.setProcessorRecipe(converter, null);
    simulate(engine, 5);
    expect(engine.playerStock.ironOxide).toBe(0);
  });

  it('switching recipe mid-cycle restarts from zero progress', () => {
    const engine = steadyEngine();
    const converter = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(converter, 'iron_oxide');
    engine.playerStock.regolith = 100;

    simulate(engine, 1.5); // mid-cycle
    engine.setProcessorRecipe(converter, 'aluminum_oxide');
    expect(engine.getProcessorState(converter)!.cycleProgress).toBe(0);

    // aluminum_oxide: 3s cycle, so after 3s should produce 1
    simulate(engine, 3);
    expect(engine.playerStock.aluminumOxide).toBe(1);
    expect(engine.playerStock.ironOxide).toBe(0);
  });
});

// -- Multi-processor concurrent production --

describe('concurrent processors', () => {
  it('two converters with different recipes produce simultaneously', () => {
    const engine = steadyEngine();

    const c1 = poweredConverter(engine, 10, 5);
    engine.setProcessorRecipe(c1, 'iron_oxide');

    const c2 = poweredConverter(engine, 10, 15);
    engine.setProcessorRecipe(c2, 'aluminum_oxide');

    engine.playerStock.regolith = 100;

    // iron_oxide: 2s cycle, aluminum_oxide: 3s cycle
    // After 6s: iron_oxide = 3 cycles, aluminum_oxide = 2 cycles
    simulate(engine, 6);
    expect(engine.playerStock.ironOxide).toBe(3);
    expect(engine.playerStock.aluminumOxide).toBe(2);
    // Consumed: 3 + (2×2) = 7 regolith
    expect(engine.playerStock.regolith).toBe(93);
  });

  it('converter + synthesizer chain: converter feeds synthesizer inputs', () => {
    const engine = steadyEngine();

    // Two converters producing iron_oxide and aluminum_oxide
    const c1 = poweredConverter(engine, 10, 5);
    engine.setProcessorRecipe(c1, 'iron_oxide');
    const c2 = poweredConverter(engine, 10, 15);
    engine.setProcessorRecipe(c2, 'aluminum_oxide');

    // Synthesizer consuming both for ceramic_plates
    const synth = poweredSynthesizer(engine, 20, 10);
    engine.setProcessorRecipe(synth, 'ceramic_plates');

    // Give abundant raw materials for converters
    engine.playerStock.regolith = 200;

    // Run for 30 seconds:
    // iron_oxide converter: 30/2 = 15 cycles → 15 iron_oxide produced
    // aluminum_oxide converter: 30/3 = 10 cycles → 10 aluminum_oxide produced
    // ceramic_plates synth: 1 AluminumOxide + 1 IronOxide per 6s → 5 possible cycles
    // But synth needs materials that converters produce, so output depends on timing
    simulate(engine, 30);

    // Both converters should have produced
    expect(engine.playerStock.ironOxide + engine.playerStock.ceramicPlates).toBeGreaterThan(0);
    expect(engine.playerStock.aluminumOxide + engine.playerStock.ceramicPlates).toBeGreaterThan(0);
    // Synthesizer should have consumed some of both
    expect(engine.playerStock.ceramicPlates).toBeGreaterThan(0);
  });
});

// -- Serialization with active production --

describe('serialization under active production', () => {
  it('serialization preserves all 12 resource types accurately', () => {
    const engine = steadyEngine();
    engine.playerStock.regolith = 10;
    engine.playerStock.hydrogen = 20;
    engine.playerStock.oxygen = 30;
    engine.playerStock.ironOxide = 1;
    engine.playerStock.aluminumOxide = 2;
    engine.playerStock.siliconDioxide = 3;
    engine.playerStock.nitrogenGas = 4;
    engine.playerStock.water = 5;
    engine.playerStock.methane = 6;
    engine.playerStock.carbonDioxide = 7;
    engine.playerStock.ammonia = 8;
    engine.playerStock.ceramicPlates = 9;

    const snapshot = engine.serializeWorld();
    const restored = GameEngine.fromSnapshot(snapshot, 800, 600);
    const counts = restored.getResourceCounts();

    expect(counts.regolith).toBe(10);
    expect(counts.hydrogen).toBe(20);
    expect(counts.oxygen).toBe(30);
    expect(counts.ironOxide).toBe(1);
    expect(counts.aluminumOxide).toBe(2);
    expect(counts.siliconDioxide).toBe(3);
    expect(counts.nitrogenGas).toBe(4);
    expect(counts.water).toBe(5);
    expect(counts.methane).toBe(6);
    expect(counts.carbonDioxide).toBe(7);
    expect(counts.ammonia).toBe(8);
    expect(counts.ceramicPlates).toBe(9);
  });

  it('production continues correctly after save/load', () => {
    const engine = steadyEngine();
    const converter = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(converter, 'iron_oxide');
    engine.playerStock.regolith = 100;

    // Produce for 10s → 5 cycles of 2s each → 5 iron_oxide
    simulate(engine, 10);
    expect(engine.playerStock.ironOxide).toBe(5);

    // Save and restore
    const snapshot = engine.serializeWorld();
    const restored = GameEngine.fromSnapshot(snapshot, 800, 600);
    restored.simulationTime = 0.5; // keep it at noon

    // Continue producing for another 10s → 5 more cycles
    simulate(restored, 10);
    expect(restored.playerStock.ironOxide).toBe(10);
    expect(restored.playerStock.regolith).toBe(90);
  });

  it('multiple processors round-trip correctly', () => {
    const engine = steadyEngine();
    const c1 = poweredConverter(engine, 10, 5);
    engine.setProcessorRecipe(c1, 'iron_oxide');
    const synth = poweredSynthesizer(engine, 10, 15);
    engine.setProcessorRecipe(synth, 'water');

    engine.playerStock.regolith = 50;
    simulate(engine, 1.5); // mid-cycle for both

    const snapshot = engine.serializeWorld();
    const restored = GameEngine.fromSnapshot(snapshot, 800, 600);

    const s1 = restored.getProcessorState(c1);
    const s2 = restored.getProcessorState(synth);
    expect(s1?.recipeId).toBe('iron_oxide');
    expect(s1?.cycleProgress).toBeGreaterThan(0);
    expect(s2?.recipeId).toBe('water');
    // synth has no inputs (hydrogen=0, oxygen=0), so progress should be 0
    expect(s2?.cycleProgress).toBe(0);
  });
});

// -- Edge cases and guards --

describe('processor edge cases', () => {
  it('processor with recipe but zero of one input does not advance cycle', () => {
    const engine = steadyEngine();
    const synth = poweredSynthesizer(engine, 10, 10);
    engine.setProcessorRecipe(synth, 'water');
    engine.playerStock.hydrogen = 10;
    engine.playerStock.oxygen = 0; // missing oxygen

    simulate(engine, 10);
    expect(engine.playerStock.water).toBe(0);
    expect(engine.getProcessorState(synth)!.cycleProgress).toBe(0);
  });

  it('resources never go negative even with aggressive simulation steps', () => {
    const engine = steadyEngine();
    const converter = poweredConverter(engine, 10, 10);
    engine.setProcessorRecipe(converter, 'iron_oxide');
    engine.playerStock.regolith = 1; // just enough for 1 cycle

    // Large dt steps that could overshoot
    simulate(engine, 20, 5);
    expect(engine.playerStock.regolith).toBeGreaterThanOrEqual(0);
    expect(engine.playerStock.ironOxide).toBe(1);
  });

  it('very small dt steps produce the same result as normal steps', () => {
    const engine1 = steadyEngine();
    const c1 = poweredConverter(engine1, 10, 10);
    engine1.setProcessorRecipe(c1, 'iron_oxide');
    engine1.playerStock.regolith = 20;

    const engine2 = steadyEngine();
    const c2 = poweredConverter(engine2, 10, 10);
    engine2.setProcessorRecipe(c2, 'iron_oxide');
    engine2.playerStock.regolith = 20;

    // Normal steps
    simulate(engine1, 10, 0.1);
    // Very small steps
    simulate(engine2, 10, 0.01);

    expect(engine1.playerStock.ironOxide).toBe(engine2.playerStock.ironOxide);
    expect(engine1.playerStock.regolith).toBe(engine2.playerStock.regolith);
  });

  it('getProcessorState returns undefined for non-existent building', () => {
    const engine = steadyEngine();
    expect(engine.getProcessorState(99999)).toBeUndefined();
  });

  it('setProcessorRecipe returns false for non-existent building', () => {
    const engine = steadyEngine();
    expect(engine.setProcessorRecipe(99999, 'iron_oxide')).toBe(false);
  });
});
