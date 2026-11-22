import { resourceStockKey } from '../data/resourceStock';
import type { Milestone, MilestoneId } from '../data/milestoneCatalog';
import type { ResourceInventory } from '../engine/GameEngine';
import type { ResourceType } from '../types';

/** Pure milestone rules; the engine owns the state and the hub inventory. */

export interface MilestoneRequirementProgress {
  readonly resourceType: ResourceType;
  readonly required: number;
  /** What the hub holds towards it, capped at `required`. */
  readonly available: number;
}

export interface MilestoneProgress {
  readonly milestone: Milestone;
  readonly requirements: readonly MilestoneRequirementProgress[];
  /** True when every requirement is fully available: the player can complete it. */
  readonly ready: boolean;
}

/** First milestone of `catalog` not in `completed`, or null when the campaign is done. */
export function findActiveMilestone(
  catalog: readonly Milestone[],
  completed: ReadonlySet<MilestoneId>,
): Milestone | null {
  return catalog.find((milestone) => !completed.has(milestone.id)) ?? null;
}

export function computeMilestoneProgress(milestone: Milestone, hubInventory: ResourceInventory): MilestoneProgress {
  const requirements = milestone.requirements.map(({ resourceType, amount }) => {
    const key = resourceStockKey(resourceType);
    const held = key ? hubInventory[key] : 0;
    return { resourceType, required: amount, available: Math.min(held, amount) };
  });
  return {
    milestone,
    requirements,
    ready: requirements.every((requirement) => requirement.available >= requirement.required),
  };
}

/**
 * Consumes the milestone requirements from the hub inventory. Atomic: returns
 * false and changes nothing when the hub does not hold everything.
 */
export function consumeMilestoneRequirements(milestone: Milestone, hubInventory: ResourceInventory): boolean {
  if (!computeMilestoneProgress(milestone, hubInventory).ready) return false;
  for (const { resourceType, amount } of milestone.requirements) {
    hubInventory[resourceStockKey(resourceType)!] -= amount;
  }
  return true;
}
