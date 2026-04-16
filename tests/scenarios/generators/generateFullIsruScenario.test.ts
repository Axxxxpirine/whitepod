import { describe, expect, it } from 'vitest';
import { generateFullIsruScenario } from '@/game/scenarios/generators/generateFullIsruScenario';
import {
  CONVERTER_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  isBeltTypeId,
  isProcessorTypeId,
} from '@/game/data/buildingCatalog';
import { ResourceType } from '@/game/types';

describe('generateFullIsruScenario', () => {
  it('places extractors, converters, a synthesizer, and storage', () => {
    const result = generateFullIsruScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];

    const extractors = buildings.filter((b) => b.typeId === EXTRACTOR_BUILDING_TYPE_ID);
    const converters = buildings.filter((b) => b.typeId === CONVERTER_BUILDING_TYPE_ID);
    const synthesizers = buildings.filter((b) => b.typeId === SYNTHESIZER_BUILDING_TYPE_ID);
    const storages = buildings.filter((b) => b.typeId === STORAGE_BUILDING_TYPE_ID);

    expect(extractors.length).toBeGreaterThanOrEqual(3);
    expect(converters.length).toBeGreaterThanOrEqual(2);
    expect(synthesizers.length).toBeGreaterThanOrEqual(1);
    expect(storages.length).toBeGreaterThanOrEqual(1);
  });

  it('has at least 2 disjoint energy subnets', () => {
    const result = generateFullIsruScenario(640, 480);
    const networks = result.engine.getEnergyNetworkBalances();
    expect(networks.length).toBeGreaterThanOrEqual(2);
  });

  it('all processors have active recipes', () => {
    const result = generateFullIsruScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];
    const processors = buildings.filter((b) => isProcessorTypeId(b.typeId));

    expect(processors.length).toBeGreaterThanOrEqual(3);
    for (const processor of processors) {
      const state = result.engine.getProcessorState(processor.id);
      expect(state).toBeDefined();
      expect(state!.recipeId).not.toBeNull();
    }
  });

  it('produces refined resources after simulation', () => {
    const result = generateFullIsruScenario(640, 480);
    const counts = result.engine.getResourceCounts();

    // Converters should have produced tier-1 refined resources
    expect(counts.ironOxide).toBeGreaterThan(0);
    expect(counts.aluminumOxide).toBeGreaterThan(0);

    // Synthesizer should have produced tier-2 from converter outputs
    expect(counts.ceramicPlates).toBeGreaterThan(0);
  });

  it('exposes all 3 base resource types as visible deposits', () => {
    const result = generateFullIsruScenario(640, 480);
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

  it('has belt segments connecting extractors to converters and converters to synthesizer', () => {
    const result = generateFullIsruScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];
    const belts = buildings.filter((b) => isBeltTypeId(b.typeId));

    // At minimum: 2 chains (extractor→converter) + 2 chains (converter→synth) + 2 (extractor→storage)
    // Each chain has at least 1 belt segment
    expect(belts.length).toBeGreaterThanOrEqual(6);

    // Verify converters have connections on both sides (input + output)
    const converters = buildings.filter((b) => b.typeId === CONVERTER_BUILDING_TYPE_ID);
    for (const converter of converters) {
      const connections = result.engine.getConnectionsOf(converter.id);
      const inputs = connections.filter((c) => c.to.building === converter.id);
      const outputs = connections.filter((c) => c.from.building === converter.id);
      expect(inputs.length).toBeGreaterThanOrEqual(1);
      expect(outputs.length).toBeGreaterThanOrEqual(1);
    }

    // Verify synthesizer has connections on input side
    const synths = buildings.filter((b) => b.typeId === SYNTHESIZER_BUILDING_TYPE_ID);
    for (const synth of synths) {
      const connections = result.engine.getConnectionsOf(synth.id);
      const inputs = connections.filter((c) => c.to.building === synth.id);
      expect(inputs.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('returns select tool and valid viewport', () => {
    const result = generateFullIsruScenario(640, 480);
    expect(result.selectedTool).toEqual({ kind: 'select' });
    expect(result.viewport.zoom).toBeCloseTo(0.45);
  });
});
