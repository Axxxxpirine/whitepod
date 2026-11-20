import { getBuildingType } from '../data/buildingCatalog';
import { getChapterTitle, type MilestoneUnlocks } from '../data/milestoneCatalog';
import { getRecipe } from '../data/recipeCatalog';

/** "Chapitre 1 · Atterrissage", or "Chapitre 1" when the chapter has no name yet. */
export function chapterLabel(chapter: number): string {
  const title = getChapterTitle(chapter);
  return title ? `Chapitre ${chapter} · ${title}` : `Chapitre ${chapter}`;
}

/** Player-facing names of what a milestone unlocks: buildings first, then recipes. */
export function unlockLabels(unlocks: MilestoneUnlocks): string[] {
  return [
    ...unlocks.buildings.map((id) => getBuildingType(id)?.name ?? id),
    ...unlocks.recipes.map((id) => getRecipe(id)?.name ?? id),
  ];
}
