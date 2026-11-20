import { GameEngine } from '@/game/engine/GameEngine';
import { GameMode } from '@/game/data/gameMode';
import type { ScenarioDefinition, ScenarioRunResult } from './types';

const DEFAULT_STEP_SECONDS = 0.1;

function advanceSimulation(engine: GameEngine, totalSeconds: number, stepSeconds = DEFAULT_STEP_SECONDS): void {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return;

  const safeStep = Number.isFinite(stepSeconds) && stepSeconds > 0 ? stepSeconds : DEFAULT_STEP_SECONDS;
  let elapsedSeconds = 0;
  while (elapsedSeconds < totalSeconds) {
    const dt = Math.min(safeStep, totalSeconds - elapsedSeconds);
    engine.update(dt);
    elapsedSeconds += dt;
  }
}

export function runScenario(
  definition: ScenarioDefinition,
  screenWidth: number,
  screenHeight: number,
): ScenarioRunResult {
  const engine = new GameEngine(screenWidth, screenHeight, { gameMode: GameMode.Sandbox });
  definition.build(engine);

  if (definition.simulate) {
    advanceSimulation(engine, definition.simulate.totalSeconds, definition.simulate.stepSeconds);
  }

  const viewport = definition.view?.viewport ?? engine.getViewportSnapshot();
  engine.viewport.restore(viewport);

  return {
    definition,
    engine,
    selectedTool: definition.view?.selectedTool ?? { kind: 'select' },
    viewport: engine.getViewportSnapshot(),
  };
}
