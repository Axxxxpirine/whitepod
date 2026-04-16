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
  it('renders a resource sprite even when an old save restored a zero resource amount', () => {
    const engine = makeEngine();
    const x = 128;
    const y = 128;
    engine.placeResource(x, y, ResourceType.Regolith);
    engine.grid.resourceAmount[y * GRID_WIDTH + x] = 0;
    engine.grid.markDirty(x, y);

    const renderer = new ResourceRenderer({ stage: new Container() } as unknown as Application, engine);

    renderer.render();

    expect((renderer as unknown as ResourceRendererTestApi).activeSprites.size).toBe(1);

    renderer.destroy();
  });
});
