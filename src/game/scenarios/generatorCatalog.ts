import { generateSimpleScenario } from './generators/generateSimpleScenario';
import { generateMediumScenario } from './generators/generateMediumScenario';
import { generateComplexScenario } from './generators/generateComplexScenario';
import { generateFullIsruScenario } from './generators/generateFullIsruScenario';
import type { ScenarioGeneratorDefinition, ScenarioGeneratorListEntry } from './types';

const generators = [
  {
    id: 'tier-simple',
    label: 'Simple',
    description: 'Starter layout: 3 solar + 1 battery + 2 extractors. Single energy subnet, no belts.',
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
    id: 'tier-full-isru',
    label: 'Full ISRU',
    description: 'Complete pipeline: extractors + converters + synthesizer. All base + refined resources.',
    generate: generateFullIsruScenario,
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
