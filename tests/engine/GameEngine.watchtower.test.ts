import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { WATCHTOWER_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { Direction, TileType } from '@/game/types';
import { WATCHTOWER_REVEAL_RADIUS } from '@/game/constants';

/**
 * Tests for the watchtower fog-of-war reveal mechanic.
 *
 * The watchtower is a 2×2 building whose sole gameplay effect is to permanently
 * reveal a circular area of radius WATCHTOWER_REVEAL_RADIUS around its center
 * when placed. This expands the explorable map and allows placing buildings in
 * previously fogged tiles.
 */

function makeEngine(): GameEngine {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  // All tiles start fogged (no generateMap / revealAll call).
  return engine;
}

describe('watchtower fog reveal', () => {
  it('reveals tiles within radius on placement', () => {
    const engine = makeEngine();
    const ox = 100;
    const oy = 100;

    // Reveal only the 4 tiles needed for the 2×2 footprint so the placement is valid.
    engine.grid.revealCircle(ox + 1, oy + 1, 2);

    // Confirm a tile at the edge of the reveal radius is fogged before placement.
    const edgeTileX = ox + 1;
    const edgeTileY = oy + 1 + WATCHTOWER_REVEAL_RADIUS - 1;
    expect(engine.grid.isRevealed(edgeTileX, edgeTileY)).toBe(false);

    engine.placeBuilding(WATCHTOWER_BUILDING_TYPE_ID, { x: ox, y: oy }, Direction.North);

    // The tile at the edge of the reveal radius is now revealed.
    expect(engine.grid.isRevealed(edgeTileX, edgeTileY)).toBe(true);
  });

  it('does not reveal tiles beyond the radius', () => {
    const engine = makeEngine();
    const ox = 128;
    const oy = 128;

    engine.grid.revealCircle(ox + 1, oy + 1, 2);
    engine.placeBuilding(WATCHTOWER_BUILDING_TYPE_ID, { x: ox, y: oy }, Direction.North);

    // A tile strictly outside the radius must remain fogged.
    const outsideX = ox + 1;
    const outsideY = oy + 1 + WATCHTOWER_REVEAL_RADIUS + 2;
    expect(engine.grid.isRevealed(outsideX, outsideY)).toBe(false);
  });

  it('uses the footprint center as the reveal origin', () => {
    const engine = makeEngine();
    const ox = 60;
    const oy = 60;

    // 2×2 footprint → center = (ox + 1, oy + 1)
    const expectedCx = ox + 1;
    const expectedCy = oy + 1;

    engine.grid.revealCircle(expectedCx, expectedCy, 2);
    engine.placeBuilding(WATCHTOWER_BUILDING_TYPE_ID, { x: ox, y: oy }, Direction.North);

    // Verify symmetry: equal distances east and west of center should both be revealed.
    const r = Math.floor(WATCHTOWER_REVEAL_RADIUS / 2);
    expect(engine.grid.isRevealed(expectedCx + r, expectedCy)).toBe(true);
    expect(engine.grid.isRevealed(expectedCx - r, expectedCy)).toBe(true);
    expect(engine.grid.isRevealed(expectedCx, expectedCy + r)).toBe(true);
    expect(engine.grid.isRevealed(expectedCx, expectedCy - r)).toBe(true);
  });

  it('increments fogVersion when revealing', () => {
    const engine = makeEngine();
    engine.grid.revealCircle(101, 101, 2);
    const versionBefore = engine.grid.fogVersion;

    engine.placeBuilding(WATCHTOWER_BUILDING_TYPE_ID, { x: 100, y: 100 }, Direction.North);

    expect(engine.grid.fogVersion).toBeGreaterThan(versionBefore);
  });

  it('blocks building placement on fogged tiles', () => {
    const engine = makeEngine();
    // No tiles revealed — placement must fail with tile_fogged.
    const result = engine.canPlaceBuilding(WATCHTOWER_BUILDING_TYPE_ID, { x: 50, y: 50 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('tile_fogged');
  });

  it('allows building in a previously fogged tile after reveal', () => {
    const engine = makeEngine();
    engine.grid.revealCircle(101, 101, 2);

    // Place first watchtower to reveal a larger area.
    engine.placeBuilding(WATCHTOWER_BUILDING_TYPE_ID, { x: 100, y: 100 }, Direction.North);

    // A position within the newly revealed ring (but far enough from the first tower).
    const secondOx = 110;
    const secondOy = 100;
    expect(engine.grid.isRevealed(secondOx, secondOy)).toBe(true);
    const result = engine.canPlaceBuilding(WATCHTOWER_BUILDING_TYPE_ID, { x: secondOx, y: secondOy });
    // Should not fail with tile_fogged (may fail for other reasons, but not fog).
    if (!result.ok) expect(result.reason).not.toBe('tile_fogged');
  });

  it('permanent reveal persists — repeated canPlaceBuilding calls return the same fog result', () => {
    const engine = makeEngine();
    engine.grid.revealCircle(101, 101, 2);
    engine.placeBuilding(WATCHTOWER_BUILDING_TYPE_ID, { x: 100, y: 100 }, Direction.North);

    const targetX = 105;
    const targetY = 100;
    const firstCall  = engine.grid.isRevealed(targetX, targetY);
    const secondCall = engine.grid.isRevealed(targetX, targetY);

    // Reveal is permanent — state does not change between reads.
    expect(firstCall).toBe(secondCall);
    expect(firstCall).toBe(true);
  });
});
