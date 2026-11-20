import { describe, expect, it } from 'vitest';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getAllBuildingTypes,
  getBuildingType,
  isBeltTypeId,
} from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';

const STORAGE_COST = getBuildingType(STORAGE_BUILDING_TYPE_ID)!.cost!;
const STORAGE_REGOLITH = STORAGE_COST.find((line) => line.resourceType === ResourceType.Regolith)!.amount;

function campaign(): GameEngine {
  const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
  engine.generateMap(42);
  engine.grid.resourceType.fill(ResourceType.None);
  engine.grid.resourceAmount.fill(0);
  return engine;
}

function hubStock(engine: GameEngine) {
  return engine.storageInventories.get(engine.getHubId()!)!;
}

/** A free spot west of the hub, inside the initial reveal. */
function spotNearHub(engine: GameEngine, dx: number, dy = 0) {
  const hub = engine.getBuildings().get(engine.getHubId()!)!;
  return { x: hub.origin.x - 8 + dx, y: hub.origin.y + dy };
}

/** An extractor and a storage a few tiles apart, west of the hub: both ends of a belt. */
function placeBeltEnds(engine: GameEngine) {
  const at = spotNearHub(engine, 0);
  engine.placeResource(at.x, at.y, ResourceType.Regolith);
  const source = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, at)!;
  const target = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, spotNearHub(engine, 3, -1))!;
  expect(source).not.toBeNull();
  expect(target).not.toBeNull();
  return { source, target };
}

describe('construction cost catalog', () => {
  it('prices every player building except dev placeholders', () => {
    const unpriced = getAllBuildingTypes()
      .filter((type) => !type.systemPlaced && !type.id.startsWith('placeholder_'))
      .filter((type) => !type.cost || type.cost.length === 0)
      .map((type) => type.id);

    expect(unpriced).toEqual([]);
  });

  it('uses positive amounts only', () => {
    for (const type of getAllBuildingTypes()) {
      for (const line of type.cost ?? []) {
        expect(line.amount, type.id).toBeGreaterThan(0);
      }
    }
  });

  it('charges belts per segment', () => {
    const beltTypes = getAllBuildingTypes().filter((type) => isBeltTypeId(type.id));

    expect(beltTypes.length).toBe(3);
    for (const type of beltTypes) expect(type.cost, type.id).toEqual(beltTypes[0]!.cost);
  });
});

describe('campaign construction costs', () => {
  it('refuses a building the stock cannot pay, without charging anything', () => {
    const engine = campaign();
    hubStock(engine).regolith = STORAGE_REGOLITH - 1;
    const at = spotNearHub(engine, 0, -4);

    expect(engine.canPlaceBuilding(STORAGE_BUILDING_TYPE_ID, at)).toEqual({ ok: false, reason: 'insufficient_resources' });
    expect(engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, at)).toBeNull();
    expect(hubStock(engine).regolith).toBe(STORAGE_REGOLITH - 1);
  });

  it('deducts exactly the cost when placing', () => {
    const engine = campaign();
    hubStock(engine).regolith = STORAGE_REGOLITH + 7;

    expect(engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, spotNearHub(engine, 0, -4))).not.toBeNull();
    expect(hubStock(engine).regolith).toBe(7);
  });

  it('draws from the hub first, then storages by id (global stock)', () => {
    const engine = campaign();
    hubStock(engine).regolith = STORAGE_REGOLITH;
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, spotNearHub(engine, 0, -4))!;
    engine.storageInventories.get(storage)!.regolith = 30;
    hubStock(engine).regolith = 5;

    const extractorAt = spotNearHub(engine, 0, 2);
    engine.placeResource(extractorAt.x, extractorAt.y, ResourceType.Regolith);
    expect(engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, extractorAt)).not.toBeNull();

    const extractorRegolith = getBuildingType(EXTRACTOR_BUILDING_TYPE_ID)!.cost![0]!.amount;
    expect(hubStock(engine).regolith).toBe(0);
    expect(engine.storageInventories.get(storage)!.regolith).toBe(30 - (extractorRegolith - 5));
  });

  it('refunds the full cost into the hub on removal', () => {
    const engine = campaign();
    hubStock(engine).regolith = STORAGE_REGOLITH;
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, spotNearHub(engine, 0, -4))!;

    expect(engine.removeBuilding(storage)).toBe(true);
    expect(hubStock(engine).regolith).toBe(STORAGE_REGOLITH);
  });

  it('charges a belt route per segment and refunds the whole chain', () => {
    const engine = campaign();
    hubStock(engine).regolith = 1000;
    const { source, target } = placeBeltEnds(engine);
    hubStock(engine).regolith = 1000;

    const result = engine.placeBelt({ building: source, port: 'out_east' }, { building: target, port: 'in_west' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const routeCost = engine.getBeltRouteCost(result.plan.segments)[0]!.amount;
    expect(routeCost).toBe(result.segmentIds.length);
    expect(hubStock(engine).regolith).toBe(1000 - routeCost);

    expect(engine.removeBelt(result.segmentIds[0]!)).toBe(true);
    expect(hubStock(engine).regolith).toBe(1000);
  });

  it('refuses a belt route the stock cannot fully pay and places nothing', () => {
    const engine = campaign();
    hubStock(engine).regolith = 1000;
    const { source, target } = placeBeltEnds(engine);
    // The route needs at least two segments: one Regolith is not enough.
    hubStock(engine).regolith = 1;
    const buildingsBefore = engine.getBuildings().size;

    const from = { building: source, port: 'out_east' };
    const to = { building: target, port: 'in_west' };
    expect(engine.canPlaceBelt(from, to)).toEqual({ ok: false, reason: 'insufficient_resources' });
    expect(engine.placeBelt(from, to)).toEqual({ ok: false, reason: 'insufficient_resources' });
    expect(engine.getBuildings().size).toBe(buildingsBefore);
    expect(hubStock(engine).regolith).toBe(1);
  });

  it('does not refund a removed storage into itself', () => {
    const engine = campaign();
    hubStock(engine).regolith = STORAGE_REGOLITH;
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, spotNearHub(engine, 0, -4))!;
    engine.storageInventories.get(storage)!.oxygen = 9;

    engine.removeBuilding(storage);

    expect(engine.storageInventories.has(storage)).toBe(false);
    expect(hubStock(engine).regolith).toBe(STORAGE_REGOLITH);
  });
});

describe('sandbox stays free', () => {
  it('places and removes without any stock', () => {
    const engine = new GameEngine(800, 600);
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();

    expect(engine.getBuildingCost(STORAGE_BUILDING_TYPE_ID)).toEqual([]);
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 10, y: 10 });
    expect(storage).not.toBeNull();
    expect(engine.removeBuilding(storage!)).toBe(true);
  });
});
