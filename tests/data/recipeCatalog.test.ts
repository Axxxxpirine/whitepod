import { describe, expect, it } from 'vitest';
import { getRecipesForBuilding, type Recipe } from '@/game/data/recipeCatalog';
import { resourceStockKey } from '@/game/data/resourceStock';
import { getResourceSprite } from '@/game/ui/resourcePresentation';
import { ResourceType, type ResourceType as ResourceTypeValue } from '@/game/types';

/** What the map generator lays down (ResourceGenerator): everything else must be made. */
const DEPOSITS: readonly ResourceTypeValue[] = [ResourceType.Regolith, ResourceType.Hydrogen, ResourceType.Oxygen];

const RECIPES: readonly Recipe[] = [...getRecipesForBuilding('converter'), ...getRecipesForBuilding('synthesizer')];

/** Resources obtainable from the deposits, closing over every recipe whose inputs are all obtainable. */
function obtainable(): Set<ResourceTypeValue> {
  const reached = new Set<ResourceTypeValue>(DEPOSITS);
  let grew = true;
  while (grew) {
    grew = false;
    for (const recipe of RECIPES) {
      if (reached.has(recipe.output.resourceType)) continue;
      if (recipe.inputs.every((input) => reached.has(input.resourceType))) {
        reached.add(recipe.output.resourceType);
        grew = true;
      }
    }
  }
  return reached;
}

describe('recipe graph (#93)', () => {
  it('reaches every resource from the three lunar deposits', () => {
    const resources = Object.values(ResourceType).filter((type) => type !== ResourceType.None);
    const reached = obtainable();

    expect(resources.filter((type) => !reached.has(type))).toEqual([]);
  });

  it('makes each resource with exactly one recipe, never a deposit', () => {
    const outputs = RECIPES.map((recipe) => recipe.output.resourceType);

    expect(new Set(outputs).size).toBe(outputs.length);
    expect(outputs.filter((type) => DEPOSITS.includes(type))).toEqual([]);
  });

  it('feeds converters one input and synthesizers two', () => {
    for (const recipe of getRecipesForBuilding('converter')) expect(recipe.inputs, recipe.id).toHaveLength(1);
    for (const recipe of getRecipesForBuilding('synthesizer')) expect(recipe.inputs, recipe.id).toHaveLength(2);
  });

  it('gives every resource a stock key and a sprite', () => {
    for (const type of Object.values(ResourceType).filter((value) => value !== ResourceType.None)) {
      expect(resourceStockKey(type), `stock key for ${type}`).toBeDefined();
      expect(getResourceSprite(type), `sprite for ${type}`).toBeDefined();
    }
  });
});
