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

  it('hasIdCapacity flips false at overflow threshold', () => {
    const reg = new BuildingRegistry();
    // cheat: simulate a near-full registry via serialize roundtrip path
    const data = reg.serialize();
    const inflated = { ...data, nextId: 65536 };
    const reg2 = BuildingRegistry.deserialize(inflated, () => FP_1x1);
    expect(reg2.hasIdCapacity()).toBe(false);
    const id = reg2.register(
      { typeId: 'placeholder_1x1', origin: { x: 0, y: 0 }, rotation: Direction.North },
      FP_1x1,
    );
    expect(id).toBeNull();
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
