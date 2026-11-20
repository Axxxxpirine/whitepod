import { describe, expect, it, vi } from 'vitest';
import { generateComplexScenario } from '@/game/scenarios/generators/generateComplexScenario';
import {
  MERGER_BASIC_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { Building, BuildingId } from '@/game/types';
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
    expect(types.has(ResourceType.Regolith)).toBe(true);
    expect(types.has(ResourceType.Hydrogen)).toBe(true);
    expect(types.has(ResourceType.Oxygen)).toBe(true);
  });

  it('returns select tool and valid viewport', () => {
    const result = generateComplexScenario(640, 480);
    expect(result.selectedTool).toEqual({ kind: 'select' });
    expect(result.viewport.zoom).toBeCloseTo(0.5);
  });

  it('routes the merger output into storage for every mirrored layout (issue #45)', () => {
    // Fixed seeds keep the test deterministic; together they cover the four
    // mirror combinations (left/right x up/down).
    const layouts = new Set<string>();
    const seedSpy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    try {
      for (let seed = 1; seed <= 24; seed++) {
        seedSpy.mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
          (array as unknown as Uint32Array)[0] = seed;
          return array;
        });
        const { engine } = generateComplexScenario(640, 480);
        const buildings = [...engine.getBuildings().values()];
        const merger = buildings.find((b) => b.typeId === MERGER_BASIC_BUILDING_TYPE_ID)!;
        const storage = nearestStorage(buildings, merger.origin.x);
        layouts.add(`${Math.sign(storage.origin.x - merger.origin.x)},${Math.sign(storage.origin.y - merger.origin.y)}`);

        const inputs = engine.getConnectionsOf(merger.id).filter((c) => c.to.building === merger.id);
        expect(inputs, `seed ${seed}`).toHaveLength(2);
        expect(reachesStorage(engine, merger.id), `seed ${seed}`).toBe(true);
      }
    } finally {
      seedSpy.mockRestore();
    }
    expect(layouts.size).toBe(4);
  });
});

function reachesStorage(engine: GameEngine, start: BuildingId): boolean {
  const seen = new Set<BuildingId>();
  const queue: BuildingId[] = [start];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    if (current !== start && engine.getBuildings().get(current)?.typeId === STORAGE_BUILDING_TYPE_ID) return true;
    for (const connection of engine.getConnectionsOf(current)) {
      if (connection.from.building === current) queue.push(connection.to.building);
    }
  }
  return false;
}

function nearestStorage(buildings: readonly Building[], x: number): Building {
  const storages = buildings.filter((b) => b.typeId === STORAGE_BUILDING_TYPE_ID);
  return storages.reduce((best, s) => (Math.abs(s.origin.x - x) < Math.abs(best.origin.x - x) ? s : best));
}
