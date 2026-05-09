import { describe, expect, it } from 'vitest';
import {
  isoToTile,
  isoToTileContinuous,
  isoVisibleTileRange,
  isoWorldBounds,
  isoWorldCenter,
  tileCenterToIso,
} from '@/game/engine/IsoTransform';
import { GRID_HEIGHT, GRID_WIDTH, ISO_TILE_H, ISO_TILE_W } from '@/game/constants';

describe('IsoTransform', () => {
  describe('tileCenterToIso', () => {
    it('maps tile (0,0) to iso origin', () => {
      expect(tileCenterToIso(0, 0)).toEqual({ wx: 0, wy: 0 });
    });

    it('moves east as tx increases', () => {
      expect(tileCenterToIso(1, 0)).toEqual({ wx: ISO_TILE_W / 2, wy: ISO_TILE_H / 2 });
    });

    it('moves west as ty increases', () => {
      expect(tileCenterToIso(0, 1)).toEqual({ wx: -ISO_TILE_W / 2, wy: ISO_TILE_H / 2 });
    });

    it('produces 2:1 diamond proportions for adjacent tiles', () => {
      // East-adjacent tiles: (32, 16) offset
      const a = tileCenterToIso(5, 5);
      const b = tileCenterToIso(6, 5);
      expect(b.wx - a.wx).toBe(ISO_TILE_W / 2);
      expect(b.wy - a.wy).toBe(ISO_TILE_H / 2);
    });
  });

  describe('isoToTile', () => {
    it('round-trips with tileCenterToIso for a sample of tiles', () => {
      for (let tx = 0; tx < GRID_WIDTH; tx += 17) {
        for (let ty = 0; ty < GRID_HEIGHT; ty += 19) {
          const iso = tileCenterToIso(tx, ty);
          const back = isoToTile(iso.wx, iso.wy);
          expect(back).toEqual({ tx, ty });
        }
      }
    });

    it('picks the same tile for a small offset around the center', () => {
      const iso = tileCenterToIso(40, 40);
      // ±1px around the center should still pick (40, 40)
      expect(isoToTile(iso.wx + 1, iso.wy)).toEqual({ tx: 40, ty: 40 });
      expect(isoToTile(iso.wx - 1, iso.wy)).toEqual({ tx: 40, ty: 40 });
      expect(isoToTile(iso.wx, iso.wy + 1)).toEqual({ tx: 40, ty: 40 });
      expect(isoToTile(iso.wx, iso.wy - 1)).toEqual({ tx: 40, ty: 40 });
    });

    it('picks adjacent tile when offset crosses the east diamond edge', () => {
      // Center of (5, 5) is at iso (0, 160). East vertex is at (32, 160).
      // Just past it (33, 160) is on the east-screen side, which in iso logical
      // coords is tile (6, 4) (NE neighbor) — going east on SCREEN goes
      // tx+1, ty-1 in logical coords.
      const center = tileCenterToIso(5, 5);
      const past = isoToTile(center.wx + ISO_TILE_W / 2 + 1, center.wy);
      expect(past).toEqual({ tx: 6, ty: 4 });
    });

    it('handles the four tiles around a vertex consistently', () => {
      // The vertex at iso (64, 80) is shared by (3, 1) S, (4, 1) W, (3, 2) E,
      // (4, 2) N. Verify offsets pick the right neighbor.
      // Just north of vertex → tile (3, 1) (S vertex side)
      expect(isoToTile(64, 79)).toEqual({ tx: 3, ty: 1 });
      // Just south of vertex → tile (4, 2) (N vertex side)
      expect(isoToTile(64, 81)).toEqual({ tx: 4, ty: 2 });
      // Just east → tile (4, 1) (W vertex side)
      expect(isoToTile(65, 80)).toEqual({ tx: 4, ty: 1 });
      // Just west → tile (3, 2) (E vertex side)
      expect(isoToTile(63, 80)).toEqual({ tx: 3, ty: 2 });
    });

    it('isoToTileContinuous returns float pair matching the round of isoToTile', () => {
      const iso = tileCenterToIso(7, 3);
      const cont = isoToTileContinuous(iso.wx, iso.wy);
      expect(cont.tx).toBeCloseTo(7);
      expect(cont.ty).toBeCloseTo(3);
    });
  });

  describe('isoWorldBounds', () => {
    it('matches tile center extremes', () => {
      const bounds = isoWorldBounds(GRID_WIDTH, GRID_HEIGHT);
      expect(bounds.minX).toBe(-(GRID_HEIGHT - 1) * (ISO_TILE_W / 2));
      expect(bounds.maxX).toBe((GRID_WIDTH - 1) * (ISO_TILE_W / 2));
      expect(bounds.minY).toBe(0);
      expect(bounds.maxY).toBe((GRID_WIDTH - 1 + GRID_HEIGHT - 1) * (ISO_TILE_H / 2));
    });
  });

  describe('isoWorldCenter', () => {
    it('matches tile (GW/2, GH/2) iso center', () => {
      const center = isoWorldCenter();
      const expected = tileCenterToIso(GRID_WIDTH / 2, GRID_HEIGHT / 2);
      expect(center).toEqual(expected);
    });

    it('respects custom grid dimensions', () => {
      const center = isoWorldCenter(10, 10);
      expect(center).toEqual(tileCenterToIso(5, 5));
    });
  });

  describe('isoVisibleTileRange', () => {
    it('returns a range covering the iso center tile', () => {
      const center = isoWorldCenter();
      const range = isoVisibleTileRange({
        centerX: center.wx,
        centerY: center.wy,
        halfWidth: 320,
        halfHeight: 240,
      });
      const centerTx = GRID_WIDTH / 2;
      const centerTy = GRID_HEIGHT / 2;
      expect(range.x0).toBeLessThanOrEqual(centerTx);
      expect(range.x1).toBeGreaterThanOrEqual(centerTx);
      expect(range.y0).toBeLessThanOrEqual(centerTy);
      expect(range.y1).toBeGreaterThanOrEqual(centerTy);
    });

    it('clamps to grid bounds when viewport is at corner (0,0)', () => {
      const corner = tileCenterToIso(0, 0);
      const range = isoVisibleTileRange({
        centerX: corner.wx,
        centerY: corner.wy,
        halfWidth: 100,
        halfHeight: 100,
      });
      expect(range.x0).toBe(0);
      expect(range.y0).toBe(0);
    });

    it('honors padding', () => {
      const center = isoWorldCenter();
      const tight = isoVisibleTileRange(
        { centerX: center.wx, centerY: center.wy, halfWidth: 32, halfHeight: 16 },
        0,
      );
      const padded = isoVisibleTileRange(
        { centerX: center.wx, centerY: center.wy, halfWidth: 32, halfHeight: 16 },
        5,
      );
      expect(padded.x1 - padded.x0).toBeGreaterThan(tight.x1 - tight.x0);
      expect(padded.y1 - padded.y0).toBeGreaterThan(tight.y1 - tight.y0);
    });

    it('grows linearly with viewport size', () => {
      const center = isoWorldCenter();
      const small = isoVisibleTileRange({
        centerX: center.wx,
        centerY: center.wy,
        halfWidth: 100,
        halfHeight: 100,
      });
      const large = isoVisibleTileRange({
        centerX: center.wx,
        centerY: center.wy,
        halfWidth: 400,
        halfHeight: 400,
      });
      expect(large.x1 - large.x0).toBeGreaterThan(small.x1 - small.x0);
      expect(large.y1 - large.y0).toBeGreaterThan(small.y1 - small.y0);
    });
  });

  describe('integration: arbitrary iso world point picks SOME on-grid tile', () => {
    it('a lattice of iso world points all map to (tx, ty) inside their diamond', () => {
      // Walk a coarse iso lattice and verify the picked tile's diamond contains
      // the point. The diamond constraint is |dx|/(W/2) + |dy|/(H/2) ≤ 1.
      for (let wx = -200; wx <= 200; wx += 13) {
        for (let wy = 0; wy <= 200; wy += 11) {
          const { tx, ty } = isoToTile(wx, wy);
          if (tx < 0 || ty < 0 || tx >= GRID_WIDTH || ty >= GRID_HEIGHT) continue;
          const c = tileCenterToIso(tx, ty);
          const norm = Math.abs(wx - c.wx) / (ISO_TILE_W / 2) + Math.abs(wy - c.wy) / (ISO_TILE_H / 2);
          // Allow a tiny epsilon for boundary points (round picks one of the
          // adjacent tiles at a 4-way corner)
          expect(norm).toBeLessThanOrEqual(1.0001);
        }
      }
    });
  });
});
