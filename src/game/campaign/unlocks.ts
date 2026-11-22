import type { Milestone, MilestoneId, MilestoneUnlocks } from '../data/milestoneCatalog';
import type { RecipeId } from '../data/recipeCatalog';
import type { BuildingTypeId } from '../types';

/** Pure unlock rules; the engine owns the completed milestones and applies the result. */

export interface UnlockState {
  readonly buildings: ReadonlySet<BuildingTypeId>;
  readonly recipes: ReadonlySet<RecipeId>;
}

/** What is unlocked: the starting content plus every completed milestone's unlocks. */
export function computeUnlocks(
  catalog: readonly Milestone[],
  completed: ReadonlySet<MilestoneId>,
  starting: MilestoneUnlocks,
): UnlockState {
  const buildings = new Set<BuildingTypeId>(starting.buildings);
  const recipes = new Set<RecipeId>(starting.recipes);
  for (const milestone of catalog) {
    if (!completed.has(milestone.id)) continue;
    for (const id of milestone.unlocks.buildings) buildings.add(id);
    for (const id of milestone.unlocks.recipes) recipes.add(id);
  }
  return { buildings, recipes };
}

export type UnlockKind = keyof MilestoneUnlocks;

/** The milestone that unlocks this content, or null when none does (starting or later-chapter content). */
export function findUnlockingMilestone(
  catalog: readonly Milestone[],
  kind: UnlockKind,
  id: string,
): Milestone | null {
  return catalog.find((milestone) => (milestone.unlocks[kind] as readonly string[]).includes(id)) ?? null;
}
