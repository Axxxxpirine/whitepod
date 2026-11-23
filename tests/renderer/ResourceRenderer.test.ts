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

  it('shows after any camera path what a renderer opened at that spot shows', () => {
    const engine = makeEngine();
    for (let ty = 0; ty < GRID_WIDTH; ty++) {
      for (let tx = 0; tx < GRID_WIDTH; tx++) {
        if ((tx * 7 + ty * 3) % 11 === 0) engine.placeResource(tx, ty, ResourceType.Regolith);
      }
    }
    const stage = { stage: new Container() } as unknown as Application;
    const travelling = new ResourceRenderer(stage, engine);
    const keys = (renderer: ResourceRenderer) =>
      [...(renderer as unknown as ResourceRendererTestApi).activeSprites.keys()].sort((a, b) => a - b);

    // Pans, a jump, a zoom out and back in.
    const path = [
      [2000, 2000, 1], [2040, 2000, 1], [2040, 2075, 1], [1900, 1950, 1],
      [6000, 500, 1], [6000, 500, 0.25], [5200, 900, 0.25], [5200, 900, 2],
    ] as const;
    for (const [centerX, centerY, zoom] of path) {
      engine.viewport.centerX = centerX;
      engine.viewport.centerY = centerY;
      engine.viewport.zoom = zoom;
      travelling.render();

      const fresh = new ResourceRenderer(stage, engine);
      fresh.render();
      expect(keys(travelling)).toEqual(keys(fresh));
      expect(keys(fresh).length).toBeGreaterThan(0);
      fresh.destroy();
    }

    travelling.destroy();
  });
});
