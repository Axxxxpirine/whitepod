import { generateSimpleScenario } from './generators/generateSimpleScenario';
import { generateMediumScenario } from './generators/generateMediumScenario';
import { generateComplexScenario } from './generators/generateComplexScenario';
import { generateBuildAllScenario } from './generators/generateBuildAllScenario';
import type { ScenarioGeneratorDefinition, ScenarioGeneratorListEntry } from './types';

const generators = [
  {
    id: 'tier-simple',
    label: 'Simple',
    description: 'Starter layout: 4 solar + 1 battery + 3 extractors + 3 storages. Single energy subnet with belts.',
    generate: generateSimpleScenario,
  },
  {
    id: 'tier-medium',
    label: 'Medium',
    description: 'Mid-complexity: storage, belts, 2 resource types, branched energy network.',
    generate: generateMediumScenario,
  },
  {
    id: 'tier-complex',
    label: 'Complex',
    description: 'Full complexity: 2 subnets, mergers, watchtower, all 3 resource types.',
    generate: generateComplexScenario,
  },
  {
    id: 'tier-build-all',
    label: 'Build All',
    description: 'Complete pipeline: all 4 converters + all 5 synthesizers. All 12 resource types produced.',
    generate: generateBuildAllScenario,
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
