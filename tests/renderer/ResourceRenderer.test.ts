import { Container, Texture, type Application } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { GRID_WIDTH } from '@/game/constants';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceRenderer } from '@/game/renderer/ResourceRenderer';
import { ResourceType, TileType } from '@/game/types';

vi.mock('@/game/renderer/TileSprite', () => ({
  getResourceTexture: () => Texture.WHITE,
}));

function makeEngine() {
  const engine = new GameEngine(800, 600);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  return engine;
}

type ResourceRendererTestApi = {
  activeSprites: Map<number, unknown>;
};

describe('ResourceRenderer', () => {
  it('draws a stocked deposit and hides an exhausted one', () => {
    const engine = makeEngine();
    engine.placeResource(128, 128, ResourceType.Regolith);
    engine.placeResource(130, 128, ResourceType.Oxygen);
    engine.grid.resourceAmount[128 * GRID_WIDTH + 130] = 0;
    engine.grid.markDirty(130, 128);

    const renderer = new ResourceRenderer({ stage: new Container() } as unknown as Application, engine);
    renderer.render();

    const sprites = (renderer as unknown as ResourceRendererTestApi).activeSprites;
    expect([...sprites.keys()]).toEqual([128 * GRID_WIDTH + 128]);

    renderer.destroy();
  });
});
