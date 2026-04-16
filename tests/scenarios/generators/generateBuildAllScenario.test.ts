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
  it('places all processor types and storage', () => {
    const result = generateBuildAllScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];

    const extractors   = buildings.filter((b) => b.typeId === EXTRACTOR_BUILDING_TYPE_ID);
    const converters   = buildings.filter((b) => b.typeId === CONVERTER_BUILDING_TYPE_ID);
    const synthesizers = buildings.filter((b) => b.typeId === SYNTHESIZER_BUILDING_TYPE_ID);
    const storages     = buildings.filter((b) => b.typeId === STORAGE_BUILDING_TYPE_ID);

    expect(extractors.length).toBeGreaterThanOrEqual(4);
    expect(converters.length).toBeGreaterThanOrEqual(4);
    expect(synthesizers.length).toBeGreaterThanOrEqual(5);
    expect(storages.length).toBeGreaterThanOrEqual(1);
  });

  it('has at least 2 disjoint energy subnets', () => {
    const result = generateBuildAllScenario(640, 480);
    const networks = result.engine.getEnergyNetworkBalances();
    expect(networks.length).toBeGreaterThanOrEqual(2);
  });

  it('all processors have active recipes', () => {
    const result = generateBuildAllScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];
    const processors = buildings.filter((b) => isProcessorTypeId(b.typeId));

    expect(processors.length).toBeGreaterThanOrEqual(9);
    for (const processor of processors) {
      const state = result.engine.getProcessorState(processor.id);
      expect(state).toBeDefined();
      expect(state!.recipeId).not.toBeNull();
    }
  });

  it('produces all 12 resource types after simulation', () => {
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

    // Synthesizer outputs (tier 1 + tier 2)
    expect(counts.water).toBeGreaterThan(0);
    expect(counts.methane).toBeGreaterThan(0);
    expect(counts.carbonDioxide).toBeGreaterThan(0);
    expect(counts.ammonia).toBeGreaterThan(0);
    expect(counts.ceramicPlates).toBeGreaterThan(0);
  });

  it('exposes all 3 base resource types as visible deposits', () => {
    const result = generateBuildAllScenario(640, 480);
    const types = new Set<ResourceType>();
    const visible = result.engine.getVisibleTiles();
    for (let y = visible.y0; y <= visible.y1; y++) {
      for (let x = visible.x0; x <= visible.x1; x++) {
        const resource = result.engine.getResourceAt(x, y);
        if (resource !== ResourceType.None) {
          types.add(resource);
        }
      }
    }
    expect(types.has(ResourceType.Regolith)).toBe(true);
    expect(types.has(ResourceType.Hydrogen)).toBe(true);
    expect(types.has(ResourceType.Oxygen)).toBe(true);
  });

  it('has belt segments connecting the ceramic_plates pipeline', () => {
    const result = generateBuildAllScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];
    const belts = buildings.filter((b) => isBeltTypeId(b.typeId));

    // At minimum: 2 chains (extractor→converter) + 2 chains (converter→synth) + 2 (extractor→storage)
    expect(belts.length).toBeGreaterThanOrEqual(6);

    // At least 2 converters have both input and output belt connections (the main pipeline)
    const converters = buildings.filter((b) => b.typeId === CONVERTER_BUILDING_TYPE_ID);
    const convertersWithBelts = converters.filter((converter) => {
      const connections = result.engine.getConnectionsOf(converter.id);
      const inputs  = connections.filter((c) => c.to.building === converter.id);
      const outputs = connections.filter((c) => c.from.building === converter.id);
      return inputs.length >= 1 && outputs.length >= 1;
    });
    expect(convertersWithBelts.length).toBeGreaterThanOrEqual(2);

    // At least 1 synthesizer has ≥2 belt input connections (the ceramic_plates synth)
    const synths = buildings.filter((b) => b.typeId === SYNTHESIZER_BUILDING_TYPE_ID);
    const synthsWithInputs = synths.filter((synth) => {
      const connections = result.engine.getConnectionsOf(synth.id);
      return connections.filter((c) => c.to.building === synth.id).length >= 2;
    });
    expect(synthsWithInputs.length).toBeGreaterThanOrEqual(1);
  });

  it('returns select tool and valid viewport', () => {
    const result = generateBuildAllScenario(640, 480);
    expect(result.selectedTool).toEqual({ kind: 'select' });
    expect(result.viewport.zoom).toBeCloseTo(0.35);
  });
});
