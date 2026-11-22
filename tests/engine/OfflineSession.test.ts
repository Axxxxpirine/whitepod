import { afterEach, expect, it, vi } from 'vitest';
import { ResourceType } from '@/game/types';
import { GameEngine } from '@/game/engine/GameEngine';
import { OfflineSession } from '@/game/idle/OfflineSession';

afterEach(() => vi.useRealTimers());

function setup() {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  const engine = new GameEngine(640, 480);
  const checkpoint = vi.fn();
  const completed = vi.fn();
  const busy = vi.fn();
  const clock = new OfflineSession(engine, { checkpoint, completed, busy });
  return { clock, engine, checkpoint, completed, busy };
}

it('yields long replays and checkpoints only the unplayed interval when hidden again', async () => {
  const { clock, engine, checkpoint, completed, busy } = setup();
  const update = vi.spyOn(engine, 'update');
  clock.suspend(true);
  vi.setSystemTime(Date.now() + 600_000);
  clock.resume();
  expect(update).not.toHaveBeenCalled();
  expect(busy).toHaveBeenCalledWith(true);
  await vi.advanceTimersToNextTimerAsync();
  const replayed = update.mock.calls.reduce((sum, [dt]) => sum + dt, 0);
  expect(replayed).toBeGreaterThan(0);
  expect(replayed).toBeLessThan(600);
  clock.suspend(true);
  const since = checkpoint.mock.lastCall![0];
  expect((Date.now() - since) / 1000).toBeCloseTo(600 - replayed);
  vi.setSystemTime(Date.now() + 10_000);
  clock.resume();
  await vi.runAllTimersAsync();
  expect(update.mock.calls.reduce((sum, [dt]) => sum + dt, 0)).toBeCloseTo(610);
  expect(completed).toHaveBeenCalledTimes(1);
  expect(completed.mock.lastCall![0].appliedSeconds).toBeCloseTo(610);
  expect(checkpoint).toHaveBeenLastCalledWith(null);
});

it('keeps a paused game unchanged when hidden, closed or resumed', async () => {
  const { clock, engine, checkpoint } = setup();
  const original = engine.simulationTime;
  clock.suspend(false);
  vi.setSystemTime(Date.now() + 60_000);
  clock.checkpointForExit(false);
  clock.resume();
  await vi.runAllTimersAsync();
  expect(engine.simulationTime).toBe(original);
  expect(checkpoint.mock.calls).toEqual([[null], [null]]);
});

it('cancels a pending replay on session replacement', async () => {
  const { clock, completed, engine } = setup();
  const update = vi.spyOn(engine, 'update');
  clock.restore(Date.now() - 3_600_000);
  clock.resume();
  clock.destroy();
  await vi.runAllTimersAsync();
  expect(update).not.toHaveBeenCalled();
  expect(completed).not.toHaveBeenCalled();
});

it('keeps historical extractor startup sounds out of replay', async () => {
  const { clock, engine } = setup();
  engine.generateMap(42);
  engine.grid.setResource(126, 125, ResourceType.Regolith);
  const extractor = engine.placeBuilding('extractor_basic', { x: 126, y: 125 })!;
  const panel = engine.placeBuilding('solar_panel', { x: 123, y: 125 })!;
  expect(engine.connectBuildings(extractor, panel)).toBe(true);
  engine.setSimulationTime(0);
  const sound = vi.fn();
  engine.subscribeSfx(sound);
  clock.suspend(true);
  vi.setSystemTime(Date.now() + 120_000);
  clock.resume();
  await vi.runAllTimersAsync();
  expect(sound).not.toHaveBeenCalled();
});
