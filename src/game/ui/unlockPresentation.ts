import type { UnlockKind } from '../campaign/unlocks';
import type { GameEngine } from '../engine/GameEngine';

/**
 * Why a piece of content is not available yet, for tooltips and cards:
 * null when it is unlocked (always the case in sandbox).
 */
export function lockedHint(engine: GameEngine | null, kind: UnlockKind, id: string): string | null {
  if (!engine) return null;
  const unlocked = kind === 'buildings' ? engine.isBuildingUnlocked(id) : engine.isRecipeUnlocked(id);
  if (unlocked) return null;
  const milestone = engine.getUnlockingMilestone(kind, id);
  return milestone ? `Débloqué par : ${milestone.title}` : 'Pas encore disponible';
}
