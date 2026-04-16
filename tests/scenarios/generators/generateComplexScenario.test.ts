import { describe, expect, it } from 'vitest';
import { generateComplexScenario } from '@/game/scenarios/generators/generateComplexScenario';
import { MERGER_BASIC_BUILDING_TYPE_ID, WATCHTOWER_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { ResourceType } from '@/game/types';

describe('generateComplexScenario', () => {
  it('places a watchtower', () => {
    const result = generateComplexScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];
    const hasWatchtower = buildings.some((b) => b.typeId === WATCHTOWER_BUILDING_TYPE_ID);
    expect(hasWatchtower).toBe(true);
  });

  it('places at least one merger', () => {
    const result = generateComplexScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];
    const hasMerger = buildings.some((b) => b.typeId === MERGER_BASIC_BUILDING_TYPE_ID);
    expect(hasMerger).toBe(true);
  });

  it('has at least 2 disjoint energy subnets', () => {
    const result = generateComplexScenario(640, 480);
    const networks = result.engine.getEnergyNetworkBalances();
    expect(networks.length).toBeGreaterThanOrEqual(2);
  });

  it('exposes all 3 resource types as visible deposits', () => {
    const result = generateComplexScenario(640, 480);
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
    expect(types.has(ResourceType.Coal)).toBe(true);
    expect(types.has(ResourceType.IronOre)).toBe(true);
    expect(types.has(ResourceType.CopperOre)).toBe(true);
  });

  it('returns select tool and valid viewport', () => {
    const result = generateComplexScenario(640, 480);
    expect(result.selectedTool).toEqual({ kind: 'select' });
    expect(result.viewport.zoom).toBeCloseTo(0.5);
  });
});
