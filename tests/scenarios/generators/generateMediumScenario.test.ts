import { describe, expect, it } from 'vitest';
import { generateMediumScenario } from '@/game/scenarios/generators/generateMediumScenario';
import { STORAGE_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { ResourceType } from '@/game/types';

describe('generateMediumScenario', () => {
  it('places a storage building', () => {
    const result = generateMediumScenario(640, 480);
    const buildings = [...result.engine.getBuildings().values()];
    const hasStorage = buildings.some((b) => b.typeId === STORAGE_BUILDING_TYPE_ID);
    expect(hasStorage).toBe(true);
  });

  it('exposes at least 2 distinct resource types as visible deposits', () => {
    const result = generateMediumScenario(640, 480);
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
    expect(types.size).toBeGreaterThanOrEqual(2);
  });

  it('returns select tool and valid viewport', () => {
    const result = generateMediumScenario(640, 480);
    expect(result.selectedTool).toEqual({ kind: 'select' });
    expect(result.viewport.zoom).toBeCloseTo(0.6);
  });

  it('has more buildings than the simple tier', () => {
    const result = generateMediumScenario(640, 480);
    expect(result.engine.getBuildings().size).toBeGreaterThan(6);
  });
});
