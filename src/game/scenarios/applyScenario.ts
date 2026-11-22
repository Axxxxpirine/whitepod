import type { GameEngine } from '@/game/engine/GameEngine';
import { createSessionId, installPersistedSession } from '@/game/persistence/sessionStorage';
import { useGameStore } from '@/store/useGameStore';
import { getScenarioDefinition } from './catalog';
import { getScenarioGeneratorDefinition } from './generatorCatalog';
import { clearPendingScenarioInstall, markPendingScenarioInstall } from './installState';
import { runScenario } from './runScenario';
import type { PreparedScenarioResult } from './types';

function applyPreparedScenarioToLiveSession(result: PreparedScenarioResult, logMessage: string): void {
  const state = useGameStore.getState();
  state.actionLogger?.flush();
  const installed = installPersistedSession({
    engine: result.engine,
    selectedTool: result.selectedTool,
    selectedBotProfileId: state.selectedBotProfileId,
    seedInput: state.seedInput,
    sessionId: createSessionId(),
    viewport: result.viewport,
  });

  if (!installed) {
    window.alert("Le navigateur n’a pas pu enregistrer le scénario. La partie en cours est conservée.");
    return;
  }
  markPendingScenarioInstall();
  state.activateScenarioSession({
    engine: result.engine,
    selectedTool: result.selectedTool,
    simulationTime: result.engine.simulationTime,
  });

  if (import.meta.env.DEV) {
    console.info(logMessage);
  }
}

export function applyScenarioToLiveSession(engine: GameEngine, id: string): void {
  const result = runScenario(
    getScenarioDefinition(id),
    engine.viewport.screenWidth,
    engine.viewport.screenHeight,
  );

  applyPreparedScenarioToLiveSession(result, `[scenarios] Installed "${id}" and applied it to the live session.`);
}

export function applyScenarioGeneratorToLiveSession(engine: GameEngine, id: string): void {
  const result = getScenarioGeneratorDefinition(id).generate(
    engine.viewport.screenWidth,
    engine.viewport.screenHeight,
  );

  applyPreparedScenarioToLiveSession(result, `[scenarios] Generated "${id}" and applied it to the live session.`);
}

export function finalizePendingScenarioInstall(): void {
  clearPendingScenarioInstall();
}
