import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { gridToWorld, screenToGrid, worldToScreen } from '@/game/engine/CoordinateTransform';
import { footprintBottomAnchor, footprintDiamond, tileTopAnchor } from '@/game/renderer/isoFootprint';
import { ISO_TILE_H } from '@/game/constants';

describe('footprintBottomAnchor', () => {
  it('sits on the south vertex of a square footprint', () => {
    const diamond = footprintDiamond(130, 127, 3, 3);
    expect(footprintBottomAnchor(130, 127, 3, 3)).toEqual(diamond.south);
  });

  it('stays horizontally centered on non-square footprints', () => {
    const diamond = footprintDiamond(10, 20, 4, 2);
    const anchor = footprintBottomAnchor(10, 20, 4, 2);
    expect(anchor.x).toBe(diamond.center.x);
    expect(anchor.y).toBe(diamond.south.y);
  });

  it('lands on screen next to a building the camera is centered on', () => {
    const engine = new GameEngine(1024, 768);
    const center = gridToWorld(131, 128);
    engine.viewport.restore({ centerX: center.wx, centerY: center.wy, zoom: 1 });

    const anchor = footprintBottomAnchor(130, 127, 3, 3);
    const { sx, sy } = worldToScreen(engine.viewport, anchor.x, anchor.y);

    expect(sx).toBeCloseTo(512);
    expect(sy).toBeGreaterThan(384);
    expect(sy).toBeLessThan(768);
  });
});

describe('tileTopAnchor', () => {
  it('sits half a tile above the tile center', () => {
    const center = gridToWorld(42, 17);
    expect(tileTopAnchor(42, 17)).toEqual({ x: center.wx, y: center.wy - ISO_TILE_H / 2 });
  });

  it('picks back to the same tile just below the anchor', () => {
    const engine = new GameEngine(1024, 768);
    const center = gridToWorld(42, 17);
    engine.viewport.restore({ centerX: center.wx, centerY: center.wy, zoom: 1 });

    const anchor = tileTopAnchor(42, 17);
    const { sx, sy } = worldToScreen(engine.viewport, anchor.x, anchor.y + 1);
    expect(screenToGrid(engine.viewport, sx, sy)).toEqual({ x: 42, y: 17 });
  });
});
