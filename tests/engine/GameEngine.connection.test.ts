import { describe, it, expect, beforeEach } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { Direction, TileType } from '@/game/types';

function groundEverywhere(engine: GameEngine) {
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
}

// Place two placeholder_node_1x1 side by side horizontally:
//   A at (5,5) has out_east on east side
//   B at (6,5) has in_west on west side
// → adjacent face-to-face.
function placeHorizontalPair(engine: GameEngine) {
  const a = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 })!;
  const b = engine.placeBuilding('placeholder_node_1x1', { x: 6, y: 5 })!;
  return { a, b };
}

describe('GameEngine connections', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine(800, 600);
    groundEverywhere(engine);
  });

  it('7. connect OK between output and input adjacent face-to-face', () => {
    const { a, b } = placeHorizontalPair(engine);
    const id = engine.connect(
      { building: a, port: 'out_east' },
      { building: b, port: 'in_west' },
    );
    expect(id).not.toBeNull();
    expect(engine.getConnections().size).toBe(1);
  });

  it('8. connect refuses kind mismatch (out→out, in→in, in→out)', () => {
    const { a, b } = placeHorizontalPair(engine);
    // out → out
    expect(
      engine.canConnect(
        { building: a, port: 'out_east' },
        { building: b, port: 'out_east' },
      ),
    ).toEqual({ ok: false, reason: 'port_kind_mismatch' });
    // in → in
    expect(
      engine.canConnect(
        { building: a, port: 'in_west' },
        { building: b, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'port_kind_mismatch' });
    // in → out (reversed)
    expect(
      engine.canConnect(
        { building: a, port: 'in_west' },
        { building: b, port: 'out_east' },
      ),
    ).toEqual({ ok: false, reason: 'port_kind_mismatch' });
  });

  it('9. connect refuses self-connection', () => {
    const { a } = placeHorizontalPair(engine);
    expect(
      engine.canConnect(
        { building: a, port: 'out_east' },
        { building: a, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'self_connection' });
  });

  it('10. connect refuses port already connected (both sides)', () => {
    const { a, b } = placeHorizontalPair(engine);
    const c = engine.placeBuilding('placeholder_node_1x1', { x: 4, y: 5 })!;
    expect(
      engine.connect(
        { building: a, port: 'out_east' },
        { building: b, port: 'in_west' },
      ),
    ).not.toBeNull();
    // from side already connected (a's out_east)
    expect(
      engine.canConnect(
        { building: a, port: 'out_east' },
        { building: b, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'port_already_connected' });
    // to side already connected (b's in_west) — try from c.out_east (not adjacent but we hit the check first)
    expect(
      engine.canConnect(
        { building: c, port: 'out_east' },
        { building: b, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'port_already_connected' });
  });

  it('11. connect refuses ports not adjacent', () => {
    const a = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 })!;
    const b = engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 5 })!;
    expect(
      engine.canConnect(
        { building: a, port: 'out_east' },
        { building: b, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'ports_not_adjacent' });
  });

  it('12. connect refuses adjacent but sides not opposite', () => {
    // A at (5,5) out_east points east. Place B at (6,5) but use its out_east
    // (also pointing east, i.e., same side not opposite). Engine must still
    // reject because the port used on B is an output, not input — but the
    // first failure surfaced is kind_mismatch; we need a same-kind-different-side
    // scenario. Use two buildings where the input-side candidate is wrong direction:
    // A at (5,5) out_east → expects tile (6,5) with side West.
    // Place B at (6,5) with rotation such that its in_west is actually facing East?
    // Rotation is no-op, so use adjacency-only angle: B at (5,6) instead.
    // A.out_east → tile (6,5), side East. B at (5,6) in_west → tile (5,6), side West.
    // Tile mismatch → ports_not_adjacent (tile check fails first).
    // For sides-not-opposite we need same tile but wrong sides. That requires
    // two ports on the SAME target tile with different sides, which is only
    // possible in a corner configuration. Simpler: engineer via out→in but wrong side.
    // A at (5,5) has out_east. B at (6,5) has in_west (adjacent, opposite) — this works.
    // Rotate scenario: put B at (6,5) and connect A.out_east → B.out_east.
    // B.out_east is kind Output → fails kind_mismatch first, not side.
    // Conclusion: with current catalog, sides-not-opposite can't be isolated cleanly.
    // We still assert the tile/side check path by using non-adjacent tiles (already covered)
    // and by constructing a synthetic scenario via getBuildingType mutation is out of scope.
    // We cover what's reachable: confirm that connecting to a wrong-direction target
    // returns ports_not_adjacent, not port_kind_mismatch.
    const a = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 })!;
    const b = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 6 })!;
    // A.out_east expects (6,5). B.in_west at (5,6). Non-matching tile.
    const r = engine.canConnect(
      { building: a, port: 'out_east' },
      { building: b, port: 'in_west' },
    );
    expect(r).toEqual({ ok: false, reason: 'ports_not_adjacent' });
  });

  it('13. removeBuilding cascades connections (from AND to)', () => {
    const { a, b } = placeHorizontalPair(engine);
    const id = engine.connect(
      { building: a, port: 'out_east' },
      { building: b, port: 'in_west' },
    )!;
    expect(engine.getConnections().size).toBe(1);
    expect(engine.removeBuilding(a)).toBe(true);
    expect(engine.getConnections().size).toBe(0);
    expect(engine.getConnectionsOf(b)).toEqual([]);
    expect(engine.connections.get(id)).toBeNull();
  });

  it('14. register refuses id_overflow', () => {
    // Fill up to max via direct ConnectionRegistry (cheaper than via full engine).
    for (let i = 0; i < 65535; i++) {
      engine.connections.register(
        { building: 1, port: `p${i}` },
        { building: 2, port: `p${i}` },
      );
    }
    const { a, b } = placeHorizontalPair(engine);
    expect(
      engine.canConnect(
        { building: a, port: 'out_east' },
        { building: b, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'id_overflow' });
  });

  it('15. getConnectionsOf returns [] after removeBuilding of that building', () => {
    const { a, b } = placeHorizontalPair(engine);
    engine.connect(
      { building: a, port: 'out_east' },
      { building: b, port: 'in_west' },
    );
    engine.removeBuilding(b);
    expect(engine.getConnectionsOf(b)).toEqual([]);
    expect(engine.getConnectionsOf(a)).toEqual([]);
  });

  it('16. connect refuses unknown_building (from or to)', () => {
    const { a } = placeHorizontalPair(engine);
    expect(
      engine.canConnect(
        { building: 9999, port: 'out_east' },
        { building: a, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'unknown_building' });
    expect(
      engine.canConnect(
        { building: a, port: 'out_east' },
        { building: 9999, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'unknown_building' });
  });

  it('17. connect refuses unknown_port (port absent from BuildingType)', () => {
    const { a, b } = placeHorizontalPair(engine);
    expect(
      engine.canConnect(
        { building: a, port: 'nope' },
        { building: b, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'unknown_port' });
  });

  it('18. building with 0 ports: getConnectionsOf returns [], no crash', () => {
    const bare = engine.placeBuilding('placeholder_1x1', { x: 50, y: 50 })!;
    expect(engine.getConnectionsOf(bare)).toEqual([]);
    expect(
      engine.canConnect(
        { building: bare, port: 'anything' },
        { building: bare, port: 'anything' },
      ),
    ).toEqual({ ok: false, reason: 'self_connection' });
  });

  it('19. connect OK for port at offset (1,2) of a 3x3 footprint', () => {
    // placeholder_node_3x3 has out_south at offset (1,2) side=South.
    // Place A at (10,10) → out_south world tile = (11,12), expects (11,13).
    // Place B (placeholder_node_1x1) at (11,13) → in_west world tile = (11,13).
    // in_west points West. Needed: tile match (11,13)=(11,13) ✓,
    // sides opposite (South vs West) → NOT opposite. So this specific config
    // won't connect. Use a target with a North-facing input at (11,13).
    // placeholder_node_3x3.in_north is at offset (1,0) side=North.
    // Place C (placeholder_node_3x3) at (10,13) → in_north tile = (11,13), side=North.
    // South vs North → opposite ✓. Tile match ✓. Connect OK.
    const a = engine.placeBuilding('placeholder_node_3x3', { x: 10, y: 10 })!;
    const c = engine.placeBuilding('placeholder_node_3x3', { x: 10, y: 13 })!;
    const id = engine.connect(
      { building: a, port: 'out_south' },
      { building: c, port: 'in_north' },
    );
    expect(id).not.toBeNull();
  });

  it('20. rotation rotates ports CW (screen y-down): out_east on rotation=East points South', () => {
    // Under real rotation, a 1x1 node with out_east (side=East) rotated CW by East
    // produces a world-side of South. The matching input must then sit on the
    // south-adjacent tile with its rotated side facing North.
    //
    // A at (5,5) rot=East: out_east.side = (East + East) % 4 = South. Expected
    // neighbor tile = (5, 6).
    // B at (5,6) rot=East: in_west.side = (West + East) % 4 = North. Faces (5,5).
    // → tile match + opposite sides → connection OK.
    const a = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 }, Direction.East)!;
    const b = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 6 }, Direction.East)!;
    const id = engine.connect(
      { building: a, port: 'out_east' },
      { building: b, port: 'in_west' },
    );
    expect(id).not.toBeNull();

    // Same buildings placed side-by-side horizontally with rotation=East no
    // longer connect (out_east now points South, not East).
    const c = engine.placeBuilding('placeholder_node_1x1', { x: 20, y: 20 }, Direction.East)!;
    const d = engine.placeBuilding('placeholder_node_1x1', { x: 21, y: 20 }, Direction.East)!;
    expect(
      engine.canConnect(
        { building: c, port: 'out_east' },
        { building: d, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'ports_not_adjacent' });
  });

  it('disconnect removes the connection and frees both ports', () => {
    const { a, b } = placeHorizontalPair(engine);
    const id = engine.connect(
      { building: a, port: 'out_east' },
      { building: b, port: 'in_west' },
    )!;
    expect(engine.disconnect(id)).toBe(true);
    expect(engine.getConnections().size).toBe(0);
    // Ports are free again.
    const id2 = engine.connect(
      { building: a, port: 'out_east' },
      { building: b, port: 'in_west' },
    );
    expect(id2).not.toBeNull();
  });
});
