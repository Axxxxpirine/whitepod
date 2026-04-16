import { generateStarterScenario } from './generateStarterScenario';
import type { ScenarioGeneratorDefinition, ScenarioGeneratorListEntry } from './types';

const generators = [
  {
    id: 'starter-random',
    label: 'Generate Starter Scenario',
    description: 'One-shot playable start with visible deposits and powered extractors.',
    generate: generateStarterScenario,
  },
] as const satisfies readonly ScenarioGeneratorDefinition[];

export function listScenarioGenerators(): ScenarioGeneratorListEntry[] {
  return generators.map(({ id, label, description }) => ({ id, label, description }));
}

export function getScenarioGeneratorDefinition(id: string): ScenarioGeneratorDefinition {
  const generator = generators.find((entry) => entry.id === id);
  if (!generator) {
    throw new Error(`Unknown scenario generator: ${id}`);
  }
  return generator;
}
