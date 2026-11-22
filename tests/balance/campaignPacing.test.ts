import { describe, expect, it } from 'vitest';
import { DEPOSIT_BASE_AMOUNT } from '@/game/data/depositAmounts';
import { MILESTONES } from '@/game/data/milestoneCatalog';
import { ResourceType } from '@/game/types';
import { ScriptedCampaignPlayer, type MilestoneTiming } from './scriptedCampaignPlayer';

/**
 * Chapters 1 and 2 played end to end by a scripted player (see
 * scriptedCampaignPlayer.ts), on several seeds. Guards two things while the
 * numbers in the catalogs move:
 * - the campaign never soft-locks: everything is reachable from the starting
 *   kit and the deposits in sight, with the unlocks in milestone order;
 * - no deposit runs dry before the end of chapter 2 (finite deposits, #89);
 * - the pacing stays under the targets of #71 (first milestone within 3
 *   minutes, chapter 1 in ~15, chapter 2 around 40). The scripted player is
 *   faster than a human, so its budgets are about half of those targets.
 *
 * Set BALANCE_REPORT=1 to print the timings.
 */

const SEEDS = [42, 1, 7, 2024];

/** Budgets for the scripted player, in game seconds. */
const BUDGET = {
  firstMilestone: 90,
  chapter1: 8 * 60,
  chapter2: 22 * 60,
};

function playChapters1And2(seed: number): ScriptedCampaignPlayer {
  const player = new ScriptedCampaignPlayer(seed);

  // Chapter 1 · Landing. Oxygen first (the hub asks for it), then regolith
  // for the next requests and for construction.
  player.deliveryLine(ResourceType.Oxygen);
  player.deliveryLine(ResourceType.Oxygen);
  player.waitForMilestone('landing_first_extraction');
  player.deliveryLine(ResourceType.Regolith);
  player.deliveryLine(ResourceType.Regolith);
  player.waitForMilestone('landing_refinery');

  // Chapter 2 · Refining. Regolith income into a storage for construction,
  // then one delivery line per product.
  player.incomeLine(3);
  player.converterLine('iron_oxide', 1);
  player.waitForMilestone('refining_iron');
  // Mergers unlocked: gather the next deliveries before the hub inputs are walled off.
  player.addCollector();
  player.converterLine('aluminum_oxide', 2);
  player.waitForMilestone('refining_light_alloys');
  player.converterLine('silicon_dioxide', 4);
  player.synthesizerLine('ceramic_plates', [
    { recipe: 'aluminum_oxide', extractors: 2 },
    { recipe: 'iron_oxide', extractors: 1 },
  ]);
  player.waitForMilestone('refining_silicon');

  return player;
}

function at(timings: readonly MilestoneTiming[], id: string): number {
  return timings.find((timing) => timing.id === id)!.seconds;
}

/** What is left in the most used deposit under the player's extractors. */
function lowestDeposit(player: ScriptedCampaignPlayer): number {
  let lowest = Infinity;
  for (const id of player.engine.getBuildings().keys()) {
    const remaining = player.engine.getDepositRemaining(id);
    if (remaining !== null) lowest = Math.min(lowest, remaining);
  }
  return lowest;
}

function report(seed: number, timings: readonly MilestoneTiming[], lowest: number): void {
  if (!process.env.BALANCE_REPORT) return;
  const lines = timings.map(({ id, chapter, seconds }) => {
    const minutes = `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
    return `  ch${chapter} ${id.padEnd(26)} ${minutes}`;
  });
  console.info(`seed ${seed}\n${lines.join('\n')}\n  lowest deposit left       ${lowest}`);
}

describe('campaign pacing, chapters 1-2', () => {
  it.each(SEEDS)('seed %i: reaches the end of chapter 2 within the pacing budgets', (seed) => {
    const player = playChapters1And2(seed);
    const { timings } = player;
    const lowest = lowestDeposit(player);
    report(seed, timings, lowest);

    const chapter2 = MILESTONES.filter((milestone) => milestone.chapter <= 2).map((milestone) => milestone.id);
    expect(timings.map((timing) => timing.id)).toEqual(chapter2);
    expect(at(timings, 'landing_first_extraction')).toBeLessThanOrEqual(BUDGET.firstMilestone);
    expect(at(timings, 'landing_refinery')).toBeLessThanOrEqual(BUDGET.chapter1);
    expect(at(timings, 'refining_silicon')).toBeLessThanOrEqual(BUDGET.chapter2);
    // Finite deposits (#89): chapters 1–2 never run a deposit dry, with room to spare.
    expect(lowest).toBeGreaterThan(DEPOSIT_BASE_AMOUNT / 3);
  });
});
