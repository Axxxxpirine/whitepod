import { describe, it, expect } from 'vitest';
import {
  screenToWorld,
  worldToScreen,
  worldToGrid,
  gridToWorld,
  screenToGrid,
} from '@/game/engine/CoordinateTransform';
import { Viewport } from '@/game/engine/Viewport';
import { TILE_SIZE } from '@/game/constants';

describe('CoordinateTransform', () => {
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

  describe('worldToGrid / gridToWorld', () => {
    it('maps world origin to tile (0,0)', () => {
      expect(worldToGrid(0, 0)).toEqual({ x: 0, y: 0 });
    });

    it('maps world (TILE_SIZE-1, 0) still to tile (0,0)', () => {
      expect(worldToGrid(TILE_SIZE - 1, 0)).toEqual({ x: 0, y: 0 });
    });

    it('maps world (TILE_SIZE, 0) to tile (1,0)', () => {
      expect(worldToGrid(TILE_SIZE, 0)).toEqual({ x: 1, y: 0 });
    });

    it('gridToWorld returns top-left corner of tile', () => {
      expect(gridToWorld(3, 5)).toEqual({ wx: 3 * TILE_SIZE, wy: 5 * TILE_SIZE });
    });

    it('gridToWorld / worldToGrid are consistent for tile centers', () => {
      const { wx, wy } = gridToWorld(7, 4);
      // Top-left of tile (7,4) should map back to (7,4)
      expect(worldToGrid(wx, wy)).toEqual({ x: 7, y: 4 });
    });
  });

  describe('screenToGrid', () => {
    it('maps screen center to tile at viewport center', () => {
      const vp = new Viewport(640, 480);
      // Center viewport on the middle of tile (5,7)
      vp.centerX = 5 * TILE_SIZE + TILE_SIZE / 2;
      vp.centerY = 7 * TILE_SIZE + TILE_SIZE / 2;
      const coord = screenToGrid(vp, 320, 240);
      expect(coord.x).toBe(5);
      expect(coord.y).toBe(7);
    });
  });
});
