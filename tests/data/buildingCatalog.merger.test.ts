import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import {
  MERGER_BASIC_BUILDING_TYPE_ID,
  getBuildingType,
  isBeltTypeId,
  validateCatalog,
} from '@/game/data/buildingCatalog';
import { Direction, PortKind, TileType } from '@/game/types';

function makeEngine() {
  const engine = new GameEngine(800, 600);
  engine.grid.fill(TileType.Ground);
  return engine;
}

describe('merger_basic catalog entry', () => {
  it('passes catalog validation', () => {
    // validateCatalog throws on duplicate port ids or out-of-footprint offsets.
    expect(() => validateCatalog()).not.toThrow();
  });

  it('exists in the catalog with the correct id', () => {
    expect(getBuildingType(MERGER_BASIC_BUILDING_TYPE_ID)).toBeDefined();
  });

  it('has a 1×1 footprint', () => {
    const type = getBuildingType(MERGER_BASIC_BUILDING_TYPE_ID)!;
    expect(type.footprint).toEqual({ w: 1, h: 1 });
  });

  it('has exactly 3 Input ports and 1 Output port', () => {
    const type = getBuildingType(MERGER_BASIC_BUILDING_TYPE_ID)!;
    const inputs = type.ports.filter((p) => p.kind === PortKind.Input);
    const outputs = type.ports.filter((p) => p.kind === PortKind.Output);
    expect(inputs).toHaveLength(3);
    expect(outputs).toHaveLength(1);
  });

  it('has no duplicate port ids', () => {
    const type = getBuildingType(MERGER_BASIC_BUILDING_TYPE_ID)!;
    const ids = type.ports.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is not treated as a belt type', () => {
    expect(isBeltTypeId(MERGER_BASIC_BUILDING_TYPE_ID)).toBe(false);
  });
});

describe('merger_basic placement and connections', () => {
  it('can be placed on ground tiles', () => {
    const engine = makeEngine();
    const id = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 5, y: 5 });
    expect(id).not.toBeNull();
  });

  it('rejects a second belt into an already-connected input port', () => {
    const engine = makeEngine();
    const mergerId = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 5, y: 5 })!;

    const source1 = engine.placeBuilding('placeholder_node_1x1', { x: 0, y: 5 })!;
    const source2 = engine.placeBuilding('placeholder_node_1x1', { x: 0, y: 8 })!;

    // First belt into in_west succeeds.
    const belt1 = engine.placeBelt(
      { building: source1, port: 'out_east' },
      { building: mergerId, port: 'in_west' },
    );
    expect(belt1.ok).toBe(true);

    // Second placeBelt targeting the same in_west port must fail.
    const belt2 = engine.placeBelt(
      { building: source2, port: 'out_east' },
      { building: mergerId, port: 'in_west' },
    );
    expect(belt2.ok).toBe(false);
    expect((belt2 as { ok: false; reason: string }).reason).toBe('target_port_taken');
  });

  it('allows belts into each of the 3 distinct input ports independently', () => {
    const engine = makeEngine();
    const mergerId = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 3, y: 3 })!;
    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 3 })!;

    // Connect west input.
    const node1 = engine.placeBuilding('placeholder_node_1x1', { x: 0, y: 3 })!;
    const belt1 = engine.placeBelt(
      { building: node1, port: 'out_east' },
      { building: mergerId, port: 'in_west' },
    );
    expect(belt1.ok).toBe(true);

    // Connect north input (belt from the north side, e.g. node at (3,0)).
    const node2 = engine.placeBuilding('placeholder_node_1x1', { x: 0, y: 1 })!;
    const belt2 = engine.placeBelt(
      { building: node2, port: 'out_east' },
      { building: mergerId, port: 'in_north' },
    );
    expect(belt2.ok).toBe(true);

    // Output belt.
    const outBelt = engine.placeBelt(
      { building: mergerId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    expect(outBelt.ok).toBe(true);
  });

  it('accepts all 3 inputs regardless of connection order', () => {
    const engine = makeEngine();
    const mergerId = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 10, y: 10 })!;

    const westSource = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 10 })!;
    const northSource = engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 5 }, Direction.East)!;
    const southSource = engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 14 }, Direction.West)!;

    const north = engine.placeBelt(
      { building: northSource, port: 'out_east' },
      { building: mergerId, port: 'in_north' },
    );
    const south = engine.placeBelt(
      { building: southSource, port: 'out_east' },
      { building: mergerId, port: 'in_south' },
    );
    const west = engine.placeBelt(
      { building: westSource, port: 'out_east' },
      { building: mergerId, port: 'in_west' },
    );

    expect(north.ok).toBe(true);
    expect(south.ok).toBe(true);
    expect(west.ok).toBe(true);
  });
});
