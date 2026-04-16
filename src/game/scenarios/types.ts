import type { GameEngine } from '@/game/engine/GameEngine';
import type { ViewportSnapshot } from '@/game/engine/Viewport';
import type { SelectedTool } from '@/game/types';

export interface ScenarioViewState {
  readonly selectedTool: SelectedTool;
  readonly viewport: ViewportSnapshot;
}

export interface ScenarioDefinition {
  readonly id: string;
  readonly label: string;
  readonly build: (engine: GameEngine) => void;
  readonly simulate?: {
    readonly totalSeconds: number;
    readonly stepSeconds?: number;
  };
  readonly view?: ScenarioViewState;
}

export interface PreparedScenarioResult {
  readonly engine: GameEngine;
  readonly selectedTool: SelectedTool;
  readonly viewport: ViewportSnapshot;
}

export interface ScenarioRunResult extends PreparedScenarioResult {
  readonly definition: ScenarioDefinition;
}

export interface ScenarioListEntry {
  readonly id: string;
  readonly label: string;
}

export interface ScenarioGeneratorDefinition {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly generate: (screenWidth: number, screenHeight: number) => PreparedScenarioResult;
}

export interface ScenarioGeneratorListEntry {
  readonly id: string;
  readonly label: string;
  readonly description: string;
}
