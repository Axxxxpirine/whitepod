import {
  CONVERTER_BUILDING_TYPE_ID,
  isProcessorTypeId,
} from '@/game/data/buildingCatalog';
import { type BuildingId, type ResourceType as ResourceTypeT } from '@/game/types';
import { resolveProcessorLogisticsStatus } from '@/game/flow/processorLogistics';
import type { GameEngine } from '@/game/engine/GameEngine';
import { getRecipe, getRecipesForBuilding, type RecipeId } from '@/game/data/recipeCatalog';

export interface ProcessorConfigResult {
  success: boolean;
  recipeId: RecipeId | null;
  error?: string;
}

export function configureConnectedConverter(
  engine: GameEngine,
  converterId: BuildingId,
): RecipeId | null {
  for (const recipe of getRecipesForBuilding('converter')) {
    const logistics = resolveProcessorLogisticsStatus(engine, converterId, recipe.id);
    if (!logistics || logistics.badInput || logistics.missingInput || logistics.blockedOutput) continue;
    if (engine.setProcessorRecipe(converterId, recipe.id)) return recipe.id;
  }
  return null;
}

export function configureSynthesizerForRecipe(
  engine: GameEngine,
  synthesizerId: BuildingId,
  recipeId: RecipeId,
): boolean {
  const recipe = getRecipe(recipeId);
  if (!recipe || recipe.building !== 'synthesizer') {
    return false;
  }

  const status = engine.getProcessorLogisticsStatus(synthesizerId);
  if (status?.badInput || status?.missingInput || status?.blockedOutput) {
    return false;
  }

  return engine.setProcessorRecipe(synthesizerId, recipeId);
}

export function checkProcessorLogisticsReadiness(engine: GameEngine, buildingId: BuildingId): boolean {
  const status = engine.getProcessorLogisticsStatus(buildingId);
  if (!status) return false;

  return !status.badInput && !status.missingInput && !status.blockedOutput;
}

export function findProcessorInputMaterial(
  engine: GameEngine,
  processorId: BuildingId,
): ResourceTypeT | null {
  const building = engine.getBuildings().get(processorId);
  if (!building || !isProcessorTypeId(building.typeId)) {
    return null;
  }

  const buildingType = building.typeId === CONVERTER_BUILDING_TYPE_ID ? 'converter' : 'synthesizer';
  const recipes = getRecipesForBuilding(buildingType);

  for (const recipe of recipes) {
    for (const input of recipe.inputs) {
      return input.resourceType;
    }
  }

  return null;
}

export function getAvailableRecipesForBuilding(engine: GameEngine, buildingId: BuildingId): RecipeId[] {
  const building = engine.getBuildings().get(buildingId);
  if (!building || !isProcessorTypeId(building.typeId)) {
    return [];
  }

  const buildingType = building.typeId === CONVERTER_BUILDING_TYPE_ID ? 'converter' : 'synthesizer';
  return getRecipesForBuilding(buildingType).map((r) => r.id);
}

export function configureProcessorWithBestRecipe(
  engine: GameEngine,
  processorId: BuildingId,
  availableResources: ResourceTypeT[],
): RecipeId | null {
  const building = engine.getBuildings().get(processorId);
  if (!building || !isProcessorTypeId(building.typeId)) {
    return null;
  }

  const buildingType = building.typeId === CONVERTER_BUILDING_TYPE_ID ? 'converter' : 'synthesizer';
  const recipes = getRecipesForBuilding(buildingType);

  for (const recipe of recipes) {
    const hasAllInputs = recipe.inputs.every((input) =>
      availableResources.includes(input.resourceType),
    );

    if (hasAllInputs) {
      const status = engine.getProcessorLogisticsStatus(processorId);
      if (!status?.badInput && !status?.missingInput && !status?.blockedOutput) {
        if (engine.setProcessorRecipe(processorId, recipe.id)) {
          return recipe.id;
        }
      }
    }
  }

  return null;
}

export function shouldConfigureProcessor(engine: GameEngine, processorId: BuildingId): boolean {
  const state = engine.getProcessorState(processorId);
  if (!state) return false;

  return state.recipeId === null;
}

export function getBaseRecipesForBuilding(buildingId: BuildingId, engine: GameEngine): RecipeId[] {
  const building = engine.getBuildings().get(buildingId);
  if (!building || !isProcessorTypeId(building.typeId)) {
    return [];
  }

  const buildingType = building.typeId === CONVERTER_BUILDING_TYPE_ID ? 'converter' : 'synthesizer';
  return getRecipesForBuilding(buildingType).map((r) => r.id);
}
