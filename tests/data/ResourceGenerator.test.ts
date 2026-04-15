import { describe, expect, it } from 'vitest';
import { GRID_HEIGHT, GRID_WIDTH } from '@/game/constants';
import { generateResources } from '@/game/data/ResourceGenerator';
import { TileGrid } from '@/game/data/TileGrid';
import { getNeighbors4, toIndex } from '@/game/data/coords';
import { ResourceType, TileType } from '@/game/types';

function createGrid(): TileGrid {
  return new TileGrid();
}

function countResources(grid: TileGrid): Record<number, number> {
  const counts: Record<number, number> = {
    [ResourceType.None]: 0,
    [ResourceType.Coal]: 0,
    [ResourceType.IronOre]: 0,
    [ResourceType.CopperOre]: 0,
  };

  for (const resource of grid.resourceType) {
    counts[resource] += 1;
  }

  return counts;
}

function maxClusterSize(grid: TileGrid): number {
  const visited = new Uint8Array(grid.resourceType.length);
  let maxSize = 0;

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const start = toIndex(x, y);
      if (visited[start] !== 0 || grid.resourceType[start] === ResourceType.None) continue;

      let size = 0;
      const stack = [start];
      visited[start] = 1;

      while (stack.length > 0) {
        const index = stack.pop()!;
        size += 1;
        const ix = index % GRID_WIDTH;
        const iy = Math.floor(index / GRID_WIDTH);

        for (const neighbor of getNeighbors4(ix, iy)) {
          if (visited[neighbor] !== 0 || grid.resourceType[neighbor] === ResourceType.None) continue;
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }

      if (size > maxSize) {
        maxSize = size;
      }
    }
  }

  return maxSize;
}

function hasFullResourceSquare(grid: TileGrid): boolean {
  for (let y = 0; y < GRID_HEIGHT - 1; y++) {
    for (let x = 0; x < GRID_WIDTH - 1; x++) {
      const a = grid.getResource(x, y);
      const b = grid.getResource(x + 1, y);
      const c = grid.getResource(x, y + 1);
      const d = grid.getResource(x + 1, y + 1);
      if (
        a !== ResourceType.None &&
        b !== ResourceType.None &&
        c !== ResourceType.None &&
        d !== ResourceType.None
      ) {
        return true;
      }
    }
  }

  return false;
}

describe('ResourceGenerator', () => {
  it('fills the map with ground and only places resources on eligible tiles', () => {
    const grid = createGrid();

    generateResources(grid, 42);

    expect(grid.tileType.every((tile) => tile === TileType.Ground)).toBe(true);
    expect(
      grid.resourceType.every((resource, index) => {
        if (resource === ResourceType.None) return true;
        return grid.tileType[index] === TileType.Ground || grid.tileType[index] === TileType.Rock;
      }),
    ).toBe(true);
  });

  it('produces the exact same distribution for the same seed', () => {
    const first = createGrid();
    const second = createGrid();

    generateResources(first, 42);
    generateResources(second, 42);

    expect(Array.from(first.resourceType)).toEqual(Array.from(second.resourceType));
  });

  it('produces a different distribution for a different seed', () => {
    const first = createGrid();
    const second = createGrid();

    generateResources(first, 42);
    generateResources(second, 43);

    expect(Array.from(first.resourceType)).not.toEqual(Array.from(second.resourceType));
  });

  it('keeps per-resource counts close to the configured targets', () => {
    const grid = createGrid();

    generateResources(grid, 42);
    const counts = countResources(grid);

    expect(counts[ResourceType.Coal]).toBeGreaterThanOrEqual(730);
    expect(counts[ResourceType.Coal]).toBeLessThanOrEqual(738);
    expect(counts[ResourceType.IronOre]).toBeGreaterThanOrEqual(274);
    expect(counts[ResourceType.IronOre]).toBeLessThanOrEqual(276);
    expect(counts[ResourceType.CopperOre]).toBeGreaterThanOrEqual(118);
    expect(counts[ResourceType.CopperOre]).toBeLessThanOrEqual(120);
  });

  it('prevents large clusters and 2x2 resource blocks', () => {
    const grid = createGrid();

    generateResources(grid, 42);

    expect(maxClusterSize(grid)).toBeLessThanOrEqual(2);
    expect(hasFullResourceSquare(grid)).toBe(false);
  });

  it('marks the full map dirty after generation', () => {
    const grid = createGrid();

    generateResources(grid, 42);

    expect(grid.getDirtyRegion()).toEqual({
      x0: 0,
      y0: 0,
      x1: GRID_WIDTH - 1,
      y1: GRID_HEIGHT - 1,
    });
  });
});
