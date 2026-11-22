import { ResourceType, type ResourceType as ResourceTypeValue } from '../types';

export type RecipeId = string;

export interface RecipeIngredient {
  readonly resourceType: ResourceTypeValue;
  readonly amount: number;
}

export interface Recipe {
  readonly id: RecipeId;
  readonly name: string;
  readonly inputs: readonly RecipeIngredient[];
  readonly output: RecipeIngredient;
  readonly cycleSeconds: number;
  readonly building: 'converter' | 'synthesizer';
}

const recipes: readonly Recipe[] = [
  // --- Converter recipes (1 input → 1 output) ---
  {
    id: 'iron_oxide',
    name: 'Oxydation (fer)',
    inputs: [{ resourceType: ResourceType.Regolith, amount: 1 }],
    output: { resourceType: ResourceType.IronOxide, amount: 1 },
    cycleSeconds: 2,
    building: 'converter',
  },
  {
    id: 'aluminum_oxide',
    name: 'Oxydation (aluminium)',
    inputs: [{ resourceType: ResourceType.Regolith, amount: 2 }],
    output: { resourceType: ResourceType.AluminumOxide, amount: 1 },
    cycleSeconds: 3,
    building: 'converter',
  },
  {
    id: 'silicon_dioxide',
    name: 'Oxydation (silicium)',
    inputs: [{ resourceType: ResourceType.Regolith, amount: 4 }],
    output: { resourceType: ResourceType.SiliconDioxide, amount: 1 },
    cycleSeconds: 5,
    building: 'converter',
  },
  // Lunar regolith holds the volatiles the solar wind implanted (#93): the
  // converter drives out nitrogen and carbon, no extra deposit needed.
  {
    id: 'nitrogen_gas',
    name: "Désorption d'azote",
    inputs: [{ resourceType: ResourceType.Regolith, amount: 3 }],
    output: { resourceType: ResourceType.NitrogenGas, amount: 1 },
    cycleSeconds: 4,
    building: 'converter',
  },
  {
    id: 'carbon',
    name: 'Pyrolyse (carbone)',
    inputs: [{ resourceType: ResourceType.Regolith, amount: 3 }],
    output: { resourceType: ResourceType.Carbon, amount: 1 },
    cycleSeconds: 4,
    building: 'converter',
  },
  // --- Synthesizer recipes (2 inputs → 1 output) ---
  {
    id: 'water',
    name: "Synthèse d'eau",
    inputs: [
      { resourceType: ResourceType.Hydrogen, amount: 2 },
      { resourceType: ResourceType.Oxygen, amount: 1 },
    ],
    output: { resourceType: ResourceType.Water, amount: 1 },
    cycleSeconds: 4,
    building: 'synthesizer',
  },
  {
    id: 'methane',
    name: 'Synthèse de méthane',
    // Gameplay stoichiometry: 2 hydrogen (2 providers) rather than 4, to keep merger counts low.
    inputs: [
      { resourceType: ResourceType.Carbon, amount: 1 },
      { resourceType: ResourceType.Hydrogen, amount: 2 },
    ],
    output: { resourceType: ResourceType.Methane, amount: 1 },
    cycleSeconds: 5,
    building: 'synthesizer',
  },
  {
    id: 'carbon_dioxide',
    name: 'Synthèse de CO₂',
    inputs: [
      { resourceType: ResourceType.Carbon, amount: 1 },
      { resourceType: ResourceType.Oxygen, amount: 1 },
    ],
    output: { resourceType: ResourceType.CarbonDioxide, amount: 1 },
    cycleSeconds: 4,
    building: 'synthesizer',
  },
  {
    id: 'ammonia',
    name: "Synthèse d'ammoniac",
    // Gameplay stoichiometry: 2 hydrogen rather than 3, as for methane.
    inputs: [
      { resourceType: ResourceType.NitrogenGas, amount: 1 },
      { resourceType: ResourceType.Hydrogen, amount: 2 },
    ],
    output: { resourceType: ResourceType.Ammonia, amount: 1 },
    cycleSeconds: 6,
    building: 'synthesizer',
  },
  {
    id: 'ceramic_plates',
    name: 'Céramique',
    inputs: [
      { resourceType: ResourceType.AluminumOxide, amount: 1 },
      { resourceType: ResourceType.IronOxide, amount: 1 },
    ],
    output: { resourceType: ResourceType.CeramicPlates, amount: 1 },
    cycleSeconds: 6,
    building: 'synthesizer',
  },
];

const recipeMap = new Map<RecipeId, Recipe>(recipes.map((r) => [r.id, r]));

export function getRecipe(id: RecipeId): Recipe | undefined {
  return recipeMap.get(id);
}

export function getRecipesForBuilding(building: 'converter' | 'synthesizer'): readonly Recipe[] {
  return recipes.filter((r) => r.building === building);
}
