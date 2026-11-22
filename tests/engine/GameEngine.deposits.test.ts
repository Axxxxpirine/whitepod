import { describe, expect, it } from 'vitest';
import { MAP_CENTER, RESOURCE_DEPOSIT_AMOUNT } from '@/game/constants';
import { toCoord, toIndex } from '@/game/data/coords';
import { EXTRACTOR_BUILDING_TYPE_ID, SOLAR_PANEL_BUILDING_TYPE_ID, STORAGE_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { DEPOSIT_BASE_AMOUNT, RICH_VEIN_MIN_DISTANCE, depositAmountAt, isRichVein } from '@/game/data/depositAmounts';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine, type SerializedGameWorld } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';

/**
 * An extractor on a deposit of `amount` units, belted to a storage. Built in
 * sandbox (free, unlocked) then loaded in `gameMode`, as campaign placement
 * would need a hub, costs and unlocks.
 */
function line(gameMode: GameMode, amount: number) {
  const sandbox = new GameEngine(800, 600, { dayNightCycleSeconds: 1e9 });
  sandbox.grid.fill(TileType.Ground);
  sandbox.grid.revealAll();
  sandbox.setSimulationTime(0.5);
  sandbox.placeResource(4, 10, ResourceType.Regolith);
  sandbox.grid.resourceAmount[toIndex(4, 10)] = amount;
  const extractor = sandbox.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 4, y: 10 })!;
  sandbox.connectBuildings(sandbox.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 2, y: 8 })!, extractor);
  const storage = sandbox.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 10, y: 9 })!;
  sandbox.placeBelt({ building: extractor, port: 'out_east' }, { building: storage, port: 'in_west' });
  const engine = GameEngine.fromSnapshot({ ...sandbox.serializeWorld(), gameMode }, 800, 600);
  return { engine, extractor, storage };
}

function simulate(engine: GameEngine, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) engine.update(0.1);
}

describe('deposit amounts', () => {
  it('grows with the distance from the centre, with rich veins only outside the initial reveal', () => {
    expect(depositAmountAt(MAP_CENTER.x, MAP_CENTER.y, 42)).toBe(DEPOSIT_BASE_AMOUNT);
    expect(depositAmountAt(MAP_CENTER.x + 20, MAP_CENTER.y, 42)).toBeGreaterThan(DEPOSIT_BASE_AMOUNT);

    let rich = 0;
    for (let y = 0; y < 256; y += 3) {
      for (let x = 0; x < 256; x += 3) {
        if (!isRichVein(x, y, 42)) continue;
        rich++;
        expect(Math.hypot(x - MAP_CENTER.x, y - MAP_CENTER.y)).toBeGreaterThanOrEqual(RICH_VEIN_MIN_DISTANCE);
        expect(depositAmountAt(x, y, 42)).toBeGreaterThan(3 * DEPOSIT_BASE_AMOUNT);
      }
    }
    expect(rich).toBeGreaterThan(0);
  });

  it('gives every generated deposit its amount, the same for the same seed', () => {
    const engine = new GameEngine(800, 600);
    engine.generateMap(7);
    const again = new GameEngine(800, 600);
    again.generateMap(7);

    let deposits = 0;
    for (let index = 0; index < engine.grid.resourceType.length; index++) {
      if (engine.grid.resourceType[index] === ResourceType.None) continue;
      deposits++;
      const { x, y } = toCoord(index);
      expect(engine.grid.resourceAmount[index]).toBe(depositAmountAt(x, y, 7));
    }
    expect(deposits).toBeGreaterThan(100);
    expect(again.grid.resourceAmount).toEqual(engine.grid.resourceAmount);
  });

  it('starts campaigns with full deposits near the hub', () => {
    const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
    engine.generateMap(42);
    const hub = engine.getBuildings().get(engine.getHubId()!)!.origin;

    for (let y = hub.y - 12; y < hub.y + 17; y++) {
      for (let x = hub.x - 12; x < hub.x + 17; x++) {
        if (engine.grid.getResource(x, y) === ResourceType.None) continue;
        expect(engine.grid.getResourceAmount(x, y), `${x},${y}`).toBeGreaterThanOrEqual(RESOURCE_DEPOSIT_AMOUNT);
      }
    }
  });
});

describe('finite deposits', () => {
  it('uses up a deposit in campaign, then stops the extractor', () => {
    const { engine, extractor, storage } = line(GameMode.Campaign, 3);

    simulate(engine, 20);

    expect(engine.getStorageInventory(storage)!.regolith).toBe(3);
    expect(engine.getDepositRemaining(extractor)).toBe(0);
    expect(engine.getResourceRates().regolith).toBe(0);
  });

  it('refuses a new extractor on an exhausted deposit', () => {
    const { engine, extractor } = line(GameMode.Campaign, 1);
    simulate(engine, 5);
    engine.removeBuilding(extractor);
    engine.storageInventories.values().next().value!.regolith = 100;

    expect(engine.canPlaceBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 4, y: 10 })).toEqual({ ok: false, reason: 'resource_required' });
  });

  it('never runs out in sandbox', () => {
    const { engine, extractor, storage } = line(GameMode.Sandbox, 3);

    simulate(engine, 20);

    expect(engine.getStorageInventory(storage)!.regolith).toBeGreaterThan(3);
    expect(engine.getDepositRemaining(extractor)).toBe(3);
  });

  it('saves what is left in each deposit', () => {
    const { engine, extractor } = line(GameMode.Campaign, 50);
    simulate(engine, 10);

    const restored = GameEngine.fromSnapshot(engine.serializeWorld(), 800, 600);

    expect(restored.getDepositRemaining(extractor)).toBe(engine.getDepositRemaining(extractor));
    expect(restored.getDepositRemaining(extractor)).toBeLessThan(50);
  });

  it('gives a save from the endless-deposit days its generated amounts', () => {
    const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
    engine.generateMap(42);
    // Saves of that time held 100 everywhere and had no deposit model.
    for (let index = 0; index < engine.grid.resourceType.length; index++) {
      if (engine.grid.resourceType[index] !== ResourceType.None) engine.grid.resourceAmount[index] = 100;
    }
    const legacy: SerializedGameWorld = { ...engine.serializeWorld(), depositModel: undefined };

    const restored = GameEngine.fromSnapshot(legacy, 800, 600);

    for (let index = 0; index < restored.grid.resourceType.length; index++) {
      if (restored.grid.resourceType[index] === ResourceType.None) continue;
      const { x, y } = toCoord(index);
      expect(restored.grid.resourceAmount[index]).toBe(depositAmountAt(x, y, 42));
    }
  });
});
