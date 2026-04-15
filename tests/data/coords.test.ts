import { describe, it, expect } from 'vitest';
import {
  toIndex,
  toCoord,
  isInBounds,
  getNeighbor,
  getNeighbors4,
  getNeighbors8,
  iterateRect,
} from '@/game/data/coords';
import { GRID_WIDTH, GRID_HEIGHT } from '@/game/constants';
import { Direction } from '@/game/types';

describe('coords', () => {
  describe('toIndex / toCoord', () => {
    it('converts (0,0) to index 0', () => {
      expect(toIndex(0, 0)).toBe(0);
    });

    it('converts (1,0) to index 1', () => {
      expect(toIndex(1, 0)).toBe(1);
    });

    it('converts (0,1) to index GRID_WIDTH', () => {
      expect(toIndex(0, 1)).toBe(GRID_WIDTH);
    });

    it('round-trips for various positions', () => {
      const positions = [
        { x: 0, y: 0 },
        { x: 42, y: 13 },
        { x: GRID_WIDTH - 1, y: GRID_HEIGHT - 1 },
        { x: 0, y: GRID_HEIGHT - 1 },
        { x: GRID_WIDTH - 1, y: 0 },
      ];
      for (const { x, y } of positions) {
        expect(toCoord(toIndex(x, y))).toEqual({ x, y });
      }
    });
  });

  describe('isInBounds', () => {
    it('returns true for center tile', () => {
      expect(isInBounds(Math.floor(GRID_WIDTH / 2), Math.floor(GRID_HEIGHT / 2))).toBe(true);
    });

    it('returns true for all corners', () => {
      expect(isInBounds(0, 0)).toBe(true);
      expect(isInBounds(GRID_WIDTH - 1, 0)).toBe(true);
      expect(isInBounds(0, GRID_HEIGHT - 1)).toBe(true);
      expect(isInBounds(GRID_WIDTH - 1, GRID_HEIGHT - 1)).toBe(true);
    });

    it('returns false for negative coords', () => {
      expect(isInBounds(-1, 0)).toBe(false);
      expect(isInBounds(0, -1)).toBe(false);
    });

    it('returns false past grid edges', () => {
      expect(isInBounds(GRID_WIDTH, 0)).toBe(false);
      expect(isInBounds(0, GRID_HEIGHT)).toBe(false);
    });
  });

  describe('getNeighbor', () => {
    it('returns north neighbor index', () => {
      expect(getNeighbor(5, 5, Direction.North)).toBe(toIndex(5, 4));
    });

    it('returns east neighbor index', () => {
      expect(getNeighbor(5, 5, Direction.East)).toBe(toIndex(6, 5));
    });

    it('returns south neighbor index', () => {
      expect(getNeighbor(5, 5, Direction.South)).toBe(toIndex(5, 6));
    });

    it('returns west neighbor index', () => {
      expect(getNeighbor(5, 5, Direction.West)).toBe(toIndex(4, 5));
    });

    it('returns -1 for north at top row', () => {
      expect(getNeighbor(5, 0, Direction.North)).toBe(-1);
    });

    it('returns -1 for west at left column', () => {
      expect(getNeighbor(0, 5, Direction.West)).toBe(-1);
    });

    it('returns -1 for south at bottom row', () => {
      expect(getNeighbor(5, GRID_HEIGHT - 1, Direction.South)).toBe(-1);
    });

    it('returns -1 for east at right column', () => {
      expect(getNeighbor(GRID_WIDTH - 1, 5, Direction.East)).toBe(-1);
    });
  });

  describe('getNeighbors4', () => {
    it('returns 4 neighbors for interior tile', () => {
      expect(getNeighbors4(5, 5)).toHaveLength(4);
    });

    it('returns 2 neighbors for corner tile', () => {
      expect(getNeighbors4(0, 0)).toHaveLength(2);
    });

    it('returns 3 neighbors for edge tile', () => {
      expect(getNeighbors4(0, 5)).toHaveLength(3);
    });
  });

  describe('getNeighbors8', () => {
    it('returns 8 neighbors for interior tile', () => {
      expect(getNeighbors8(5, 5)).toHaveLength(8);
    });

    it('returns 3 neighbors for corner tile', () => {
      expect(getNeighbors8(0, 0)).toHaveLength(3);
    });

    it('returns 5 neighbors for edge tile', () => {
      expect(getNeighbors8(0, 5)).toHaveLength(5);
    });
  });

  describe('iterateRect', () => {
    it('yields correct count for a 3x2 rect', () => {
      const indices = [...iterateRect(0, 0, 2, 1)];
      expect(indices).toHaveLength(6);
    });

    it('yields indices in row-major order', () => {
      const indices = [...iterateRect(0, 0, 1, 0)];
      expect(indices).toEqual([toIndex(0, 0), toIndex(1, 0)]);
    });

    it('clamps to grid bounds (negative start)', () => {
      const indices = [...iterateRect(-1, -1, 1, 1)];
      // Clamped to (0,0)-(1,1) = 4 tiles
      expect(indices).toHaveLength(4);
    });

    it('clamps to grid bounds (past end)', () => {
      const indices = [...iterateRect(GRID_WIDTH - 2, GRID_HEIGHT - 2, GRID_WIDTH + 5, GRID_HEIGHT + 5)];
      expect(indices).toHaveLength(4); // 2x2 corner
    });
  });
});
