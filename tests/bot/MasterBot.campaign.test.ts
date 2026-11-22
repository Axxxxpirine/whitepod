import { describe, expect, it } from 'vitest';
import { MasterBot } from '@/game/bot/MasterBot';
import { BotController } from '@/game/bot/BotController';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { getBuildingType } from '@/game/data/buildingCatalog';

/**
 * MasterBot under campaign rules (#95): it pays for what it builds, uses only
 * unlocked content, delivers what the active milestone asks to the hub and
 * confirms milestones, through chapter 1 without soft lock.
 */

/** Ticks the bot like its 400 ms timer, with the simulation running in between. */
function playChapter1(seed: number): { engine: GameEngine; seconds: number } {
  const engine = new GameEngine(1280, 720, { gameMode: GameMode.Campaign });
  engine.generateMap(seed);
  const bot = new MasterBot(engine, () => {});
  const ticking = bot as unknown as { active: boolean; tick(): void };
  ticking.active = true;
  let seconds = 0;
  while (seconds < 25 * 60 && !engine.getCompletedMilestoneIds().includes('landing_refinery')) {
    ticking.tick();
    for (let i = 0; i < 4; i++) engine.update(0.1);
    seconds += 0.4;
  }
  return { engine, seconds };
}

describe('MasterBot in campaign', () => {
  it.each([42, 2024])('seed %i: completes chapter 1 in a fresh campaign', (seed) => {
    const { engine, seconds } = playChapter1(seed);

    expect(engine.getCompletedMilestoneIds()).toEqual(['landing_first_extraction', 'landing_breathable_air', 'landing_refinery']);
    expect(seconds).toBeLessThan(25 * 60);
    // Campaign rules held: nothing locked was built, the hub never went negative.
    for (const building of engine.getBuildings().values()) {
      expect(engine.isBuildingUnlocked(building.typeId) || getBuildingType(building.typeId)?.systemPlaced, building.typeId).toBeTruthy();
    }
    for (const amount of Object.values(engine.getHubInventory()!)) expect(amount).toBeGreaterThanOrEqual(0);
  }, 120000);

  it('is offered in campaign only behind the dev setting, and only for MasterBot', () => {
    const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
    engine.generateMap(42);
    let allowed = false;

    const master = new BotController(engine, () => {}, 'master', () => allowed);
    const connector = new BotController(engine, () => {}, 'connector', () => allowed);
    expect(master.isAvailable).toBe(false);
    allowed = true;
    expect(master.isAvailable).toBe(true);
    expect(connector.isAvailable).toBe(false);

    const sandbox = new BotController(new GameEngine(800, 600), () => {}, 'connector', () => false);
    expect(sandbox.isAvailable).toBe(true);
  });
});
