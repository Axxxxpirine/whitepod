import { describe, it, expect } from 'vitest';
import {
  screenToWorld,
  worldToScreen,
  worldToGrid,
  gridToWorld,
  screenToGrid,
} from '@/game/engine/CoordinateTransform';
import { Viewport } from '@/game/engine/Viewport';
import { isoWorldCenter, tileCenterToIso } from '@/game/engine/IsoTransform';
import { ISO_TILE_H, ISO_TILE_W } from '@/game/constants';

describe('CoordinateTransform (iso projection)', () => {
  const makeViewport = (zoom = 1) => {
    const vp = new Viewport(640, 480);
    vp.centerX = 0;
    vp.centerY = 0;
    vp.zoom = zoom;
    return vp;
  };

  describe('screenToWorld / worldToScreen', () => {
    it('round-trips correctly', () => {
      const vp = makeViewport();
      const { wx, wy } = screenToWorld(vp, 320, 240);
      const { sx, sy } = worldToScreen(vp, wx, wy);
      expect(sx).toBeCloseTo(320);
      expect(sy).toBeCloseTo(240);
    });

    it('maps screen center to viewport center', () => {
      const vp = new Viewport(640, 480);
      vp.centerX = 1000;
      vp.centerY = 2000;
      const { wx, wy } = screenToWorld(vp, 320, 240);
      expect(wx).toBeCloseTo(1000);
      expect(wy).toBeCloseTo(2000);
    });

    it('offsets correctly with zoom', () => {
      const vp = makeViewport(2);
      // At zoom=2, screen pixels map to 0.5 world units
      const { wx } = screenToWorld(vp, 320 + 2, 240);
      expect(wx).toBeCloseTo(1); // 2px / zoom2 = 1 world unit
    });
  });

  describe('worldToGrid / gridToWorld (iso semantics)', () => {
    it('maps iso world origin to tile (0, 0)', () => {
      expect(worldToGrid(0, 0)).toEqual({ x: 0, y: 0 });
    });

    it('gridToWorld returns iso center of the tile diamond', () => {
      // Tile (3, 5) center: ((3-5)*32, (3+5)*16) = (-64, 128)
      expect(gridToWorld(3, 5)).toEqual({
        wx: (3 - 5) * (ISO_TILE_W / 2),
        wy: (3 + 5) * (ISO_TILE_H / 2),
      });
    });

    it('worldToGrid recovers the same tile for any tile center', () => {
      for (const [tx, ty] of [
        [0, 0],
        [7, 4],
        [10, 10],
        [50, 80],
        [128, 128],
      ]) {
        const { wx, wy } = gridToWorld(tx, ty);
        expect(worldToGrid(wx, wy)).toEqual({ x: tx, y: ty });
      }
    });

    it('picks neighbor tiles when offset crosses a diamond edge', () => {
      // Tile (5, 5) center is iso (0, 160). Going east on screen by past the
      // east vertex (32, 160) -> 1px past (33, 160) -> tile (6, 4) (NE neighbor
      // in iso is east on screen).
      const center = tileCenterToIso(5, 5);
      const neighbor = worldToGrid(center.wx + ISO_TILE_W / 2 + 1, center.wy);
      expect(neighbor).toEqual({ x: 6, y: 4 });
    });
  });

  describe('screenToGrid', () => {
    it('maps screen center to the tile under the viewport center', () => {
      // Center the viewport on tile (5, 7)'s diamond center.
      const vp = new Viewport(640, 480);
      const center = tileCenterToIso(5, 7);
      vp.centerX = center.wx;
      vp.centerY = center.wy;
      const coord = screenToGrid(vp, 320, 240);
      expect(coord).toEqual({ x: 5, y: 7 });
    });

    it('default-centered viewport picks middle of grid', () => {
      const vp = new Viewport(640, 480);
      const expectedCenter = isoWorldCenter();
      expect(vp.centerX).toBe(expectedCenter.wx);
      expect(vp.centerY).toBe(expectedCenter.wy);
    });
  });
});
