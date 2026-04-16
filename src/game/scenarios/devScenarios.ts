import type { GameEngine } from '@/game/engine/GameEngine';
import { listScenarios } from './catalog';
import { listScenarioGenerators } from './generatorCatalog';
import { applyScenarioGeneratorToLiveSession, applyScenarioToLiveSession } from './applyScenario';
import { clearPendingScenarioInstall, hasPendingScenarioInstall, markPendingScenarioInstall } from './installState';

export interface DevScenarioApi {
  list(): ReturnType<typeof listScenarios>;
  listGenerators(): ReturnType<typeof listScenarioGenerators>;
  install(id: string): void;
  generate(id?: string): void;
}

export function createDevScenarioApi(engine: GameEngine): DevScenarioApi {
  return {
    list() {
      return listScenarios();
    },
    listGenerators() {
      return listScenarioGenerators();
    },
    install(id: string) {
      applyScenarioToLiveSession(engine, id);
    },
    generate(id = 'tier-simple') {
      applyScenarioGeneratorToLiveSession(engine, id);
    },
  };
}
export { clearPendingScenarioInstall, hasPendingScenarioInstall, markPendingScenarioInstall };
