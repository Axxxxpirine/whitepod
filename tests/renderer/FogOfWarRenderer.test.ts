import { describe, expect, it } from 'vitest';
import { GRID_HEIGHT, GRID_WIDTH, REVEALED_FLAG } from '@/game/constants';
import { getFogTileStyle } from '@/game/renderer/FogOfWarRenderer';

describe('FogOfWarRenderer helpers', () => {
  it('classifies revealed, earthlight fringe, and deep fog tiles without changing reveal state', () => {
    const flags = new Uint8Array(GRID_WIDTH * GRID_HEIGHT);
    flags[10 * GRID_WIDTH + 10] = REVEALED_FLAG;

    expect(getFogTileStyle(flags, 10, 10).alpha).toBe(0);
    expect(getFogTileStyle(flags, 11, 10).alpha).toBeCloseTo(0.35);
    expect(getFogTileStyle(flags, 12, 10).alpha).toBeCloseTo(0.68);
    expect(getFogTileStyle(flags, 13, 10).alpha).toBeCloseTo(0.95);
  });
});
