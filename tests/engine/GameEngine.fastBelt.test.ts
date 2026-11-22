import { describe, expect, it, vi } from 'vitest';
import {
  BELT_FAST_CAPACITY_PER_MIN,
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  beltTierOf,
} from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { Direction, ResourceType, TileType, type BeltTier, type BuildingId, type PortId } from '@/game/types';

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

/** Three extractors on a merger, the merger belted to a storage in `trunkTier`. */
function threeExtractorLine(engine: GameEngine, trunkTier: BeltTier = 'basic') {
  const merger = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
  const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 20, y: 9 })!;
  const spots: [number, number, Direction, PortId][] = [
    [6, 10, Direction.North, 'in_west'],
    [10, 6, Direction.East, 'in_north'],
    [10, 14, Direction.West, 'in_south'],
  ];
  for (const [x, y, rotation, port] of spots) {
    engine.placeResource(x, y, ResourceType.Regolith);
    const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x, y }, rotation)!;
    engine.connectBuildings(engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: x - 2, y: y - 2 })!, extractor);
    engine.placeBelt({ building: extractor, port: 'out_east' }, { building: merger, port });
  }
  const trunk = engine.placeBelt({ building: merger, port: 'out_east' }, { building: storage, port: 'in_west' }, trunkTier);
  if (!trunk.ok) throw new Error(trunk.reason);
  return { storage, trunk: trunk.segmentIds as BuildingId[] };
}

describe('fast belt', () => {
  it('places a fast route and carries what a basic belt would refuse', () => {
    const engine = makeEngine();
    const { storage, trunk } = threeExtractorLine(engine, 'fast');

    expect(trunk.every((id) => beltTierOf(engine.getBuildings().get(id)!.typeId) === 'fast')).toBe(true);
    expect(engine.getBeltRunStats(trunk[0]!)?.capacityPerMinute).toBe(BELT_FAST_CAPACITY_PER_MIN);
    simulate(engine, 60);

    expect(engine.getStorageInventory(storage)!.regolith).toBeGreaterThanOrEqual(3 * EXTRACTOR_RATE_PER_MIN - 4);
    expect(engine.getBeltRunStats(trunk[0]!)?.saturated).toBe(false);
  });

  it('upgrades a saturated route in place: same segments, same connections, more throughput', () => {
    const engine = makeEngine();
    const { storage, trunk } = threeExtractorLine(engine);
    simulate(engine, 10);
    expect(engine.getBeltRunStats(trunk[0]!)?.saturated).toBe(true);
    const connections = engine.getConnections().size;

    expect(engine.upgradeBelt(trunk[3]!, 'fast')).toBe(true);

    expect(engine.getConnections().size).toBe(connections);
    for (const id of trunk) expect(beltTierOf(engine.getBuildings().get(id)!.typeId)).toBe('fast');
    const before = engine.getStorageInventory(storage)!.regolith;
    simulate(engine, 60);
    expect(engine.getStorageInventory(storage)!.regolith - before).toBeGreaterThanOrEqual(3 * EXTRACTOR_RATE_PER_MIN - 4);
    expect(engine.getBeltRunStats(trunk[0]!)?.saturated).toBe(false);
  });

  it('upgrades only the route of the clicked segment, and refuses a route already fast', () => {
    const engine = makeEngine();
    const { trunk } = threeExtractorLine(engine);
    const feeders = [...engine.getBuildings().values()].filter(
      (b) => beltTierOf(b.typeId) === 'basic' && !trunk.includes(b.id),
    );

    engine.upgradeBelt(trunk[0]!, 'fast');

    expect(feeders.every((b) => beltTierOf(engine.getBuildings().get(b.id)!.typeId) === 'basic')).toBe(true);
    expect(engine.quoteBeltUpgrade(trunk[0]!, 'fast')).toEqual({ ok: false, reason: 'already_tier' });
  });

  // Campaign worlds are made from a sandbox layout loaded as campaign: no
  // milestone unlocks the fast belt yet (chapter 3, #94).
  it('stays locked in campaign until a milestone unlocks it', () => {
    const sandboxLine = makeEngine();
    const { trunk } = threeExtractorLine(sandboxLine);
    const restored = GameEngine.fromSnapshot({ ...sandboxLine.serializeWorld(), gameMode: GameMode.Campaign }, 800, 600);

    expect(restored.quoteBeltUpgrade(trunk[0]!, 'fast')).toEqual({ ok: false, reason: 'locked' });
    expect(restored.upgradeBelt(trunk[0]!, 'fast')).toBe(false);
  });

  it('charges only the difference in campaign: one iron oxide per segment', () => {
    const sandboxLine = makeEngine();
    const { storage, trunk } = threeExtractorLine(sandboxLine);
    const engine = GameEngine.fromSnapshot({ ...sandboxLine.serializeWorld(), gameMode: GameMode.Campaign }, 800, 600);
    vi.spyOn(engine, 'isBuildingUnlocked').mockReturnValue(true);
    // No hub on this test map: the storage is the whole wallet.
    const stock = engine.getStorageInventory(storage)!;

    const quote = engine.quoteBeltUpgrade(trunk[0]!, 'fast');
    expect(quote).toMatchObject({ ok: true, net: [{ resourceType: ResourceType.IronOxide, amount: trunk.length }], refund: [] });
    expect(engine.upgradeBelt(trunk[0]!, 'fast')).toBe(false);

    engine.storageInventories.get(storage)!.ironOxide = trunk.length;
    const regolith = stock.regolith;
    expect(engine.upgradeBelt(trunk[0]!, 'fast')).toBe(true);
    expect(engine.getStorageInventory(storage)).toMatchObject({ ironOxide: 0, regolith });
  });

  it('keeps fast belts and their capacity through a save', () => {
    const engine = makeEngine();
    const { trunk } = threeExtractorLine(engine);
    engine.upgradeBelt(trunk[0]!, 'fast');

    const restored = GameEngine.fromSnapshot(engine.serializeWorld(), 800, 600);

    expect(restored.getBeltRunStats(trunk[0]!)?.capacityPerMinute).toBe(BELT_FAST_CAPACITY_PER_MIN);
  });
});
