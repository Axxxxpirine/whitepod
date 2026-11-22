import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeMilestoneProgress,
  consumeMilestoneRequirements,
  findActiveMilestone,
} from '@/game/campaign/progression';
import { STORAGE_BUILDING_TYPE_ID, getBuildingType } from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { MILESTONES, getMilestone } from '@/game/data/milestoneCatalog';
import { getRecipe } from '@/game/data/recipeCatalog';
import { resourceStockKey } from '@/game/data/resourceStock';
import { GameEngine, type ResourceInventory } from '@/game/engine/GameEngine';
import {
  WORLD_STORAGE_KEY,
  clearPersistedSession,
  loadPersistedSession,
  saveWorldSession,
} from '@/game/persistence/sessionStorage';

function emptyInventory(): ResourceInventory {
  return {
    regolith: 0, hydrogen: 0, oxygen: 0,
    ironOxide: 0, aluminumOxide: 0, siliconDioxide: 0, nitrogenGas: 0,
    water: 0, methane: 0, carbonDioxide: 0, ammonia: 0, ceramicPlates: 0, carbon: 0,
  };
}

function campaign(): GameEngine {
  const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
  engine.generateMap(42);
  return engine;
}

function hubStock(engine: GameEngine): ResourceInventory {
  return engine.storageInventories.get(engine.getHubId()!)!;
}

/** Puts exactly what the active milestone requires in the hub, on top of what is there. */
function fundActiveMilestone(engine: GameEngine): void {
  for (const { resourceType, amount } of engine.getActiveMilestone()!.requirements) {
    hubStock(engine)[resourceStockKey(resourceType)!] += amount;
  }
}

describe('milestone catalog', () => {
  it('has unique ids and chapters in play order', () => {
    expect(new Set(MILESTONES.map((m) => m.id)).size).toBe(MILESTONES.length);
    for (let i = 1; i < MILESTONES.length; i++) {
      expect(MILESTONES[i]!.chapter).toBeGreaterThanOrEqual(MILESTONES[i - 1]!.chapter);
    }
  });

  it('requests each resource at most once per milestone, in positive amounts', () => {
    for (const milestone of MILESTONES) {
      expect(milestone.requirements.length, milestone.id).toBeGreaterThan(0);
      const types = milestone.requirements.map((r) => r.resourceType);
      expect(new Set(types).size, milestone.id).toBe(types.length);
      for (const requirement of milestone.requirements) {
        expect(requirement.amount, milestone.id).toBeGreaterThan(0);
        expect(resourceStockKey(requirement.resourceType), milestone.id).toBeDefined();
      }
    }
  });

  it('unlocks only known content, each item once', () => {
    const buildings = MILESTONES.flatMap((m) => m.unlocks.buildings);
    const recipes = MILESTONES.flatMap((m) => m.unlocks.recipes);

    for (const id of buildings) expect(getBuildingType(id), id).toBeDefined();
    for (const id of recipes) expect(getRecipe(id), id).toBeDefined();
    expect(new Set(buildings).size).toBe(buildings.length);
    expect(new Set(recipes).size).toBe(recipes.length);
  });

  it('covers chapters 1 to 3', () => {
    expect(new Set(MILESTONES.map((m) => m.chapter))).toEqual(new Set([1, 2, 3]));
  });
});

describe('progression rules', () => {
  const first = MILESTONES[0]!;

  it('finds the first milestone not completed', () => {
    expect(findActiveMilestone(MILESTONES, new Set())).toBe(first);
    expect(findActiveMilestone(MILESTONES, new Set([first.id]))).toBe(MILESTONES[1]);
    expect(findActiveMilestone(MILESTONES, new Set(MILESTONES.map((m) => m.id)))).toBeNull();
  });

  it('caps progress at the requirement and reports readiness', () => {
    const inventory = emptyInventory();
    const key = resourceStockKey(first.requirements[0]!.resourceType)!;
    const required = first.requirements[0]!.amount;

    inventory[key] = required - 1;
    expect(computeMilestoneProgress(first, inventory).ready).toBe(false);
    expect(computeMilestoneProgress(first, inventory).requirements[0]!.available).toBe(required - 1);

    inventory[key] = required * 3;
    expect(computeMilestoneProgress(first, inventory).ready).toBe(true);
    expect(computeMilestoneProgress(first, inventory).requirements[0]!.available).toBe(required);
  });

  it('consumes atomically', () => {
    const milestone = MILESTONES.find((m) => m.requirements.length > 1)!;
    const inventory = emptyInventory();
    const [a, b] = milestone.requirements;
    inventory[resourceStockKey(a!.resourceType)!] = a!.amount;
    inventory[resourceStockKey(b!.resourceType)!] = b!.amount - 1;
    const before = { ...inventory };

    expect(consumeMilestoneRequirements(milestone, inventory)).toBe(false);
    expect(inventory).toEqual(before);

    inventory[resourceStockKey(b!.resourceType)!] = b!.amount + 5;
    expect(consumeMilestoneRequirements(milestone, inventory)).toBe(true);
    expect(inventory[resourceStockKey(a!.resourceType)!]).toBe(0);
    expect(inventory[resourceStockKey(b!.resourceType)!]).toBe(5);
  });
});

