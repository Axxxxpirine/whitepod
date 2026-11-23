import { describe, it, expect } from 'vitest';
import { BuildingRegistry } from '@/game/data/BuildingRegistry';
import { Direction, type Footprint } from '@/game/types';

const FP_1x1: Footprint = { w: 1, h: 1 };
const FP_3x3: Footprint = { w: 3, h: 3 };

describe('BuildingRegistry', () => {
  it('registers a 1x1 and retrieves it', () => {
    const reg = new BuildingRegistry();
    const id = reg.register(
      { typeId: 'placeholder_1x1', origin: { x: 5, y: 5 }, rotation: Direction.North },
      FP_1x1,
    );
    expect(id).not.toBeNull();
    expect(reg.getAt(5, 5)?.id).toBe(id);
  });

  it('getAt returns the same building for every tile of a 3x3 footprint', () => {
    const reg = new BuildingRegistry();
    const id = reg.register(
      { typeId: 'placeholder_3x3', origin: { x: 10, y: 10 }, rotation: Direction.North },
      FP_3x3,
    );
    for (let y = 10; y <= 12; y++) {
      for (let x = 10; x <= 12; x++) {
        expect(reg.getAt(x, y)?.id).toBe(id);
      }
    }
    expect(reg.getAt(9, 10)).toBeNull();
    expect(reg.getAt(13, 12)).toBeNull();
  });

  it('refuses overlapping placement and does not mutate state', () => {
    const reg = new BuildingRegistry();
    const id1 = reg.register(
      { typeId: 'placeholder_3x3', origin: { x: 0, y: 0 }, rotation: Direction.North },
      FP_3x3,
    );
    expect(id1).not.toBeNull();
    const id2 = reg.register(
      { typeId: 'placeholder_1x1', origin: { x: 2, y: 2 }, rotation: Direction.North },
      FP_1x1,
    );
    expect(id2).toBeNull();
    expect(reg.getAll().size).toBe(1);
    expect(reg.getAt(2, 2)?.id).toBe(id1);
  });

  it('refuses out-of-bounds footprint and does not mutate', () => {
    const reg = new BuildingRegistry();
    const id = reg.register(
      { typeId: 'placeholder_3x3', origin: { x: 498, y: 498 }, rotation: Direction.North },
      FP_3x3,
    );
    expect(id).toBeNull();
    expect(reg.getAll().size).toBe(0);
    expect(reg.getAt(498, 498)).toBeNull();
  });

  it('unregisters and frees all footprint tiles', () => {
    const reg = new BuildingRegistry();
    const id = reg.register(
      { typeId: 'placeholder_3x3', origin: { x: 10, y: 10 }, rotation: Direction.North },
      FP_3x3,
    )!;
    expect(reg.unregister(id, FP_3x3)).toBe(true);
    for (let y = 10; y <= 12; y++) {
      for (let x = 10; x <= 12; x++) {
        expect(reg.getAt(x, y)).toBeNull();
      }
    }
    expect(reg.getAll().size).toBe(0);
  });

  it('unregister returns false for unknown id', () => {
    const reg = new BuildingRegistry();
    expect(reg.unregister(999, FP_1x1)).toBe(false);
  });

  it('IDs are strictly increasing across register/unregister cycles', () => {
    const reg = new BuildingRegistry();
    const id1 = reg.register(
      { typeId: 'placeholder_1x1', origin: { x: 0, y: 0 }, rotation: Direction.North },
      FP_1x1,
    )!;
    reg.unregister(id1, FP_1x1);
    const id2 = reg.register(
      { typeId: 'placeholder_1x1', origin: { x: 0, y: 0 }, rotation: Direction.North },
      FP_1x1,
    )!;
    expect(id2).toBeGreaterThan(id1);
  });

  it('reuses freed ids once every id has been handed out, instead of refusing forever', () => {
    // A long game: every id used once, almost nothing left standing (saved as nextId past the max).
    const reg = BuildingRegistry.deserialize(
      {
        version: 1,
        nextId: 65536,
        buildings: [{ id: 1, typeId: 'placeholder_1x1', origin: { x: 5, y: 5 }, rotation: Direction.North }],
      },
      () => FP_1x1,
    );
    expect(reg.hasIdCapacity()).toBe(true);
    const id = reg.register(
      { typeId: 'placeholder_1x1', origin: { x: 0, y: 0 }, rotation: Direction.North },
      FP_1x1,
    );
    // Id 1 still stands: the count wraps past it.
    expect(id).toBe(2);
    expect(reg.getAt(0, 0)?.id).toBe(2);
    expect(reg.getAt(5, 5)?.id).toBe(1);
    expect(reg.serialize().nextId).toBe(3);
  });

  it('refuses a building only when every id stands on the map at once', () => {
    const reg = new BuildingRegistry();
    for (let i = 0; i < 65535; i++) {
      expect(
        reg.register({ typeId: 'placeholder_1x1', origin: { x: i % 256, y: Math.floor(i / 256) }, rotation: Direction.North }, FP_1x1),
      ).not.toBeNull();
    }
    expect(reg.hasIdCapacity()).toBe(false);
    expect(
      reg.register({ typeId: 'placeholder_1x1', origin: { x: 255, y: 255 }, rotation: Direction.North }, FP_1x1),
    ).toBeNull();

    reg.unregister(40000, FP_1x1);
    expect(reg.hasIdCapacity()).toBe(true);
    expect(
      reg.register({ typeId: 'placeholder_1x1', origin: { x: 255, y: 255 }, rotation: Direction.North }, FP_1x1),
    ).toBe(40000);
  });

  it('serialize/deserialize roundtrip restores occupancy and instances', () => {
    const reg = new BuildingRegistry();
    const id1 = reg.register(
      { typeId: 'placeholder_3x3', origin: { x: 5, y: 5 }, rotation: Direction.North },
      FP_3x3,
    )!;
    const id2 = reg.register(
      { typeId: 'placeholder_1x1', origin: { x: 20, y: 20 }, rotation: Direction.East },
      FP_1x1,
    )!;
    const data = reg.serialize();
    const footprintOf = (typeId: string) =>
      typeId === 'placeholder_3x3' ? FP_3x3 : typeId === 'placeholder_1x1' ? FP_1x1 : undefined;
    const restored = BuildingRegistry.deserialize(data, footprintOf);
    expect(restored.getAt(5, 5)?.id).toBe(id1);
    expect(restored.getAt(7, 7)?.id).toBe(id1);
    expect(restored.getAt(20, 20)?.id).toBe(id2);
    expect(restored.getAll().size).toBe(2);
  });

  it('deserialize throws on unknown version', () => {
    const reg = new BuildingRegistry();
    const data = { ...reg.serialize(), version: 999 };
    expect(() => BuildingRegistry.deserialize(data, () => FP_1x1)).toThrow(/version/);
  });

  it('deserialize throws on unknown typeId', () => {
    const reg = new BuildingRegistry();
    reg.register(
      { typeId: 'mystery', origin: { x: 0, y: 0 }, rotation: Direction.North },
      FP_1x1,
    );
    const data = reg.serialize();
    expect(() => BuildingRegistry.deserialize(data, () => undefined)).toThrow(/typeId/);
  });
});
