import type { TileType } from '../types';
import { TileType as TileTypeConst, ResourceType as ResourceTypeConst } from '../types';
import type { ResourceType } from '../types';
import { Assets, Texture, ImageSource } from 'pixi.js';
import { BATTERY_BASIC_BUILDING_TYPE_ID, EXTRACTOR_BUILDING_TYPE_ID, SOLAR_PANEL_BUILDING_TYPE_ID, STORAGE_BUILDING_TYPE_ID } from '../data/buildingCatalog';

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

/* ── Tile color with lunar palette ── */

const GROUND_BASE = 0xd0;
const GROUND_MIN = 0x90;
const ROCK_BASE = 0x70;
const ROCK_MIN = 0x4a;
const SHADE_STEPS = 8;
const WATER_COLOR = 0x2d6a9f;

function grayToHex(gray: number): number {
  const g = Math.max(0, Math.min(255, gray));
  return (g << 16) | (g << 8) | g;
}

export function getTileColor(type: TileType, x: number, y: number): number {
  if (type === TileTypeConst.Water) return WATER_COLOR;

  const dark = craterDarkening(x, y);
  // Add subtle per-tile noise so flat areas aren't perfectly uniform
  const noise = (hashCell(x, y, 0) - 0.5) * 6;

  const base = type === TileTypeConst.Rock || type === TileTypeConst.Empty && false
    ? ROCK_BASE : GROUND_BASE;
  const min = type === TileTypeConst.Rock ? ROCK_MIN : GROUND_MIN;

  let gray = base - dark * (base - min) + noise;
  // Quantize to SHADE_STEPS levels for pixelated look
  gray = Math.round(gray / (256 / SHADE_STEPS)) * (256 / SHADE_STEPS);

  switch (type) {
    case TileTypeConst.Empty:
    case TileTypeConst.Ground:
      return grayToHex(gray);
    case TileTypeConst.Rock:
      return grayToHex(gray);
    default:
      return 0x000000;
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
  const entries: [string, string][] = [
    [SOLAR_PANEL_BUILDING_TYPE_ID, 'sprites/solar_panel.svg'],
    [BATTERY_BASIC_BUILDING_TYPE_ID, 'sprites/battery.svg'],
    [STORAGE_BUILDING_TYPE_ID, 'sprites/warehouse.svg'],
    [EXTRACTOR_BUILDING_TYPE_ID, 'sprites/extractor.svg'],
  ];
  for (const [typeId, path] of entries) {
    const texture = await Assets.load<Texture>(path);
    buildingTextures.set(typeId, texture);
  }
}

export function getBuildingTexture(typeId: string): Texture | null {
  return buildingTextures.get(typeId) ?? null;
}
