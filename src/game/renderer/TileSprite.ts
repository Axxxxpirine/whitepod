import type { TileType } from '../types';
import { TileType as TileTypeConst } from '../types';
import { Texture } from 'pixi.js';

const TILE_COLORS: Record<TileType, number> = {
  [TileTypeConst.Empty]: 0x1a1a2e,
  [TileTypeConst.Ground]: 0x4a7c59,
  [TileTypeConst.Rock]: 0x6b6b6b,
  [TileTypeConst.Water]: 0x2d6a9f,
};

export function getTileColor(type: TileType): number {
  return TILE_COLORS[type] ?? 0x000000;
}

export function getTileTexture(): Texture {
  return Texture.WHITE;
}
