import { describe, expect, it } from 'vitest';
import { GRID_HEIGHT, GRID_WIDTH } from '@/game/constants';
import { GameEngine } from '@/game/engine/GameEngine';
import { gridToWorld } from '@/game/engine/CoordinateTransform';
import { isoToTile } from '@/game/engine/IsoTransform';
import {
  createMinimapLayout,
  gridToMinimap,
  isInsideMinimap,
  minimapCircleRadii,
  minimapDiamond,
  minimapToGrid,
  minimapToWorld,
  viewportOutline,
} from '@/game/renderer/minimapProjection';

const layout = createMinimapLayout(200);

describe('minimap projection', () => {
  it('fits the grid diamond in a 2:1 box', () => {
    const [north, east, south, west] = minimapDiamond(layout);
    expect(layout.height).toBe(100);
    expect(north.y).toBeCloseTo(0);
    expect(south.y).toBeCloseTo(layout.height);
    expect(west.x).toBeCloseTo(0);
    expect(east.x).toBeCloseTo(layout.width);
  });

  it('round-trips between grid and minimap space', () => {
    for (const [gx, gy] of [[0, 0], [12.5, 200.25], [GRID_WIDTH, GRID_HEIGHT], [128, 64]]) {
      const m = gridToMinimap(layout, gx, gy);
      const g = minimapToGrid(layout, m.x, m.y);
      expect(g.x).toBeCloseTo(gx);
      expect(g.y).toBeCloseTo(gy);
    }
  });

  it('keeps the main view orientation (east tile is to the right and lower)', () => {
    const a = gridToMinimap(layout, 10.5, 10.5);
    const east = gridToMinimap(layout, 11.5, 10.5);
    expect(east.x).toBeGreaterThan(a.x);
    expect(east.y).toBeGreaterThan(a.y);
    expect((east.x - a.x) / (east.y - a.y)).toBeCloseTo(2);
  });

  it('only accepts points inside the diamond', () => {
    expect(isInsideMinimap(layout, layout.width / 2, layout.height / 2)).toBe(true);
    expect(isInsideMinimap(layout, 2, 2)).toBe(false);
    expect(isInsideMinimap(layout, layout.width - 2, layout.height - 2)).toBe(false);
  });

  it('turns a minimap click into a camera target on that tile', () => {
    const m = gridToMinimap(layout, 40.5, 200.5);
    const target = minimapToWorld(layout, m.x, m.y);
    expect(target).toEqual(gridToWorld(40, 200));
    expect(isoToTile(target.wx, target.wy)).toEqual({ tx: 40, ty: 200 });
  });

  it('outlines the visible area around the camera tile', () => {
    const engine = new GameEngine(800, 600);
    const center = gridToWorld(100, 150);
    engine.viewport.restore({ centerX: center.wx, centerY: center.wy, zoom: 1 });

    const outline = viewportOutline(layout, engine.viewport);
    const mid = gridToMinimap(layout, 100.5, 150.5);
    const xs = outline.map((p) => p.x);
    const ys = outline.map((p) => p.y);

    expect(outline).toHaveLength(4);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(mid.x);
    expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(mid.y);
    // Same projection on both sides: the 800x600 screen stays a 4:3 rectangle.
    expect((Math.max(...xs) - Math.min(...xs)) / (Math.max(...ys) - Math.min(...ys))).toBeCloseTo(4 / 3);
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

  it('projects a watchtower radius as a 2:1 ellipse', () => {
    const { rx, ry } = minimapCircleRadii(layout, 10);
    expect(rx / ry).toBeCloseTo(2);
    const right = gridToMinimap(layout, 10 + 10 / Math.SQRT2, 10 - 10 / Math.SQRT2);
    const center = gridToMinimap(layout, 10, 10);
    expect(right.x - center.x).toBeCloseTo(rx);
  });
});
