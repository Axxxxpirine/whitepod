import { beltTierOf, beltTypeId, getBuildingType } from '../data/buildingCatalog';
import { getChapterTitle, type MilestoneUnlocks } from '../data/milestoneCatalog';
import { getRecipe } from '../data/recipeCatalog';

/** "Chapitre 1 · Atterrissage", or "Chapitre 1" when the chapter has no name yet. */
export function chapterLabel(chapter: number): string {
  const title = getChapterTitle(chapter);
  return title ? `Chapitre ${chapter} · ${title}` : `Chapitre ${chapter}`;
}

/** Player-facing names of what a milestone unlocks: buildings first, then recipes. A belt tier shows once, by its straight piece. */
export function unlockLabels(unlocks: MilestoneUnlocks): string[] {
  const buildings = unlocks.buildings.map((id) => {
    const tier = beltTierOf(id);
    const shown = tier ? beltTypeId(tier, 'straight') : id;
    return getBuildingType(shown)?.name ?? shown;
  });
  return [...new Set(buildings), ...unlocks.recipes.map((id) => getRecipe(id)?.name ?? id)];
}
