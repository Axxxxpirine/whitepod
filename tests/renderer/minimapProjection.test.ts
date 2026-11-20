import { describe, expect, it } from 'vitest';
import { GRID_HEIGHT, GRID_WIDTH, TILE_SIZE } from '@/game/constants';
import { GameEngine } from '@/game/engine/GameEngine';
import { worldToGrid } from '@/game/engine/CoordinateTransform';
import {
  createMinimapLayout,
  gridToMinimap,
  isInsideMinimap,
  minimapCircleRadius,
  minimapOutline,
  minimapToGrid,
  minimapToWorld,
  viewportOutline,
} from '@/game/renderer/minimapProjection';

const layout = createMinimapLayout(180);

describe('minimap projection', () => {
  it('fits the whole grid in the minimap box', () => {
    const [topLeft, , bottomRight] = minimapOutline(layout);
    expect(topLeft).toEqual({ x: 0, y: 0 });
    expect(bottomRight.x).toBeCloseTo(180);
    expect(bottomRight.y).toBeCloseTo((GRID_HEIGHT / GRID_WIDTH) * 180);
  });

  it('round-trips between grid and minimap space', () => {
    for (const [gx, gy] of [[0, 0], [12.5, 200.25], [GRID_WIDTH, GRID_HEIGHT], [128, 64]]) {
      const m = gridToMinimap(layout, gx, gy);
      const g = minimapToGrid(layout, m.x, m.y);
      expect(g.x).toBeCloseTo(gx);
      expect(g.y).toBeCloseTo(gy);
    }
  });

  it('only accepts points on the grid', () => {
    expect(isInsideMinimap(layout, 90, 90)).toBe(true);
    expect(isInsideMinimap(layout, -1, 10)).toBe(false);
    expect(isInsideMinimap(layout, 10, layout.height + 1)).toBe(false);
  });

  it('turns a minimap click into a camera target on that tile', () => {
    const m = gridToMinimap(layout, 40.5, 200.5);
    const target = minimapToWorld(layout, m.x, m.y);
    expect(target.wx).toBeCloseTo(40.5 * TILE_SIZE);
    expect(target.wy).toBeCloseTo(200.5 * TILE_SIZE);
    expect(worldToGrid(target.wx, target.wy)).toEqual({ x: 40, y: 200 });
  });

  it('outlines the visible area around the camera', () => {
    const engine = new GameEngine(800, 600);
    engine.viewport.restore({ centerX: 100 * TILE_SIZE, centerY: 150 * TILE_SIZE, zoom: 1 });

    const outline = viewportOutline(layout, engine.viewport);
    const mid = gridToMinimap(layout, 100, 150);
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);

    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(mid.x);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(mid.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo((800 / TILE_SIZE) * layout.scale);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo((600 / TILE_SIZE) * layout.scale);
  });

  it('shrinks the outline when zooming in', () => {
    const engine = new GameEngine(800, 600);
    const width = (zoom: number) => {
      engine.viewport.restore({ ...engine.viewport.getSnapshot(), zoom });
      const xs = viewportOutline(layout, engine.viewport).map((p) => p.x);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(2)).toBeCloseTo(width(1) / 2);
  });

  it('scales a watchtower radius with the minimap', () => {
    expect(minimapCircleRadius(layout, 10)).toBeCloseTo(10 * layout.scale);
  });
});
