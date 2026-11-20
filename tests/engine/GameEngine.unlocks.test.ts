import { describe, expect, it } from 'vitest';
import { computeUnlocks, findUnlockingMilestone } from '@/game/campaign/unlocks';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  getAllBuildingTypes,
  getBuildingType,
} from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { MILESTONES, STARTING_UNLOCKS, getMilestone } from '@/game/data/milestoneCatalog';
import { getRecipesForBuilding } from '@/game/data/recipeCatalog';
import { resourceStockKey } from '@/game/data/resourceStock';
import { GameEngine } from '@/game/engine/GameEngine';
import type { TileCoord } from '@/game/types';

const RECIPES = [...getRecipesForBuilding('converter'), ...getRecipesForBuilding('synthesizer')];

function campaign(): GameEngine {
  const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
  engine.generateMap(42);
  return engine;
}

function hubStock(engine: GameEngine) {
  return engine.storageInventories.get(engine.getHubId()!)!;
}

/** Completes active milestones, funding each one, until `id` is completed. */
function completeThrough(engine: GameEngine, id: string): void {
  while (!engine.getCompletedMilestoneIds().includes(id)) {
    for (const { resourceType, amount } of engine.getActiveMilestone()!.requirements) {
      hubStock(engine)[resourceStockKey(resourceType)!] += amount;
    }
    expect(engine.completeActiveMilestone()).toBe(true);
  }
}

/** First spot around the hub where the building can be placed. */
function findSpot(engine: GameEngine, typeId: string): TileCoord {
  const hub = engine.getBuildings().get(engine.getHubId()!)!.origin;
  for (let dy = -14; dy <= 14; dy++) {
    for (let dx = -14; dx <= 14; dx++) {
      const at = { x: hub.x + dx, y: hub.y + dy };
      if (engine.canPlaceBuilding(typeId, at).ok) return at;
    }
  }
  throw new Error(`no spot for ${typeId}`);
}

describe('unlock rules', () => {
  it('starts from the starting content and adds completed milestones only', () => {
    const [first, second] = MILESTONES;
    const unlocks = computeUnlocks(MILESTONES, new Set([second!.id]), STARTING_UNLOCKS);

    for (const id of STARTING_UNLOCKS.buildings) expect(unlocks.buildings.has(id)).toBe(true);
    for (const id of second!.unlocks.buildings) expect(unlocks.buildings.has(id)).toBe(true);
    for (const id of first!.unlocks.buildings) expect(unlocks.buildings.has(id)).toBe(false);
  });

  it('names the milestone that unlocks a piece of content', () => {
    expect(findUnlockingMilestone(MILESTONES, 'buildings', CONVERTER_BUILDING_TYPE_ID)?.id).toBe('landing_refinery');
    expect(findUnlockingMilestone(MILESTONES, 'recipes', 'iron_oxide')?.id).toBe('landing_refinery');
    expect(findUnlockingMilestone(MILESTONES, 'buildings', STARTING_UNLOCKS.buildings[0]!)).toBeNull();
  });

  it('never unlocks starting content again through a milestone', () => {
    const fromMilestones = new Set(MILESTONES.flatMap((m) => m.unlocks.buildings));
    for (const id of STARTING_UNLOCKS.buildings) {
      expect(getBuildingType(id), id).toBeDefined();
      expect(fromMilestones.has(id), id).toBe(false);
    }
  });
});

describe('campaign unlocks in the engine', () => {
  it('unlocks everything in sandbox', () => {
    const engine = new GameEngine(800, 600);
    engine.generateMap(42);

    for (const type of getAllBuildingTypes()) expect(engine.isBuildingUnlocked(type.id), type.id).toBe(true);
    for (const recipe of RECIPES) expect(engine.isRecipeUnlocked(recipe.id), recipe.id).toBe(true);
  });

  it('starts a campaign with the starting content only', () => {
    const engine = campaign();
    const starting = new Set<string>(STARTING_UNLOCKS.buildings);

    for (const type of getAllBuildingTypes()) {
      expect(engine.isBuildingUnlocked(type.id), type.id).toBe(starting.has(type.id));
    }
    for (const recipe of RECIPES) expect(engine.isRecipeUnlocked(recipe.id), recipe.id).toBe(false);
  });

  it('refuses to place a locked building, whatever the stock', () => {
    const engine = campaign();
    hubStock(engine).regolith = 1000;
    hubStock(engine).oxygen = 1000;
    const hub = engine.getBuildings().get(engine.getHubId()!)!.origin;
    const at = { x: hub.x - 6, y: hub.y };

    expect(engine.canPlaceBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, at)).toEqual({ ok: false, reason: 'locked' });
    expect(engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, at)).toBeNull();
  });

  it('unlocks a building once its milestone is completed', () => {
    const engine = campaign();
    const unlocking = getMilestone('landing_first_extraction')!;
    expect(unlocking.unlocks.buildings).toContain(BATTERY_BASIC_BUILDING_TYPE_ID);

    completeThrough(engine, unlocking.id);
    hubStock(engine).regolith = 1000;
    hubStock(engine).oxygen = 1000;

    expect(engine.isBuildingUnlocked(BATTERY_BASIC_BUILDING_TYPE_ID)).toBe(true);
    expect(engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, findSpot(engine, BATTERY_BASIC_BUILDING_TYPE_ID))).not.toBeNull();
  });

  it('only lets processors run unlocked recipes', () => {
    const engine = campaign();
    completeThrough(engine, 'landing_refinery');
    hubStock(engine).regolith = 1000;
    hubStock(engine).oxygen = 1000;
    const converter = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, findSpot(engine, CONVERTER_BUILDING_TYPE_ID))!;
    expect(converter).not.toBeNull();

    expect(engine.setProcessorRecipe(converter, 'silicon_dioxide')).toBe(false);
    expect(engine.getProcessorState(converter)?.recipeId).toBeNull();
    expect(engine.setProcessorRecipe(converter, 'iron_oxide')).toBe(true);
    expect(engine.setProcessorRecipe(converter, null)).toBe(true);

    completeThrough(engine, 'refining_iron');
    expect(engine.setProcessorRecipe(converter, 'silicon_dioxide')).toBe(true);
  });

  it('keeps unlocks through a snapshot', () => {
    const engine = campaign();
    completeThrough(engine, 'landing_first_extraction');

    const restored = GameEngine.fromSnapshot(engine.serializeWorld(), 800, 600);

    expect(restored.isBuildingUnlocked(BATTERY_BASIC_BUILDING_TYPE_ID)).toBe(true);
    expect(restored.isBuildingUnlocked(CONVERTER_BUILDING_TYPE_ID)).toBe(false);
  });
});
