import type { TileType } from '../types';
import { TileType as TileTypeConst, ResourceType as ResourceTypeConst } from '../types';
import type { ResourceType } from '../types';
import { Assets, Texture } from 'pixi.js';

const TILE_COLORS: Record<TileType, number> = {
  [TileTypeConst.Empty]: 0x4a7c59,
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
