import { describe, expect, it } from 'vitest';
import { clearHubSite, findHubOrigin, HUB_CLEARANCE, isHubSiteClear } from '@/game/campaign/hubPlacement';
import { INITIAL_FOG_REVEAL_RADIUS, MAP_CENTER, REVEALED_FLAG } from '@/game/constants';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  HUB_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  getBuildingType,
  isStorageTypeId,
} from '@/game/data/buildingCatalog';
import { toIndex } from '@/game/data/coords';
import { GameMode } from '@/game/data/gameMode';
import { TileGrid } from '@/game/data/TileGrid';
import { GameEngine } from '@/game/engine/GameEngine';
import { toolbarEntries } from '@/game/ui/buildingPresentation';
import { PortKind, ResourceType, TileType, type TileCoord } from '@/game/types';

const HUB_FOOTPRINT = getBuildingType(HUB_BUILDING_TYPE_ID)!.footprint;

function campaignEngine(seed = 42): GameEngine {
  const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign, dayNightCycleSeconds: 1e9 });
  engine.generateMap(seed);
  return engine;
}

function hubOrigin(engine: GameEngine): TileCoord {
  const hubId = engine.getHubId();
  expect(hubId).not.toBeNull();
  return engine.getBuildings().get(hubId!)!.origin;
}

function countHubs(engine: GameEngine): number {
  return [...engine.getBuildings().values()].filter((b) => b.typeId === HUB_BUILDING_TYPE_ID).length;
}

describe('hub catalog entry', () => {
  it('is a storage-like, engine-placed, permanent 5x5 building', () => {
    const type = getBuildingType(HUB_BUILDING_TYPE_ID)!;

    expect(type.footprint).toEqual({ w: 5, h: 5 });
    expect(isStorageTypeId(HUB_BUILDING_TYPE_ID)).toBe(true);
    expect(type.systemPlaced).toBe(true);
    expect(type.permanent).toBe(true);
  });

  it('has two inputs on every side and no output', () => {
    const ports = getBuildingType(HUB_BUILDING_TYPE_ID)!.ports;

    expect(ports).toHaveLength(8);
    expect(ports.every((port) => port.kind === PortKind.Input)).toBe(true);
    for (const side of [0, 1, 2, 3]) {
      expect(ports.filter((port) => port.side === side)).toHaveLength(2);
    }
  });

  it('is not offered in the construction toolbar', () => {
    expect(toolbarEntries.some((entry) => entry.kind === 'building' && entry.typeId === HUB_BUILDING_TYPE_ID)).toBe(false);
  });
});

describe('campaign hub placement', () => {
  it('places exactly one hub on a clear, revealed site near the center for every seed', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const engine = campaignEngine(seed);
      const origin = hubOrigin(engine);

      expect(countHubs(engine), `seed ${seed}`).toBe(1);
      // Clear apart from the hub itself: deposits, terrain and fog around it.
      for (let y = origin.y - HUB_CLEARANCE; y < origin.y + HUB_FOOTPRINT.h + HUB_CLEARANCE; y++) {
        for (let x = origin.x - HUB_CLEARANCE; x < origin.x + HUB_FOOTPRINT.w + HUB_CLEARANCE; x++) {
          const index = toIndex(x, y);
          expect(engine.grid.flags[index] & REVEALED_FLAG, `seed ${seed} fog at ${x},${y}`).toBeTruthy();
          expect(engine.grid.tileType[index], `seed ${seed} terrain at ${x},${y}`).toBe(TileType.Ground);
          expect(engine.grid.resourceAmount[index], `seed ${seed} deposit at ${x},${y}`).toBe(0);
        }
      }
      const centerX = origin.x + HUB_FOOTPRINT.w / 2;
      const centerY = origin.y + HUB_FOOTPRINT.h / 2;
      expect(Math.hypot(centerX - MAP_CENTER.x, centerY - MAP_CENTER.y), `seed ${seed}`).toBeLessThan(
        INITIAL_FOG_REVEAL_RADIUS,
      );
    }
  });

  it('places the hub deterministically for a given seed', () => {
    expect(hubOrigin(campaignEngine(7))).toEqual(hubOrigin(campaignEngine(7)));
  });

  it('keeps a single hub when the map is regenerated', () => {
    const engine = campaignEngine(3);
    engine.generateMap(4);

    expect(countHubs(engine)).toBe(1);
  });

  it('starts with an empty hub inventory', () => {
    const inventory = campaignEngine().getHubInventory();

    expect(inventory).not.toBeNull();
    expect(Object.values(inventory!).every((amount) => amount === 0)).toBe(true);
  });

  it('places no hub in sandbox worlds', () => {
    const engine = new GameEngine(800, 600);
    engine.generateMap(42);

    expect(engine.getHubId()).toBeNull();
    expect(engine.getHubInventory()).toBeNull();
  });
});

