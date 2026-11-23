import { describe, expect, it } from 'vitest';
import { GameMode } from '@/game/data/gameMode';
import { expectReloadIsIdentical, runChaos } from './chaosPlayer';
import { findInvariantViolations } from './invariants';

const SEEDS = [1, 7, 42, 1337, 20261123];

describe('chaos player', () => {
  it.each(SEEDS)('sandbox, seed %i: random actions never break the world', (seed) => {
    const { engine } = runChaos({ seed, gameMode: GameMode.Sandbox, actions: 1500 });
    expect(findInvariantViolations(engine)).toEqual([]);
    expectReloadIsIdentical(engine, 45, `sandbox seed ${seed}`);
  });

  it.each(SEEDS)('rich campaign, seed %i: construction never creates or destroys resources', (seed) => {
    const { engine } = runChaos({ seed, gameMode: GameMode.Campaign, actions: 1500, stock: 400 });
    expect(findInvariantViolations(engine)).toEqual([]);
    expectReloadIsIdentical(engine, 45, `campaign seed ${seed}`);
  });

  it.each(SEEDS)('poor campaign, seed %i: a player who cannot pay breaks nothing', (seed) => {
    const { engine } = runChaos({ seed, gameMode: GameMode.Campaign, actions: 800, stock: 0 });
    expect(findInvariantViolations(engine)).toEqual([]);
    expectReloadIsIdentical(engine, 45, `poor campaign seed ${seed}`);
  });
});
