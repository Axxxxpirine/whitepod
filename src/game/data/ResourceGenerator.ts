import { GRID_WIDTH, GRID_HEIGHT } from '../constants';
import { ResourceType, TileType } from '../types';
import type { TileGrid } from './TileGrid';
import { mulberry32 } from './SeededRNG';
import { toIndex } from './coords';

interface ResourceConfig {
  readonly type: ResourceType;
  readonly frequency: number;
  readonly threshold: number;
  readonly seedOffset: number;
}

const DEFAULT_CONFIGS: readonly ResourceConfig[] = [
  { type: ResourceType.Coal, frequency: 0.05, threshold: 0.72, seedOffset: 0 },
  { type: ResourceType.IronOre, frequency: 0.04, threshold: 0.78, seedOffset: 1000 },
  { type: ResourceType.CopperOre, frequency: 0.03, threshold: 0.80, seedOffset: 2000 },
];

const ELIGIBLE_TILES = new Set<TileType>([TileType.Ground, TileType.Rock]);

const PERM_SIZE = 256;

function buildPermutation(rng: () => number): Uint8Array {
  const perm = new Uint8Array(PERM_SIZE * 2);
  // Fill first half with 0..255
  for (let i = 0; i < PERM_SIZE; i++) perm[i] = i;
  // Fisher-Yates shuffle
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  // Duplicate for overflow-safe indexing
  for (let i = 0; i < PERM_SIZE; i++) perm[PERM_SIZE + i] = perm[i];
  return perm;
}

/** Value noise with bilinear interpolation */
function valueNoise(x: number, y: number, perm: Uint8Array): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;

  // Smoothstep for smoother transitions
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);

  const ix = xi & 0xff;
  const iy = yi & 0xff;

  // Hash corners to get pseudo-random values
  const aa = perm[perm[ix] + iy] / 255;
  const ab = perm[perm[ix] + iy + 1] / 255;
  const ba = perm[perm[ix + 1] + iy] / 255;
  const bb = perm[perm[ix + 1] + iy + 1] / 255;

  // Bilinear interpolation
  const x1 = aa + u * (ba - aa);
  const x2 = ab + u * (bb - ab);
  return x1 + v * (x2 - x1);
}

/** Two-octave value noise for more natural shapes */
function noise2D(x: number, y: number, frequency: number, perm: Uint8Array): number {
  const n1 = valueNoise(x * frequency, y * frequency, perm);
  const n2 = valueNoise(x * frequency * 2, y * frequency * 2, perm);
  return n1 * 0.7 + n2 * 0.3;
}

export function generateResources(grid: TileGrid, seed: number): void {
  // Fill the entire grid with Ground before placing resources
  grid.fill(TileType.Ground);

  for (const config of DEFAULT_CONFIGS) {
    const rng = mulberry32(seed + config.seedOffset);
    const perm = buildPermutation(rng);

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const index = toIndex(x, y);

        // Skip tiles that already have a resource
        if (grid.resourceType[index] !== ResourceType.None) continue;

        // Only place on eligible tile types
        if (!ELIGIBLE_TILES.has(grid.tileType[index] as TileType)) continue;

        const n = noise2D(x, y, config.frequency, perm);
        if (n > config.threshold) {
          grid.resourceType[index] = config.type;
        }
      }
    }
  }

  // Mark entire grid dirty so renderer picks up the changes
  grid.markDirty(0, 0);
  grid.markDirty(GRID_WIDTH - 1, GRID_HEIGHT - 1);
}
