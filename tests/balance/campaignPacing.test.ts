import { describe, expect, it } from 'vitest';
import { DEPOSIT_BASE_AMOUNT } from '@/game/data/depositAmounts';
import { MILESTONES } from '@/game/data/milestoneCatalog';
import { ResourceType } from '@/game/types';
import { ScriptedCampaignPlayer, type MilestoneTiming } from './scriptedCampaignPlayer';

/**
 * Chapters 1 to 3 played end to end by a scripted player (see
 * scriptedCampaignPlayer.ts), on several seeds. Guards three things while the
 * numbers in the catalogs move:
 * - the campaign never soft-locks: everything is reachable from the starting
 *   kit and the deposits in sight, with the unlocks in milestone order;
 * - no deposit runs dry before the end of chapter 3 (finite deposits, #89),
 *   with a third left at the end of chapter 2;
 * - the pacing stays under the targets of #71 and #94 (first milestone
 *   within 3 minutes, chapter 1 in ~15, chapter 2 around 40, chapter 3
 *   around 2 hours). The scripted player is faster than a human, so its
 *   budgets are about half of those targets.
 *
 * Set BALANCE_REPORT=1 to print the timings.
 */

const SEEDS = [42, 1, 7, 2024];

/** Budgets for the scripted player, in game seconds. */
const BUDGET = {
  firstMilestone: 90,
  chapter1: 8 * 60,
  chapter2: 22 * 60,
  chapter3: 60 * 60,
};

interface Playthrough {
  readonly player: ScriptedCampaignPlayer;
  /** Lowest deposit under the player's extractors when chapter 2 is done. */
  readonly lowestAfterChapter2: number;
}

function playCampaign(seed: number): Playthrough {
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
  const lowestAfterChapter2 = lowestDeposit(player);

  // Chapter 3 · Chemistry. Gases into synthesizers: hydrogen pairs through a
  // merger, carbon and nitrogen out of regolith through converters. The
  // first ring is crowded with chapter 2 belts: these lines go further out,
  // and the raw chapter 1 deliveries make way for them at the hub.
  player.retireDeliveryLines();
  player.nextRing();
  player.synthesizerLine('water', [
    { resource: ResourceType.Hydrogen, extractors: 2 },
    { resource: ResourceType.Oxygen, extractors: 1 },
  ]);
  player.waitForMilestone('chemistry_water');
  player.synthesizerLine('methane', [
    { recipe: 'carbon', extractors: 3 },
    { resource: ResourceType.Hydrogen, extractors: 2 },
  ]);
  player.waitForMilestone('chemistry_methane');
  player.synthesizerLine('ammonia', [
    { recipe: 'nitrogen_gas', extractors: 3 },
    { resource: ResourceType.Hydrogen, extractors: 2 },
  ]);
  player.waitForMilestone('chemistry_ammonia');

  return { player, lowestAfterChapter2 };
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

function report(seed: number, timings: readonly MilestoneTiming[], lowest: { chapter2: number; chapter3: number }): void {
  if (!process.env.BALANCE_REPORT) return;
  const lines = timings.map(({ id, chapter, seconds }) => {
    const minutes = `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
    return `  ch${chapter} ${id.padEnd(26)} ${minutes}`;
  });
  const left = `  lowest deposit left       ${lowest.chapter2} after chapter 2, ${lowest.chapter3} after chapter 3`;
  // stdout: Vitest keeps console output of passing tests to itself.
  process.stdout.write(`seed ${seed}\n${lines.join('\n')}\n${left}\n`);
}

describe('campaign pacing, chapters 1-3', () => {
  it.each(SEEDS)('seed %i: reaches the end of chapter 3 within the pacing budgets', (seed) => {
    const { player, lowestAfterChapter2 } = playCampaign(seed);
    const { timings } = player;
    const lowestAfterChapter3 = lowestDeposit(player);
    report(seed, timings, { chapter2: lowestAfterChapter2, chapter3: lowestAfterChapter3 });

    const chapters = MILESTONES.filter((milestone) => milestone.chapter <= 3).map((milestone) => milestone.id);
    expect(timings.map((timing) => timing.id)).toEqual(chapters);
    expect(at(timings, 'landing_first_extraction')).toBeLessThanOrEqual(BUDGET.firstMilestone);
    expect(at(timings, 'landing_refinery')).toBeLessThanOrEqual(BUDGET.chapter1);
    expect(at(timings, 'refining_silicon')).toBeLessThanOrEqual(BUDGET.chapter2);
    expect(at(timings, 'chemistry_ammonia')).toBeLessThanOrEqual(BUDGET.chapter3);
    // Finite deposits (#89): a third left after chapter 2; chapter 3 runs the
    // oldest deposits low, never dry, which sends the player exploring next.
    expect(lowestAfterChapter2).toBeGreaterThan(DEPOSIT_BASE_AMOUNT / 3);
    expect(lowestAfterChapter3).toBeGreaterThan(DEPOSIT_BASE_AMOUNT / 6);
  });
});
