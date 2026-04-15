import { describe, it, expect } from 'vitest';
import { Viewport } from '@/game/engine/Viewport';
import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE } from '@/game/constants';

describe('Viewport', () => {
  it('initializes centered on the grid', () => {
    const vp = new Viewport(1920, 1080);
    expect(vp.centerX).toBe((GRID_WIDTH * TILE_SIZE) / 2);
    expect(vp.centerY).toBe((GRID_HEIGHT * TILE_SIZE) / 2);
    expect(vp.zoom).toBe(1);
  });

  describe('getVisibleTileRange', () => {
    it('returns a valid range at default zoom', () => {
      const vp = new Viewport(640, 480);
      const range = vp.getVisibleTileRange();
      expect(range.x0).toBeGreaterThanOrEqual(0);
      expect(range.y0).toBeGreaterThanOrEqual(0);
      expect(range.x1).toBeLessThan(GRID_WIDTH);
      expect(range.y1).toBeLessThan(GRID_HEIGHT);
      expect(range.x1).toBeGreaterThan(range.x0);
      expect(range.y1).toBeGreaterThan(range.y0);
    });

    it('range area shrinks when zoomed in', () => {
      const vp = new Viewport(640, 480);
      const r1 = vp.getVisibleTileRange();
      vp.zoomAt(320, 240, 2);
      const r2 = vp.getVisibleTileRange();
      const area1 = (r1.x1 - r1.x0) * (r1.y1 - r1.y0);
      const area2 = (r2.x1 - r2.x0) * (r2.y1 - r2.y0);
      expect(area2).toBeLessThan(area1);
    });

    it('range area grows when zoomed out', () => {
      const vp = new Viewport(640, 480);
      const r1 = vp.getVisibleTileRange();
      vp.zoomAt(320, 240, 0.5);
      const r2 = vp.getVisibleTileRange();
      const area1 = (r1.x1 - r1.x0) * (r1.y1 - r1.y0);
      const area2 = (r2.x1 - r2.x0) * (r2.y1 - r2.y0);
      expect(area2).toBeGreaterThan(area1);
    });

    it('never returns out-of-bounds tile coordinates', () => {
      const vp = new Viewport(640, 480);
      // Pan to corner
      vp.centerX = 0;
      vp.centerY = 0;
      const range = vp.getVisibleTileRange();
      expect(range.x0).toBeGreaterThanOrEqual(0);
      expect(range.y0).toBeGreaterThanOrEqual(0);
    });
  });

  describe('pan', () => {
    it('moves the center rightward on positive dx', () => {
      const vp = new Viewport(640, 480);
      const initialX = vp.centerX;
      vp.pan(100, 0);
      expect(vp.centerX).toBeGreaterThan(initialX);
    });

    it('clamps to grid bounds', () => {
      const vp = new Viewport(640, 480);
      vp.pan(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
      expect(vp.centerX).toBeLessThanOrEqual(GRID_WIDTH * TILE_SIZE);
      expect(vp.centerY).toBeLessThanOrEqual(GRID_HEIGHT * TILE_SIZE);
    });
  });

  describe('zoomAt', () => {
    it('clamps zoom to MAX_ZOOM', () => {
      const vp = new Viewport(640, 480);
      for (let i = 0; i < 20; i++) vp.zoomAt(320, 240, 2);
      expect(vp.zoom).toBe(4);
    });

    it('clamps zoom to MIN_ZOOM', () => {
      const vp = new Viewport(640, 480);
      for (let i = 0; i < 20; i++) vp.zoomAt(320, 240, 0.5);
      expect(vp.zoom).toBe(0.25);
    });

    it('keeps the point under the cursor fixed in world space', () => {
      const vp = new Viewport(640, 480);
      vp.centerX = 0;
      vp.centerY = 0;

      // World position at screen center before zoom
      const beforeX = vp.centerX + (320 - vp.screenWidth / 2) / vp.zoom;
      const beforeY = vp.centerY + (240 - vp.screenHeight / 2) / vp.zoom;

      vp.zoomAt(320, 240, 2);

      const afterX = vp.centerX + (320 - vp.screenWidth / 2) / vp.zoom;
      const afterY = vp.centerY + (240 - vp.screenHeight / 2) / vp.zoom;

      expect(afterX).toBeCloseTo(beforeX);
      expect(afterY).toBeCloseTo(beforeY);
    });
  });

  describe('resize', () => {
    it('updates screen dimensions', () => {
      const vp = new Viewport(640, 480);
      vp.resize(1920, 1080);
      expect(vp.screenWidth).toBe(1920);
      expect(vp.screenHeight).toBe(1080);
    });
  });

  describe('snapshot', () => {
    it('round-trips through getSnapshot and restore', () => {
      const source = new Viewport(640, 480);
      source.pan(120, 80);
      source.zoomAt(320, 240, 1.5);

      const restored = new Viewport(640, 480);
      restored.restore(source.getSnapshot());

      expect(restored.getSnapshot()).toEqual(source.getSnapshot());
    });

    it('clamps restored values to valid bounds', () => {
      const vp = new Viewport(640, 480);

      vp.restore({
        centerX: Number.MAX_SAFE_INTEGER,
        centerY: -100,
        zoom: 999,
      });

      expect(vp.centerX).toBeLessThanOrEqual(GRID_WIDTH * TILE_SIZE);
      expect(vp.centerY).toBeGreaterThanOrEqual(0);
      expect(vp.zoom).toBe(4);
    });
  });
});
