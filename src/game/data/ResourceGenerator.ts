import { GRID_WIDTH, GRID_HEIGHT, RESOURCE_DEPOSIT_AMOUNT } from '../constants';
import { ResourceType, TileType } from '../types';
import type { TileGrid } from './TileGrid';
import { mulberry32 } from './SeededRNG';
import { isInBounds, toCoord, toIndex } from './coords';

interface ResourceConfig {
  readonly type: ResourceType;
  readonly coverage: number;
  readonly minSpacing: number;
  readonly pairChance: number;
  readonly seedOffset: number;
}

const RESOURCE_COVERAGE_MULTIPLIER = 0.7;

const DEFAULT_CONFIGS: readonly ResourceConfig[] = [
  {
    type: ResourceType.Coal,
    coverage: 0.016 * RESOURCE_COVERAGE_MULTIPLIER,
    minSpacing: 2,
    pairChance: 0.12,
    seedOffset: 0,
  },
  {
    type: ResourceType.IronOre,
    coverage: 0.006 * RESOURCE_COVERAGE_MULTIPLIER,
    minSpacing: 2,
    pairChance: 0.08,
    seedOffset: 1000,
  },
  {
    type: ResourceType.CopperOre,
    coverage: 0.0026 * RESOURCE_COVERAGE_MULTIPLIER,
    minSpacing: 2,
    pairChance: 0.06,
    seedOffset: 2000,
  },
];

const ELIGIBLE_TILES = new Set<TileType>([TileType.Ground, TileType.Rock]);

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
}

function markBlockedArea(mask: Uint8Array, x: number, y: number, radius: number): void {
  const x0 = Math.max(0, x - radius);
  const y0 = Math.max(0, y - radius);
  const x1 = Math.min(GRID_WIDTH - 1, x + radius);
  const y1 = Math.min(GRID_HEIGHT - 1, y + radius);

  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      mask[toIndex(xx, yy)] = 1;
    }
  }
}

function tryPlacePair(
  grid: TileGrid,
  x: number,
  y: number,
  resourceType: ResourceType,
  rng: () => number,
): boolean {
  const offsets: Array<readonly [number, number]> = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  shuffleInPlace(offsets, rng);

  for (const [dx, dy] of offsets) {
    const nx = x + dx;
    const ny = y + dy;
    if (!isInBounds(nx, ny)) continue;

    const index = toIndex(nx, ny);
    if (grid.resourceType[index] !== ResourceType.None) continue;
    if (!ELIGIBLE_TILES.has(grid.tileType[index] as TileType)) continue;

    grid.resourceType[index] = resourceType;
    grid.resourceAmount[index] = RESOURCE_DEPOSIT_AMOUNT;
    return true;
  }

  return false;
}

export function generateResources(grid: TileGrid, seed: number): void {
  grid.fill(TileType.Ground);
  grid.resourceType.fill(ResourceType.None);
  grid.resourceAmount.fill(0);

  const blockedOrigins = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
  const allCoords = Array.from({ length: GRID_WIDTH * GRID_HEIGHT }, (_, index) => index);

  for (const config of DEFAULT_CONFIGS) {
    const rng = mulberry32(seed + config.seedOffset);
    const shuffledCoords = [...allCoords];
    shuffleInPlace(shuffledCoords, rng);
    const targetCount = Math.round(GRID_WIDTH * GRID_HEIGHT * config.coverage);
    let placedCount = 0;

    for (const index of shuffledCoords) {
      if (placedCount >= targetCount) break;

      const { x, y } = toCoord(index);

      if (grid.resourceType[index] !== ResourceType.None) continue;
      if (!ELIGIBLE_TILES.has(grid.tileType[index] as TileType)) continue;
      if (blockedOrigins[index] !== 0) continue;

      grid.resourceType[index] = config.type;
      grid.resourceAmount[index] = RESOURCE_DEPOSIT_AMOUNT;
      markBlockedArea(blockedOrigins, x, y, config.minSpacing);
      placedCount += 1;

      if (placedCount < targetCount && rng() < config.pairChance) {
        if (tryPlacePair(grid, x, y, config.type, rng)) {
          placedCount += 1;
        }
      }
    }
  }

  grid.markDirty(0, 0);
  grid.markDirty(GRID_WIDTH - 1, GRID_HEIGHT - 1);
}
