import { describe, expect, it } from 'vitest';
import { DAY_NIGHT_CYCLE_SECONDS } from '@/game/constants';
import { GameEngine } from '@/game/engine/GameEngine';

describe('GameEngine simulation clock', () => {
  it('starts at midnight and advances with update(dt)', () => {
    const engine = new GameEngine(800, 600);
    expect(engine.simulationTime).toBe(0);

    engine.update(DAY_NIGHT_CYCLE_SECONDS / 4);
    expect(engine.simulationTime).toBeCloseTo(0.25);
  });

  it('wraps simulation time in [0, 1)', () => {
    const engine = new GameEngine(800, 600);

    engine.update(DAY_NIGHT_CYCLE_SECONDS + 10);
    expect(engine.simulationTime).toBeCloseTo(10 / DAY_NIGHT_CYCLE_SECONDS);
  });

  it('ignores non-positive and non-finite delta times', () => {
    const engine = new GameEngine(800, 600);

    engine.update(0);
    engine.update(-1);
    engine.update(Number.NaN);
    engine.update(Number.POSITIVE_INFINITY);

    expect(engine.simulationTime).toBe(0);
  });

  it('supports a custom day-night cycle duration', () => {
    const engine = new GameEngine(800, 600, { dayNightCycleSeconds: 120 });

    engine.update(30);
    expect(engine.simulationTime).toBeCloseTo(0.25);
  });
});
