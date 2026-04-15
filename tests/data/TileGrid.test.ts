import { describe, it, expect } from 'vitest';
import { TileGrid } from '@/game/data/TileGrid';
import { ResourceType, TileType } from '@/game/types';
import { GRID_SIZE, GRID_WIDTH, RESOURCE_DEPOSIT_AMOUNT } from '@/game/constants';

describe('TileGrid', () => {
  it('initializes with all Empty tiles', () => {
    const grid = new TileGrid();
    expect(grid.tileType.every((v) => v === TileType.Empty)).toBe(true);
  });

  it('getType / setType round-trips', () => {
    const grid = new TileGrid();
    grid.setType(10, 20, TileType.Ground);
    expect(grid.getType(10, 20)).toBe(TileType.Ground);
  });

  it('setType ignores out-of-bounds coords', () => {
    const grid = new TileGrid();
    grid.setType(-1, 0, TileType.Ground);
    grid.setType(0, -1, TileType.Ground);
    grid.setType(GRID_WIDTH, 0, TileType.Ground);
    expect(grid.tileType.every((v) => v === TileType.Empty)).toBe(true);
  });

  it('fill sets all tiles to the given type', () => {
    const grid = new TileGrid();
    grid.fill(TileType.Ground);
    expect(grid.tileType.every((v) => v === TileType.Ground)).toBe(true);
  });

  it('fillRect fills the correct region only', () => {
    const grid = new TileGrid();
    grid.fillRect(0, 0, 3, 2, TileType.Rock);
    expect(grid.getType(0, 0)).toBe(TileType.Rock);
    expect(grid.getType(2, 1)).toBe(TileType.Rock);
    expect(grid.getType(3, 0)).toBe(TileType.Empty);
    expect(grid.getType(0, 2)).toBe(TileType.Empty);
  });

  describe('dirty tracking', () => {
    it('starts with no dirty region', () => {
      const grid = new TileGrid();
      expect(grid.getDirtyRegion()).toBeNull();
    });

    it('marks dirty on setType', () => {
      const grid = new TileGrid();
      grid.setType(5, 5, TileType.Ground);
      const dirty = grid.getDirtyRegion();
      expect(dirty).not.toBeNull();
      expect(dirty!.x0).toBe(5);
      expect(dirty!.y0).toBe(5);
      expect(dirty!.x1).toBe(5);
      expect(dirty!.y1).toBe(5);
    });

    it('expands dirty region to encompass multiple writes', () => {
      const grid = new TileGrid();
      grid.setType(5, 5, TileType.Ground);
      grid.setType(10, 3, TileType.Rock);
      const dirty = grid.getDirtyRegion();
      expect(dirty!.x0).toBe(5);
      expect(dirty!.y0).toBe(3);
      expect(dirty!.x1).toBe(10);
      expect(dirty!.y1).toBe(5);
    });

    it('clears after clearDirty()', () => {
      const grid = new TileGrid();
      grid.setType(5, 5, TileType.Ground);
      grid.clearDirty();
      expect(grid.getDirtyRegion()).toBeNull();
    });
  });

  describe('serialization', () => {
    it('produces a buffer of the correct size', () => {
      const grid = new TileGrid();
      expect(grid.serialize().byteLength).toBe(GRID_SIZE * 6);
    });

    it('round-trips data via serialize / deserialize', () => {
      const grid = new TileGrid();
      grid.fill(TileType.Ground);
      grid.setType(0, 0, TileType.Water);
      grid.setResource(1, 0, ResourceType.Coal);
      grid.elevation[0] = 42;
      grid.flags[100] = 7;

      const restored = TileGrid.deserialize(grid.serialize());

      expect(restored.getType(0, 0)).toBe(TileType.Water);
      expect(restored.getType(1, 0)).toBe(TileType.Ground);
      expect(restored.getResource(1, 0)).toBe(ResourceType.Coal);
      expect(restored.elevation[0]).toBe(42);
      expect(restored.flags[100]).toBe(7);
    });

    it('normalizes restored resource amounts for existing deposits', () => {
      const grid = new TileGrid();
      grid.fill(TileType.Ground);
      grid.setResource(1, 0, ResourceType.Coal);
      grid.resourceAmount[1] = 0;

      const restored = TileGrid.deserialize(grid.serialize());

      expect(restored.getResource(1, 0)).toBe(ResourceType.Coal);
      expect(restored.getResourceAmount(1, 0)).toBe(RESOURCE_DEPOSIT_AMOUNT);
    });
  });
});
