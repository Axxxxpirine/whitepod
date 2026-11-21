import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { planBelt } from '@/game/engine/BeltRouter';
import { toIndex } from '@/game/data/coords';
import { Direction, TileType, type BeltPlan } from '@/game/types';
import {
  BELT_CORNER_CCW_BUILDING_TYPE_ID,
  BELT_CORNER_CW_BUILDING_TYPE_ID,
  BELT_STRAIGHT_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';

function groundEverywhere(engine: GameEngine) {
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
}

// Pair of 1x1 node placeholders. Each has out_east (East) and in_west (West).
// A at `ax`, B at `bx`, same y. They are NOT placed adjacent (gap is filled by
// the path the router builds).
function placeEndpoints(engine: GameEngine, ax: number, bx: number, y: number) {
  const a = engine.placeBuilding('placeholder_node_1x1', { x: ax, y })!;
  const b = engine.placeBuilding('placeholder_node_1x1', { x: bx, y })!;
  return { a, b };
}

function okPlan(result: ReturnType<typeof planBelt>): BeltPlan {
  if (!result.ok) throw new Error(`expected ok, got ${result.reason}`);
  return result.plan;
}

describe('BeltRouter', () => {
  let engine: GameEngine;
  const cornerTypeIds: readonly string[] = [
    BELT_CORNER_CW_BUILDING_TYPE_ID,
    BELT_CORNER_CCW_BUILDING_TYPE_ID,
  ];

  beforeEach(() => {
    engine = new GameEngine(800, 600);
    groundEverywhere(engine);
  });

  it('1. plans a straight horizontal path', () => {
    // A at (5,5) out_east → enterTile = (6,5).
    // B at (10,5) in_west → exitTile  = (9,5).
    // 4 straight segments at (6,5), (7,5), (8,5), (9,5).
    const { a, b } = placeEndpoints(engine, 5, 10, 5);
    const plan = okPlan(
      planBelt(engine, { building: a, port: 'out_east' }, { building: b, port: 'in_west' }),
    );
    expect(plan.segments).toHaveLength(4);
    for (const seg of plan.segments) {
      expect(seg.typeId).toBe(BELT_STRAIGHT_BUILDING_TYPE_ID);
      expect(seg.rotation).toBe(Direction.North); // flow East → rotation N
    }
    expect(plan.segments.map((s) => s.coord)).toEqual([
      { x: 6, y: 5 },
      { x: 7, y: 5 },
      { x: 8, y: 5 },
      { x: 9, y: 5 },
    ]);
    // Connections: from→seg0, seg0→seg1, seg1→seg2, seg2→seg3, seg3→to
    expect(plan.connections).toHaveLength(5);
  });

  it('2. plans a path with one corner', () => {
    // A at (5,5) out_east → enterTile (6,5).
    // C at (10,10) with placeholder_node_3x3 in_north (offset (1,0), side=North)
    //   → inPortTile = (11,10), exitTile = (11, 9).
    // Path must go east then south with at least one corner.
    const a = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 })!;
    const c = engine.placeBuilding('placeholder_node_3x3', { x: 10, y: 10 })!;
    const plan = okPlan(
      planBelt(
        engine,
        { building: a, port: 'out_east' },
        { building: c, port: 'in_north' },
      ),
    );
    // Shortest path: 5 east then 4 south = 9 tiles minimum.
    expect(plan.segments.length).toBeGreaterThanOrEqual(9);
    // At least one CW corner (east-flow turning south is CW).
    const corners = plan.segments.filter(
      (s) => s.typeId === BELT_CORNER_CW_BUILDING_TYPE_ID,
    );
    expect(corners.length).toBe(1);
    // Remaining should be straights.
    const straights = plan.segments.filter(
      (s) => s.typeId === BELT_STRAIGHT_BUILDING_TYPE_ID,
    );
    expect(straights.length).toBe(plan.segments.length - 1);
  });

  it('3. zigzags around an obstacle', () => {
    // A at (5,5), B at (10,5). Block the direct row with a building at (7,5).
    const { a, b } = placeEndpoints(engine, 5, 10, 5);
    engine.placeBuilding('placeholder_1x1', { x: 7, y: 5 });
    const plan = okPlan(
      planBelt(engine, { building: a, port: 'out_east' }, { building: b, port: 'in_west' }),
    );
    // Detour adds tiles + needs at least 2 corners.
    const corners = plan.segments.filter((s) => cornerTypeIds.includes(s.typeId));
    expect(corners.length).toBeGreaterThanOrEqual(2);
    // No segment lands on the obstacle.
    expect(plan.segments.find((s) => s.coord.x === 7 && s.coord.y === 5)).toBeUndefined();
  });

  it('4. returns no_path when the target is walled off', () => {
    const { a, b } = placeEndpoints(engine, 5, 10, 5);
    // Wall B in: placing 4 blockers around B's west-entry tile (9,5).
    engine.placeBuilding('placeholder_1x1', { x: 9, y: 4 });
    engine.placeBuilding('placeholder_1x1', { x: 9, y: 6 });
    engine.placeBuilding('placeholder_1x1', { x: 8, y: 5 });
    // (9,5) itself is the exit — also block access by surrounding it.
    // Actually (9,5) IS the exit tile and must remain free; we block its
    // 3 neighbors except toward B, so no path can enter it except from B
    // side — which is blocked since that's inside B.
    const result = planBelt(
      engine,
      { building: a, port: 'out_east' },
      { building: b, port: 'in_west' },
    );
    expect(result).toEqual({ ok: false, reason: 'no_path' });
  });

  it('5. avoids tiles occupied by buildings (storage in the way)', () => {
    const { a, b } = placeEndpoints(engine, 5, 15, 5);
    // Place a 3x3 building spanning (8..10, 4..6). Direct row (y=5) blocked.
    engine.placeBuilding('placeholder_3x3', { x: 8, y: 4 });
    const plan = okPlan(
      planBelt(engine, { building: a, port: 'out_east' }, { building: b, port: 'in_west' }),
    );
    // None of the path tiles may lie inside the 3x3 footprint.
    for (const seg of plan.segments) {
      const { x, y } = seg.coord;
      expect(!(x >= 8 && x <= 10 && y >= 4 && y <= 6)).toBe(true);
    }
  });

  it('6. refuses to traverse Rock or Water tiles', () => {
    const { a, b } = placeEndpoints(engine, 5, 10, 5);
    // Put Rock in the middle of the direct row — leave the entry and exit
    // tiles (6,5) and (9,5) as Ground so the router can still detour.
    engine.grid.setType(7, 5, TileType.Rock);
    engine.grid.setType(8, 5, TileType.Rock);
    const plan = okPlan(
      planBelt(engine, { building: a, port: 'out_east' }, { building: b, port: 'in_west' }),
    );
    // Router must route around, never on a Rock tile.
    for (const seg of plan.segments) {
      expect(engine.grid.getType(seg.coord.x, seg.coord.y)).toBe(TileType.Ground);
    }
    // And must have taken a detour (at least 2 corners).
    const corners = plan.segments.filter((s) => cornerTypeIds.includes(s.typeId));
    expect(corners.length).toBeGreaterThanOrEqual(2);
  });

  it('6b. never routes through fogged tiles, where nothing can be built', () => {
    const { a, b } = placeEndpoints(engine, 5, 10, 5);
    engine.grid.flags[toIndex(7, 5)] = 0;
    engine.grid.flags[toIndex(8, 5)] = 0;
    const plan = okPlan(
      planBelt(engine, { building: a, port: 'out_east' }, { building: b, port: 'in_west' }),
    );
    for (const seg of plan.segments) {
      expect(engine.grid.isRevealed(seg.coord.x, seg.coord.y)).toBe(true);
    }
    expect(engine.placeBelt({ building: a, port: 'out_east' }, { building: b, port: 'in_west' }).ok).toBe(true);
  });

  it('7. refuses if the source port is already connected', () => {
    const { a, b } = placeEndpoints(engine, 5, 10, 5);
    // Connect A.out_east to an adjacent partner first.
    const neighbor = engine.placeBuilding('placeholder_node_1x1', { x: 6, y: 5 })!;
    engine.connect(
      { building: a, port: 'out_east' },
      { building: neighbor, port: 'in_west' },
    );
    const result = planBelt(
      engine,
      { building: a, port: 'out_east' },
      { building: b, port: 'in_west' },
    );
    expect(result).toEqual({ ok: false, reason: 'source_port_taken' });
  });

  it('8. refuses if the target port is already connected', () => {
    const { a, b } = placeEndpoints(engine, 5, 10, 5);
    const neighbor = engine.placeBuilding('placeholder_node_1x1', { x: 9, y: 5 })!;
    engine.connect(
      { building: neighbor, port: 'out_east' },
      { building: b, port: 'in_west' },
    );
    const result = planBelt(
      engine,
      { building: a, port: 'out_east' },
      { building: b, port: 'in_west' },
    );
    expect(result).toEqual({ ok: false, reason: 'target_port_taken' });
  });

  it('9. refuses port kind mismatches', () => {
    const { a, b } = placeEndpoints(engine, 5, 10, 5);
    // out → out
    expect(
      planBelt(
        engine,
        { building: a, port: 'out_east' },
        { building: b, port: 'out_east' },
      ),
    ).toEqual({ ok: false, reason: 'port_kind_mismatch' });
    // in → in
    expect(
      planBelt(engine, { building: a, port: 'in_west' }, { building: b, port: 'in_west' }),
    ).toEqual({ ok: false, reason: 'port_kind_mismatch' });
    // in → out (reversed)
    expect(
      planBelt(engine, { building: a, port: 'in_west' }, { building: b, port: 'out_east' }),
    ).toEqual({ ok: false, reason: 'port_kind_mismatch' });
  });

  it('10. refuses self-connection', () => {
    const a = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 })!;
    expect(
      planBelt(
        engine,
        { building: a, port: 'out_east' },
        { building: a, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'self_connection' });
  });

  it('11. is deterministic: two identical calls produce the same segments', () => {
    const { a, b } = placeEndpoints(engine, 5, 15, 5);
    const p1 = okPlan(
      planBelt(engine, { building: a, port: 'out_east' }, { building: b, port: 'in_west' }),
    );
    const p2 = okPlan(
      planBelt(engine, { building: a, port: 'out_east' }, { building: b, port: 'in_west' }),
    );
    expect(p2.segments).toEqual(p1.segments);
    expect(p2.connections).toEqual(p1.connections);
  });

  it('12. segmentation: rotations match port geometry end-to-end', () => {
    // Self-consistency check: for every segment, rebuild its port world-sides
    // from (typeId, rotation), then verify consecutive segments connect
    // face-to-face (out-side of seg_i === opposite of in-side of seg_{i+1},
    // and their tiles are adjacent). Also verify seg_0.in faces the source
    // port and seg_last.out faces the target port.
    const a = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 })!;
    const c = engine.placeBuilding('placeholder_node_3x3', { x: 10, y: 10 })!;
    const plan = okPlan(
      planBelt(
        engine,
        { building: a, port: 'out_east' },
        { building: c, port: 'in_north' },
      ),
    );

    // Ports on a belt type at rotation=North (baseline):
    //   belt_straight → in=W(3), out=E(1)
    //   belt_corner_cw → in=W(3), out=S(2)
    //   belt_corner_ccw → in=W(3), out=N(0)
    const baseSides: Record<string, { in: Direction; out: Direction }> = {
      [BELT_STRAIGHT_BUILDING_TYPE_ID]: { in: Direction.West, out: Direction.East },
      [BELT_CORNER_CW_BUILDING_TYPE_ID]: { in: Direction.West, out: Direction.South },
      [BELT_CORNER_CCW_BUILDING_TYPE_ID]: { in: Direction.West, out: Direction.North },
    };
    function worldSides(seg: BeltPlan['segments'][number]) {
      const b = baseSides[seg.typeId];
      return {
        in: ((b.in + seg.rotation) % 4) as Direction,
        out: ((b.out + seg.rotation) % 4) as Direction,
      };
    }
    const opp = (d: Direction) => ((d + 2) % 4) as Direction;

    // seg_0.in must face the source port: fromSide=East (a.out_east at rotation=N).
    // An output on side E of the source means the flow exits toward the east,
    // and seg_0 sits one tile east of A. seg_0.in.side must be opposite(E)=W.
    const firstSides = worldSides(plan.segments[0]);
    expect(firstSides.in).toBe(Direction.West);

    // seg_last.out must face the target port: toSide=North (c.in_north at rotation=N).
    // The input on side N of the target means the flow enters from the north,
    // and seg_last sits one tile north of C's port. seg_last.out.side must be
    // opposite(N)=S.
    const lastSides = worldSides(plan.segments[plan.segments.length - 1]);
    expect(lastSides.out).toBe(Direction.South);

    // Every consecutive pair: out of i aligns with in of i+1 (opposite sides,
    // tile-adjacent).
    for (let i = 0; i < plan.segments.length - 1; i++) {
      const a = plan.segments[i];
      const b = plan.segments[i + 1];
      const sa = worldSides(a);
      const sb = worldSides(b);
      expect(sa.out).toBe(opp(sb.in));
      // Tile adjacency: b.coord = a.coord + unitVector(sa.out).
      const dx = b.coord.x - a.coord.x;
      const dy = b.coord.y - a.coord.y;
      const expected = [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ][sa.out];
      expect([dx, dy]).toEqual(expected);
    }
  });
});
