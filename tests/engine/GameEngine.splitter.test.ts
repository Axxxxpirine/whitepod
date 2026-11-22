import { describe, expect, it } from 'vitest';
import {
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  SPLITTER_BASIC_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { resolveBeltFlow } from '@/game/flow/resolveBeltFlow';
import { ResourceType, TileType, type BuildingId, type PortId } from '@/game/types';

/**
 * One extractor (30/min) feeding a splitter at (10,10): east, north and south
 * outputs lead wherever each test needs.
 */

function makeEngine(): GameEngine {
  const engine = new GameEngine(800, 600, { dayNightCycleSeconds: 1e9 });
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.setSimulationTime(0.5);
  return engine;
}

function simulate(engine: GameEngine, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) engine.update(0.1);
}

function power(engine: GameEngine, consumer: BuildingId, x: number, y: number): void {
  engine.connectBuildings(engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x, y })!, consumer);
}

function belt(engine: GameEngine, from: BuildingId, fromPort: PortId, to: BuildingId, toPort: PortId): BuildingId[] {
  const result = engine.placeBelt({ building: from, port: fromPort }, { building: to, port: toPort });
  if (!result.ok) throw new Error(`belt refused: ${result.reason}`);
  return [...result.segmentIds];
}

function splitterLine(engine: GameEngine): BuildingId {
  const splitter = engine.placeBuilding(SPLITTER_BASIC_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
  engine.placeResource(4, 10, ResourceType.Regolith);
  const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 4, y: 10 })!;
  power(engine, extractor, 2, 8);
  belt(engine, extractor, 'out_east', splitter, 'in_west');
  return splitter;
}

function storageEast(engine: GameEngine, splitter: BuildingId) {
  const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 16, y: 9 })!;
  return { storage, belt: belt(engine, splitter, 'out_east', storage, 'in_west') };
}

function storageNorth(engine: GameEngine, splitter: BuildingId) {
  const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 9, y: 2 })!;
  return { storage, belt: belt(engine, splitter, 'out_north', storage, 'in_south') };
}

/** An iron converter fed from the splitter's south output, delivering to its own storage. */
function converterSouth(engine: GameEngine, splitter: BuildingId, recipe: string | null = 'iron_oxide') {
  const converter = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 14, y: 16 })!;
  power(engine, converter, 14, 14);
  if (recipe) engine.setProcessorRecipe(converter, recipe);
  const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 20, y: 16 })!;
  belt(engine, splitter, 'out_south', converter, 'in');
  belt(engine, converter, 'out', storage, 'in_west');
  return { converter, storage };
}

describe('splitter', () => {
  it('splits one line evenly between two storages', () => {
    const engine = makeEngine();
    const splitter = splitterLine(engine);
    const east = storageEast(engine, splitter);
    const north = storageNorth(engine, splitter);

    simulate(engine, 60);

    const a = engine.getStorageInventory(east.storage)!.regolith;
    const b = engine.getStorageInventory(north.storage)!.regolith;
    expect(a + b).toBeGreaterThanOrEqual(EXTRACTOR_RATE_PER_MIN - 2);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
  });

  it('skips an output that cannot take a unit: the others keep flowing', () => {
    const engine = makeEngine();
    const splitter = splitterLine(engine);
    const east = storageEast(engine, splitter);
    converterSouth(engine, splitter, null); // a converter with no recipe never pulls

    simulate(engine, 60);

    expect(engine.getStorageInventory(east.storage)!.regolith).toBeGreaterThanOrEqual(EXTRACTOR_RATE_PER_MIN - 2);
  });

  it('feeds a machine behind it, sharing the line with a storage in turn', () => {
    const engine = makeEngine();
    const splitter = splitterLine(engine);
    const east = storageEast(engine, splitter);
    const south = converterSouth(engine, splitter);

    simulate(engine, 60);

    const stored = engine.getStorageInventory(east.storage)!.regolith;
    const iron = engine.getStorageInventory(south.storage)!.ironOxide;
    expect(iron).toBeGreaterThan(5);
    expect(stored).toBeGreaterThan(5);
    expect(stored + iron).toBeGreaterThanOrEqual(EXTRACTOR_RATE_PER_MIN - 4);
  });

  it('alternates between two machines, so neither starves', () => {
    const engine = makeEngine();
    const splitter = splitterLine(engine);
    const south = converterSouth(engine, splitter);
    const north = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 14, y: 2 })!;
    power(engine, north, 14, 0);
    engine.setProcessorRecipe(north, 'iron_oxide');
    const northStorage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 20, y: 2 })!;
    belt(engine, splitter, 'out_north', north, 'in');
    belt(engine, north, 'out', northStorage, 'in_west');

    simulate(engine, 60);

    const a = engine.getStorageInventory(south.storage)!.ironOxide;
    const b = engine.getStorageInventory(northStorage)!.ironOxide;
    expect(a).toBeGreaterThan(8);
    expect(Math.abs(a - b)).toBeLessThanOrEqual(2);
  });

  it('shows each output its share of the flow', () => {
    const engine = makeEngine();
    const splitter = splitterLine(engine);
    const east = storageEast(engine, splitter);
    storageNorth(engine, splitter);
    simulate(engine, 3);

    expect(resolveBeltFlow(engine, east.belt[0]!)).toEqual([
      expect.objectContaining({ resourceType: ResourceType.Regolith, ratePerMinute: EXTRACTOR_RATE_PER_MIN / 2 }),
    ]);
    expect(engine.getResourceRates().regolith).toBe(EXTRACTOR_RATE_PER_MIN);
  });

  it('keeps its turn through a save, so the reloaded world runs identically', () => {
    const engine = makeEngine();
    const splitter = splitterLine(engine);
    storageEast(engine, splitter);
    storageNorth(engine, splitter);
    simulate(engine, 5.3);

    const restored = GameEngine.fromSnapshot(engine.serializeWorld(), 800, 600);
    simulate(engine, 30);
    simulate(restored, 30);

    expect(restored.serializeWorld()).toEqual(engine.serializeWorld());
  });

  it('is unlocked in campaign with the merger', () => {
    const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
    engine.generateMap(42);

    expect(engine.isBuildingUnlocked(SPLITTER_BASIC_BUILDING_TYPE_ID)).toBe(false);
    expect(engine.getUnlockingMilestone('buildings', SPLITTER_BASIC_BUILDING_TYPE_ID)?.id).toBe('refining_iron');
  });
});