describe('campaign milestones in the engine', () => {
  it('has no milestone in sandbox', () => {
    const engine = new GameEngine(800, 600);
    engine.generateMap(42);

    expect(engine.getActiveMilestone()).toBeNull();
    expect(engine.getMilestoneProgress()).toBeNull();
    expect(engine.completeActiveMilestone()).toBe(false);
  });

  it('starts on the first milestone', () => {
    const engine = campaign();

    expect(engine.getActiveMilestone()).toBe(MILESTONES[0]);
    expect(engine.getCompletedMilestoneIds()).toEqual([]);
  });

  it('cannot be completed early, and nothing is consumed', () => {
    const engine = campaign();
    hubStock(engine).regolith = 0;
    const before = { ...hubStock(engine) };

    expect(engine.getMilestoneProgress()!.ready).toBe(false);
    expect(engine.completeActiveMilestone()).toBe(false);
    expect(hubStock(engine)).toEqual(before);
    expect(engine.getActiveMilestone()).toBe(MILESTONES[0]);
  });

  it('counts only what the hub holds, not other storages', () => {
    const engine = campaign();
    hubStock(engine).regolith = 1000;
    const hub = engine.getBuildings().get(engine.getHubId()!)!.origin;
    let storage: number | null = null;
    for (let dx = -12; dx <= 12 && storage === null; dx++) {
      storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: hub.x + dx, y: hub.y - 8 });
    }
    expect(storage).not.toBeNull();
    hubStock(engine).regolith = 0;
    engine.storageInventories.get(storage!)!.regolith = 1000;

    expect(engine.getMilestoneProgress()!.ready).toBe(false);
  });

  it('consumes exactly the requirements, advances and notifies once', () => {
    const engine = campaign();
    const first = engine.getActiveMilestone()!;
    const leftover = hubStock(engine).regolith;
    fundActiveMilestone(engine);
    const listener = vi.fn();
    const world = vi.fn();
    engine.onMilestoneCompleted(listener);
    engine.subscribe((kind) => kind === 'world' && world());

    expect(engine.completeActiveMilestone()).toBe(true);

    expect(hubStock(engine).regolith).toBe(leftover);
    expect(engine.getCompletedMilestoneIds()).toEqual([first.id]);
    expect(engine.getActiveMilestone()).toBe(MILESTONES[1]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(first);
    expect(world).toHaveBeenCalled();
  });

  it('runs out of milestones once the catalog is done', () => {
    const engine = campaign();
    for (const milestone of MILESTONES) {
      expect(engine.getActiveMilestone()).toBe(milestone);
      fundActiveMilestone(engine);
      expect(engine.completeActiveMilestone()).toBe(true);
    }

    expect(engine.getActiveMilestone()).toBeNull();
    expect(engine.completeActiveMilestone()).toBe(false);
  });

  it('keeps completed milestones through a snapshot, dropping unknown ids', () => {
    const engine = campaign();
    fundActiveMilestone(engine);
    engine.completeActiveMilestone();
    const world = engine.serializeWorld();

    const restored = GameEngine.fromSnapshot({ ...world, completedMilestones: [...world.completedMilestones!, 'gone'] }, 800, 600);

    expect(restored.getCompletedMilestoneIds()).toEqual([MILESTONES[0]!.id]);
    expect(restored.getActiveMilestone()).toBe(MILESTONES[1]);
    expect(getMilestone('gone')).toBeUndefined();
  });

  it('treats snapshots without milestones as a fresh campaign', () => {
    const world = { ...campaign().serializeWorld() };
    delete (world as { completedMilestones?: unknown }).completedMilestones;

    expect(GameEngine.fromSnapshot(world, 800, 600).getActiveMilestone()).toBe(MILESTONES[0]);
  });
});

describe('milestone persistence', () => {
  beforeEach(() => {
    clearPersistedSession();
    window.localStorage.clear();
  });

  it('saves and reloads completed milestones', () => {
    const engine = campaign();
    fundActiveMilestone(engine);
    engine.completeActiveMilestone();
    saveWorldSession(engine, 'session-milestones');

    expect(loadPersistedSession(800, 600)?.engine.getCompletedMilestoneIds()).toEqual([MILESTONES[0]!.id]);
  });

  it('rejects a saved world with malformed milestones', () => {
    saveWorldSession(campaign(), 'session-bad-milestones');
    const stored = JSON.parse(window.localStorage.getItem(WORLD_STORAGE_KEY)!) as Record<string, unknown>;
    stored.completedMilestones = [1, 2];
    window.localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify(stored));

    expect(loadPersistedSession(800, 600)).toBeNull();
  });
});
