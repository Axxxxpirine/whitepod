import { describe, expect, it } from 'vitest';
import { generateBuildAllScenario } from '@/game/scenarios/generators/generateBuildAllScenario';
import {
  CONVERTER_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  isBeltTypeId,
  isProcessorTypeId,
} from '@/game/data/buildingCatalog';
import { ResourceType } from '@/game/types';

describe('generateBuildAllScenario', () => {
  it('places the correct building counts', () => {
    const result = generateBuildAllScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];

    const extractors   = buildings.filter((b) => b.typeId === EXTRACTOR_BUILDING_TYPE_ID);
    const converters   = buildings.filter((b) => b.typeId === CONVERTER_BUILDING_TYPE_ID);
    const synthesizers = buildings.filter((b) => b.typeId === SYNTHESIZER_BUILDING_TYPE_ID);
    const storages     = buildings.filter((b) => b.typeId === STORAGE_BUILDING_TYPE_ID);

    expect(extractors.length).toBe(36);   // Dedicated providers for every storage and processor chain
    expect(converters.length).toBe(10);   // 5 stored tier-1 outputs + 3 synthesizer feeders + 2 ceramic feeders
    expect(synthesizers.length).toBe(5);  // Ceramic, Water, Methane, CO2, Ammonia
    expect(storages.length).toBe(13);     // 3 base + 5 converter + 5 synthesizer
  });

  it('all energy consumers are in a single connected network', () => {
    const result = generateBuildAllScenario(640, 480);
    const networks = result.engine.getEnergyNetworkBalances();
    // 36 extractors × 4 kW + 10 converters × 6 kW + 5 synthesizers × 10 kW = 254 kW total demand.
    const mainNetwork = networks.find((n) => n.consumption === 254);
    expect(mainNetwork).toBeDefined();
  });

  it('all processors have active recipes', () => {
    const result = generateBuildAllScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];
    const processors = buildings.filter((b) => isProcessorTypeId(b.typeId));

    expect(processors.length).toBe(15);
    for (const processor of processors) {
      const state = result.engine.getProcessorState(processor.id);
      expect(state).toBeDefined();
      expect(state!.recipeId).not.toBeNull();
    }
  });

  it('produces all 13 resource types after simulation', () => {
    const result = generateBuildAllScenario(640, 480);
    const counts = result.engine.getResourceCounts();

    // Base resources (extracted)
    expect(counts.regolith).toBeGreaterThan(0);
    expect(counts.hydrogen).toBeGreaterThan(0);
    expect(counts.oxygen).toBeGreaterThan(0);

    // Converter outputs (tier 1)
    expect(counts.ironOxide).toBeGreaterThan(0);
    expect(counts.aluminumOxide).toBeGreaterThan(0);
    expect(counts.siliconDioxide).toBeGreaterThan(0);
    expect(counts.nitrogenGas).toBeGreaterThan(0);
    expect(counts.carbon).toBeGreaterThan(0);

    // Synthesizer outputs (tier 1 + tier 2)
    expect(counts.water).toBeGreaterThan(0);
    expect(counts.methane).toBeGreaterThan(0);
    expect(counts.carbonDioxide).toBeGreaterThan(0);
    expect(counts.ammonia).toBeGreaterThan(0);
    expect(counts.ceramicPlates).toBeGreaterThan(0);
  });

  it('all 3 base resource deposit types are visible', () => {
    const result = generateBuildAllScenario(640, 480);
    const types = new Set<ResourceType>();
    const visible = result.engine.getVisibleTiles();
    for (let y = visible.y0; y <= visible.y1; y++) {
      for (let x = visible.x0; x <= visible.x1; x++) {
        const resource = result.engine.getResourceAt(x, y);
        if (resource !== ResourceType.None) types.add(resource);
      }
    }
    expect(types.has(ResourceType.Regolith)).toBe(true);
    expect(types.has(ResourceType.Hydrogen)).toBe(true);
    expect(types.has(ResourceType.Oxygen)).toBe(true);
  });

  it('every extractor, converter and synthesizer has an output belt to its storage', () => {
    const result = generateBuildAllScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];
    const belts = buildings.filter((b) => isBeltTypeId(b.typeId));

    // 3 extractors × ~2 belts + 4 converters × ~3 belts + 5 synthesizers × ~3 belts = ~33 belts
    expect(belts.length).toBeGreaterThanOrEqual(12);

    // Every extractor has at least one output belt connection
    const extractors = buildings.filter((b) => b.typeId === EXTRACTOR_BUILDING_TYPE_ID);
    for (const extractor of extractors) {
      const connections = result.engine.getConnectionsOf(extractor.id);
      const outputs = connections.filter((c) => c.from.building === extractor.id);
      expect(outputs.length).toBeGreaterThanOrEqual(1);
    }

    // Every converter has at least one output belt connection (→ storage)
    const converters = buildings.filter((b) => b.typeId === CONVERTER_BUILDING_TYPE_ID);
    for (const converter of converters) {
      const connections = result.engine.getConnectionsOf(converter.id);
      const outputs = connections.filter((c) => c.from.building === converter.id);
      expect(outputs.length).toBeGreaterThanOrEqual(1);
    }

    // Every synthesizer has at least one output belt connection (→ storage)
    const synthesizers = buildings.filter((b) => b.typeId === SYNTHESIZER_BUILDING_TYPE_ID);
    for (const synthesizer of synthesizers) {
      const connections = result.engine.getConnectionsOf(synthesizer.id);
      const outputs = connections.filter((c) => c.from.building === synthesizer.id);
      expect(outputs.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('returns select tool and valid viewport', () => {
    const result = generateBuildAllScenario(640, 480);
    expect(result.selectedTool).toEqual({ kind: 'select' });
    expect(result.viewport.zoom).toBeCloseTo(0.25);
  });
});