describe('hub rules', () => {
  it('cannot be placed by players or tools, in any mode', () => {
    const campaign = campaignEngine();
    const sandbox = new GameEngine(800, 600);
    sandbox.grid.fill(TileType.Ground);
    sandbox.grid.revealAll();

    for (const engine of [campaign, sandbox]) {
      expect(engine.canPlaceBuilding(HUB_BUILDING_TYPE_ID, { x: 10, y: 10 })).toEqual({ ok: false, reason: 'system_placed' });
      expect(engine.placeBuilding(HUB_BUILDING_TYPE_ID, { x: 10, y: 10 })).toBeNull();
    }
    expect(countHubs(campaign)).toBe(1);
    expect(countHubs(sandbox)).toBe(0);
  });

  it('cannot be removed', () => {
    const engine = campaignEngine();
    const hubId = engine.getHubId()!;

    expect(engine.removeBuilding(hubId)).toBe(false);
    expect(engine.getHubId()).toBe(hubId);
  });

  it('survives a snapshot round trip', () => {
    const engine = campaignEngine();
    const origin = hubOrigin(engine);
    const restored = GameEngine.fromSnapshot(engine.serializeWorld(), 800, 600);

    expect(hubOrigin(restored)).toEqual(origin);
    expect(restored.getHubInventory()).toEqual(engine.getHubInventory());
  });
});

describe('hub deliveries', () => {
  function clearDeposits(engine: GameEngine): void {
    engine.grid.resourceType.fill(ResourceType.None);
    engine.grid.resourceAmount.fill(0);
  }

  /** Construction is paid in campaign: give the hub enough to build the test lines. */
  function fundHub(engine: GameEngine): void {
    engine.storageInventories.get(engine.getHubId()!)!.regolith = 1000;
  }

  it('accepts a belt on every input port', () => {
    const engine = campaignEngine();
    clearDeposits(engine);
    fundHub(engine);
    const origin = hubOrigin(engine);
    const source = engine.placeBuilding('placeholder_node_1x1', { x: origin.x - 6, y: origin.y - 6 })!;

    for (const port of getBuildingType(HUB_BUILDING_TYPE_ID)!.ports) {
      expect(
        engine.canPlaceBelt({ building: source, port: 'out_east' }, { building: engine.getHubId()!, port: port.id }).ok,
        port.id,
      ).toBe(true);
    }
  });

  it('stores what a belt delivers', () => {
    const engine = campaignEngine();
    clearDeposits(engine);
    engine.setSimulationTime(0.5);
    fundHub(engine);
    const origin = hubOrigin(engine);
    const hubId = engine.getHubId()!;

    const extractorAt = { x: origin.x - 4, y: origin.y + 1 };
    engine.placeResource(extractorAt.x, extractorAt.y, ResourceType.Regolith);
    const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, extractorAt)!;
    const solar = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: extractorAt.x, y: extractorAt.y - 2 })!;
    engine.connectBuildings(solar, extractor);
    expect(engine.placeBelt({ building: extractor, port: 'out_east' }, { building: hubId, port: 'in_west_1' }).ok).toBe(true);

    const regolithBefore = engine.getHubInventory()!.regolith;
    for (let elapsed = 0; elapsed < 6.1; elapsed += 0.1) engine.update(0.1);

    expect(engine.getHubInventory()!.regolith - regolithBefore).toBeGreaterThanOrEqual(3);
  });
});

describe('hub site search', () => {
  it('returns null when no site is revealed', () => {
    const grid = new TileGrid();
    grid.fill(TileType.Ground);

    expect(findHubOrigin(grid, HUB_FOOTPRINT, MAP_CENTER, 10)).toBeNull();
  });

  it('skips tiles vetoed by the blocker', () => {
    const grid = new TileGrid();
    grid.fill(TileType.Ground);
    grid.revealAll();
    const centered = findHubOrigin(grid, HUB_FOOTPRINT, MAP_CENTER, 10)!;
    const blocked = toIndex(MAP_CENTER.x, MAP_CENTER.y);

    const moved = findHubOrigin(grid, HUB_FOOTPRINT, MAP_CENTER, 10, (index) => index === blocked)!;

    expect(moved).not.toEqual(centered);
    expect(isHubSiteClear(grid, moved, HUB_FOOTPRINT, (index) => index === blocked)).toBe(true);
  });

  it('clears a fallback site into revealed ground without deposits', () => {
    const grid = new TileGrid();
    grid.fill(TileType.Rock);
    grid.setResource(MAP_CENTER.x, MAP_CENTER.y, ResourceType.Regolith);

    const origin = clearHubSite(grid, HUB_FOOTPRINT, MAP_CENTER);

    expect(isHubSiteClear(grid, origin, HUB_FOOTPRINT)).toBe(true);
  });
});
