import { Container, Texture, type Application } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { TerrainDecalRenderer } from '@/game/renderer/TerrainDecalRenderer';
import { TileType } from '@/game/types';

vi.mock('@/game/renderer/TileSprite', () => ({
  getTerrainDecalTexture: () => Texture.WHITE,
}));

type TerrainDecalRendererTestApi = {
  activeSprites: Map<number, unknown>;
};

describe('TerrainDecalRenderer', () => {
  it('shows after any camera path what a renderer opened at that spot shows', () => {
    const engine = new GameEngine(800, 600);
    engine.grid.fill(TileType.Ground);
    const stage = { stage: new Container() } as unknown as Application;
    const travelling = new TerrainDecalRenderer(stage, engine);
    const keys = (renderer: TerrainDecalRenderer) =>
      [...(renderer as unknown as TerrainDecalRendererTestApi).activeSprites.keys()].sort((a, b) => a - b);

    const path = [
      [2000, 2000, 1], [2040, 2000, 1], [2040, 2075, 1], [1900, 1950, 1],
      [6000, 500, 1], [6000, 500, 0.25], [5200, 900, 0.25], [5200, 900, 2],
    ] as const;
    for (const [centerX, centerY, zoom] of path) {
      engine.viewport.centerX = centerX;
      engine.viewport.centerY = centerY;
      engine.viewport.zoom = zoom;
      travelling.render();

      const fresh = new TerrainDecalRenderer(stage, engine);
      fresh.render();
      expect(keys(travelling)).toEqual(keys(fresh));
      expect(keys(fresh).length).toBeGreaterThan(0);
      fresh.destroy();
    }

    travelling.destroy();
  });
});
