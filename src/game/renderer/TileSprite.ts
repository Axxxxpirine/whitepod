import type { TileType } from '../types';
import { TileType as TileTypeConst, ResourceType as ResourceTypeConst } from '../types';
import type { ResourceType } from '../types';
import { Assets, Texture, ImageSource } from 'pixi.js';
import { BUILDING_SPRITE_PATHS } from '../ui/spritePaths';
import { PIXI } from '@/design/tokens';

/* ── Deterministic hash helpers ── */

function hashCell(cx: number, cy: number, salt: number): number {
  let h = (cx * 374761393 + cy * 668265263 + salt * 1500450271) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/* ── Crater generation via multi-scale cellular approach ── */

interface CraterLayer {
  cellSize: number;
  minRadius: number;
  maxRadius: number;
  chance: number;
  depth: number;
}

const CRATER_LAYERS: CraterLayer[] = [
  { cellSize: 30, minRadius: 7, maxRadius: 14, chance: 0.35, depth: 0.30 },
  { cellSize: 14, minRadius: 3, maxRadius: 6, chance: 0.45, depth: 0.22 },
  { cellSize: 7, minRadius: 1, maxRadius: 3, chance: 0.55, depth: 0.14 },
];

/**
 * Computes how much a tile is darkened by nearby craters (0 = no crater, up to ~0.3).
 * For each layer, checks 3x3 neighboring cells for crater centers.
 */
function craterDarkening(x: number, y: number): number {
  let darkening = 0;
  for (const layer of CRATER_LAYERS) {
    const cellX = Math.floor(x / layer.cellSize);
    const cellY = Math.floor(y / layer.cellSize);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = cellX + dx;
        const cy = cellY + dy;
        if (hashCell(cx, cy, layer.cellSize) > layer.chance) continue;
        const craterX = cx * layer.cellSize + hashCell(cx, cy, layer.cellSize + 1) * layer.cellSize;
        const craterY = cy * layer.cellSize + hashCell(cx, cy, layer.cellSize + 2) * layer.cellSize;
        const radius = layer.minRadius + hashCell(cx, cy, layer.cellSize + 3) * (layer.maxRadius - layer.minRadius);
        const distSq = (x - craterX) ** 2 + (y - craterY) ** 2;
        const radiusSq = radius * radius;
        if (distSq < radiusSq) {
          const t = Math.sqrt(distSq) / radius; // 0 center, 1 edge
          darkening = Math.max(darkening, layer.depth * (1 - t * t));
        }
      }
    }
  }
  return darkening;
}

/* ── Tile color (Architect's Drawing Board palette) ──
 * Ground recentered on --grid-tile #181A1F, rock on --grid-tile-rock #22262D.
 * Procedural noise + crater darkening preserved, amplitude reduced to ±5%
 * (graphite mat should not vary like a grassy plain).
 * Each tile keeps the cool graphite tint via tintedHex(lum). */

// Target luminance matches the B channel of the token hex (highest of R/G/B).
const GROUND_LUM_BASE = 0x1f;   // #181A1F
const GROUND_LUM_MIN = 0x19;    // darkened by craters
const ROCK_LUM_BASE = 0x2d;     // #22262D
const ROCK_LUM_MIN = 0x24;
const SHADE_STEPS = 8;
const NOISE_AMPLITUDE = 2;      // ±5% of mid-luminance ~40 ⇒ ±2
const WATER_COLOR = PIXI.accent; // cool accent water reads as energy/liquid

// Graphite tint: R:G:B ≈ 0.77 : 0.84 : 1.0 (matches #181A1F / #22262D ratios)
function tintedHex(lum: number): number {
  const v = Math.max(0, Math.min(255, lum));
  const r = Math.round(v * 0.77);
  const g = Math.round(v * 0.84);
  const b = Math.round(v);
  return (r << 16) | (g << 8) | b;
}

export function getTileColor(type: TileType, x: number, y: number): number {
  if (type === TileTypeConst.Water) return WATER_COLOR;

  const dark = craterDarkening(x, y);
  const noise = (hashCell(x, y, 0) - 0.5) * 2 * NOISE_AMPLITUDE;

  const isRock = type === TileTypeConst.Rock;
  const base = isRock ? ROCK_LUM_BASE : GROUND_LUM_BASE;
  const min = isRock ? ROCK_LUM_MIN : GROUND_LUM_MIN;

  let lum = base - dark * (base - min) + noise;
  lum = Math.round(lum / (256 / SHADE_STEPS)) * (256 / SHADE_STEPS);

  switch (type) {
    case TileTypeConst.Empty:
    case TileTypeConst.Ground:
    case TileTypeConst.Rock:
      return tintedHex(lum);
    default:
      return PIXI.bg;
  }
}

let regolithTexture: Texture | null = null;

/**
 * Generate a dusty regolith noise texture procedurally on a canvas.
 * White-based with subtle darker speckles — the tint will color it.
 */
function createRegolithTexture(size: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Base fill — slightly off-white so tint controls the hue
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;

  // Seeded noise for reproducibility
  let seed = 12345;
  const rng = () => {
    seed = (seed * 16807 + 0) % 2147483647;
    return (seed & 0x7fffffff) / 2147483647;
  };

  for (let i = 0; i < data.length; i += 4) {
    const r = rng();
    // Most pixels stay bright, occasional darker speckles
    let brightness: number;
    if (r < 0.06) {
      // Dark speckle (dust grain) — subtle
      brightness = 210 + Math.floor(rng() * 25);
    } else if (r < 0.20) {
      // Slight dimming
      brightness = 235 + Math.floor(rng() * 12);
    } else {
      // Normal — near-white
      brightness = 247 + Math.floor(rng() * 9);
    }
    data[i] = brightness;
    data[i + 1] = brightness;
    data[i + 2] = brightness;
    // alpha stays 255
  }

  ctx.putImageData(imageData, 0, 0);

  return new Texture({ source: new ImageSource({ resource: canvas }) });
}

export function getTileTexture(): Texture {
  if (!regolithTexture) {
    regolithTexture = createRegolithTexture(32);
  }
  return regolithTexture;
}

const resourceTextures = new Map<ResourceType, Texture>();

export async function loadResourceTextures(): Promise<void> {
  const entries: [ResourceType, string][] = [
    [ResourceTypeConst.Coal, 'sprites/coal.png'],
    [ResourceTypeConst.IronOre, 'sprites/iron-ore.png'],
    [ResourceTypeConst.CopperOre, 'sprites/copper-ore.png'],
  ];
  for (const [type, path] of entries) {
    const texture = await Assets.load<Texture>(path);
    resourceTextures.set(type, texture);
  }
}

export function getResourceTexture(type: ResourceType): Texture | null {
  return resourceTextures.get(type) ?? null;
}

const buildingTextures = new Map<string, Texture>();

export async function loadBuildingTextures(): Promise<void> {
  for (const [typeId, path] of BUILDING_SPRITE_PATHS) {
    const texture = await Assets.load<Texture>(path);
    buildingTextures.set(typeId, texture);
  }
}

export function getBuildingTexture(typeId: string): Texture | null {
  return buildingTextures.get(typeId) ?? null;
}
