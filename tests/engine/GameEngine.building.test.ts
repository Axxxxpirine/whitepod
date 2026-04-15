import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { TileType } from '@/game/types';

function groundEverywhere(engine: GameEngine) {
  engine.grid.fill(TileType.Ground);
}

describe('GameEngine building placement', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine(800, 600);
    groundEverywhere(engine);
  });

  it('places a 1x1 on Ground', () => {
    const id = engine.placeBuilding('placeholder_1x1', { x: 3, y: 3 });
    expect(id).not.toBeNull();
    expect(engine.getBuildingAt(3, 3)?.id).toBe(id);
  });

  it('canPlaceBuilding returns unknown_type for missing catalog entry', () => {
    const r = engine.canPlaceBuilding('nonexistent', { x: 0, y: 0 });
    expect(r).toEqual({ ok: false, reason: 'unknown_type' });
  });

  it('refuses out_of_bounds for 3x3 at (498,498)', () => {
    const r = engine.canPlaceBuilding('placeholder_3x3', { x: 498, y: 498 });
    expect(r).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect(engine.placeBuilding('placeholder_3x3', { x: 498, y: 498 })).toBeNull();
  });

  it('refuses tile_type_invalid on Water tile', () => {
    engine.grid.setType(10, 10, TileType.Water);
    const r = engine.canPlaceBuilding('placeholder_1x1', { x: 10, y: 10 });
    expect(r).toEqual({ ok: false, reason: 'tile_type_invalid' });
  });

  it('failed 3x3 placement (water in the middle) leaves zero footprint tiles occupied', () => {
    engine.grid.setType(5, 5, TileType.Water);
    const id = engine.placeBuilding('placeholder_3x3', { x: 4, y: 4 });
    expect(id).toBeNull();
    for (let y = 4; y <= 6; y++) {
      for (let x = 4; x <= 6; x++) {
        expect(engine.getBuildingAt(x, y)).toBeNull();
      }
    }
    expect(engine.getBuildings().size).toBe(0);
  });

  it('refuses tile_occupied and does not mutate', () => {
    const id1 = engine.placeBuilding('placeholder_3x3', { x: 0, y: 0 })!;
    const result = engine.canPlaceBuilding('placeholder_1x1', { x: 1, y: 1 });
    expect(result).toEqual({ ok: false, reason: 'tile_occupied' });
    expect(engine.placeBuilding('placeholder_1x1', { x: 1, y: 1 })).toBeNull();
    expect(engine.getBuildings().size).toBe(1);
    expect(engine.getBuildingAt(1, 1)?.id).toBe(id1);
  });

  it('getBuildingAt returns the same building for every tile of a 3x3', () => {
    const id = engine.placeBuilding('placeholder_3x3', { x: 20, y: 20 })!;
    for (let y = 20; y <= 22; y++) {
      for (let x = 20; x <= 22; x++) {
        expect(engine.getBuildingAt(x, y)?.id).toBe(id);
      }
    }
  });

  it('removeBuilding frees tiles and returns true; second remove returns false', () => {
    const id = engine.placeBuilding('placeholder_3x3', { x: 30, y: 30 })!;
    expect(engine.removeBuilding(id)).toBe(true);
    expect(engine.getBuildingAt(31, 31)).toBeNull();
    expect(engine.removeBuilding(id)).toBe(false);
  });

  it('removeBuilding returns false for unknown id', () => {
    expect(engine.removeBuilding(42)).toBe(false);
  });

  it('IDs strictly increasing across remove + re-place', () => {
    const id1 = engine.placeBuilding('placeholder_1x1', { x: 0, y: 0 })!;
    engine.removeBuilding(id1);
    const id2 = engine.placeBuilding('placeholder_1x1', { x: 0, y: 0 })!;
    expect(id2).toBeGreaterThan(id1);
  });

  it('catalog validation runs on construction (does not throw for valid catalog)', () => {
    expect(() => new GameEngine(800, 600)).not.toThrow();
  });
});
