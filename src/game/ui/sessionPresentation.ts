import { GameMode } from '../data/gameMode';
import { MILESTONES } from '../data/milestoneCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type { SavedSessionSummary } from '../persistence/sessionStorage';

export function gameModeLabel(mode: GameMode): string {
  return mode === GameMode.Campaign ? 'Campagne' : 'Bac à sable';
}

/** Summary of the running game, read from the live engine (saves are debounced). */
export function summarizeEngine(engine: GameEngine): SavedSessionSummary {
  return {
    gameMode: engine.gameMode,
    mapSeed: engine.mapSeed,
    completedMilestones: engine.getCompletedMilestoneIds().length,
  };
}

/** One line under "Continue": "Campagne · graine 42 · 1 / 6 paliers". */
export function describeSession(summary: SavedSessionSummary): string {
  const parts = [gameModeLabel(summary.gameMode), `graine ${summary.mapSeed}`];
  if (summary.gameMode === GameMode.Campaign) {
    parts.push(`${summary.completedMilestones} / ${MILESTONES.length} paliers`);
  }
  return parts.join(' · ');
}

/** The HUD can replace the only save via a new seed or a generated scenario. */
export function confirmWorldReplacement(engine: GameEngine, replacement: string): boolean {
  return window.confirm(`Effacer la partie en cours et ${replacement} ?\n\n${describeSession(summarizeEngine(engine))}`);
}
