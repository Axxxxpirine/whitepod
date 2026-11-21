import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_START_TIME,
  STARTING_DEPOSITS,
  STARTING_DEPOSIT_RADIUS,
  STARTING_KIT,
  ensureStartingDeposits,
} from '@/game/campaign/campaignStart';
import { HUB_CLEARANCE } from '@/game/campaign/hubPlacement';
import { MAP_CENTER, REVEALED_FLAG } from '@/game/constants';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  HUB_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
} from '@/game/data/buildingCatalog';
import { resourceStockKey } from '@/game/data/resourceStock';
import { toIndex } from '@/game/data/coords';
import { GameMode } from '@/game/data/gameMode';
import { TileGrid } from '@/game/data/TileGrid';
import { GameEngine } from '@/game/engine/GameEngine';
import { getDaylightFactor } from '@/game/renderer/DayNightOverlayRenderer';
import { Direction, ResourceType, TileType, type TileCoord } from '@/game/types';

const HUB_FOOTPRINT = getBuildingType(HUB_BUILDING_TYPE_ID)!.footprint;

function campaignEngine(seed: number): GameEngine {
  const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign, dayNightCycleSeconds: 1e9 });
  engine.generateMap(seed);
  return engine;
}

function hubOrigin(engine: GameEngine): TileCoord {
  return engine.getBuildings().get(engine.getHubId()!)!.origin;
}

function distanceToHub(tile: TileCoord, origin: TileCoord): number {
  const dx = Math.max(origin.x - tile.x, 0, tile.x - (origin.x + HUB_FOOTPRINT.w - 1));
  const dy = Math.max(origin.y - tile.y, 0, tile.y - (origin.y + HUB_FOOTPRINT.h - 1));
  return Math.max(dx, dy);
}

/** Usable deposit tiles of a type near the hub, nearest first. */
function depositsNearHub(engine: GameEngine, resourceType: ResourceType): TileCoord[] {
  const origin = hubOrigin(engine);
  const tiles: TileCoord[] = [];
  for (let y = origin.y - STARTING_DEPOSIT_RADIUS; y < origin.y + HUB_FOOTPRINT.h + STARTING_DEPOSIT_RADIUS; y++) {
    for (let x = origin.x - STARTING_DEPOSIT_RADIUS; x < origin.x + HUB_FOOTPRINT.w + STARTING_DEPOSIT_RADIUS; x++) {
      const distance = distanceToHub({ x, y }, origin);
      if (distance <= HUB_CLEARANCE || distance > STARTING_DEPOSIT_RADIUS) continue;
      const index = toIndex(x, y);
      if (!(engine.grid.flags[index] & REVEALED_FLAG)) continue;
      if (engine.grid.tileType[index] !== TileType.Ground) continue;
      if (engine.grid.resourceType[index] !== resourceType || engine.grid.resourceAmount[index] === 0) continue;
      if (engine.getBuildingAt(x, y)) continue;
      tiles.push({ x, y });
    }
  }
  return tiles.sort((a, b) => distanceToHub(a, origin) - distanceToHub(b, origin));
}

/** First spot around the hub where the building can be placed (cost included). */
function findSpot(engine: GameEngine, typeId: string): TileCoord | null {
  const origin = hubOrigin(engine);
  for (let distance = 3; distance <= 16; distance++) {
    for (let y = origin.y - distance; y <= origin.y + HUB_FOOTPRINT.h + distance; y++) {
      for (let x = origin.x - distance; x <= origin.x + HUB_FOOTPRINT.w + distance; x++) {
        if (distanceToHub({ x, y }, origin) !== distance) continue;
        if (engine.canPlaceBuilding(typeId, { x, y }).ok) return { x, y };
      }
    }
  }
  return null;
}

describe('starting kit', () => {
  it('credits the kit to the hub once', () => {
    const engine = campaignEngine(42);
    const stock = engine.getHubInventory()!;

    for (const line of STARTING_KIT) {
      expect(stock[resourceStockKey(line.resourceType)!]).toBe(line.amount);
    }

    engine.generateMap(43);
    expect(engine.getHubInventory()).toEqual(stock);
  });

  it('starts campaigns in the morning, with panels already producing; sandbox keeps midnight', () => {
    const campaign = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
    campaign.generateMap(42);
    expect(campaign.simulationTime).toBeCloseTo(CAMPAIGN_START_TIME);
    expect(getDaylightFactor(campaign.simulationTime)).toBeGreaterThan(0.5);

    const sandbox = new GameEngine(800, 600);
    sandbox.generateMap(42);
    expect(sandbox.simulationTime).toBe(0);
  });

  it('is not credited in sandbox', () => {
    const engine = new GameEngine(800, 600);
    engine.generateMap(42);

    expect(engine.getResourceCounts().regolith).toBe(0);
  });

  it('guarantees the starting deposits near the hub for every seed', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const engine = campaignEngine(seed);
      for (const requirement of STARTING_DEPOSITS) {
        expect(
          depositsNearHub(engine, requirement.resourceType).length,
          `seed ${seed} resource ${requirement.resourceType}`,
        ).toBeGreaterThanOrEqual(requirement.minTiles);
      }
    }
  });

  const FIRST_LINE_EXTRACTORS = [ResourceType.Regolith, ResourceType.Regolith, ResourceType.Oxygen, ResourceType.Oxygen];
  const FIRST_LINE_SOLAR_PANELS = 6;

  /** Cheapest planned belt route from an extractor at `at` to any hub input, trying every rotation. */
  function cheapestRouteToHub(engine: GameEngine, at: TileCoord): number | null {
    const hubId = engine.getHubId()!;
    let best: number | null = null;
    for (const rotation of [Direction.North, Direction.East, Direction.South, Direction.West]) {
      const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, at, rotation);
      if (extractor === null) continue;
      for (const port of getBuildingType(HUB_BUILDING_TYPE_ID)!.ports) {
        const planned = engine.canPlaceBelt({ building: extractor, port: 'out_east' }, { building: hubId, port: port.id });
        if (!planned.ok) continue;
        const cost = engine.getBeltRouteCost(planned.plan.segments).reduce((sum, line) => sum + line.amount, 0);
        if (best === null || cost < best) best = cost;
      }
      engine.removeBuilding(extractor);
    }
    return best;
  }

  it('covers the cost of a first line for every seed', () => {
    const regolith = (typeId: string, engine: GameEngine) =>
      engine.getBuildingCost(typeId).find((line) => line.resourceType === ResourceType.Regolith)?.amount ?? 0;

    for (let seed = 1; seed <= 12; seed++) {
      const engine = campaignEngine(seed);
      let total =
        FIRST_LINE_EXTRACTORS.length * regolith(EXTRACTOR_BUILDING_TYPE_ID, engine) +
        FIRST_LINE_SOLAR_PANELS * regolith(SOLAR_PANEL_BUILDING_TYPE_ID, engine) +
        regolith(STORAGE_BUILDING_TYPE_ID, engine);

      const used = new Set<string>();
      for (const resourceType of FIRST_LINE_EXTRACTORS) {
        const at = depositsNearHub(engine, resourceType).find((tile) => !used.has(`${tile.x},${tile.y}`));
        expect(at, `seed ${seed} deposit ${resourceType}`).toBeDefined();
        used.add(`${at!.x},${at!.y}`);
        const route = cheapestRouteToHub(engine, at!);
        expect(route, `seed ${seed} route from ${at!.x},${at!.y}`).not.toBeNull();
        total += route!;
      }

      expect(engine.getHubInventory()!.regolith, `seed ${seed} first line costs ${total}`).toBeGreaterThanOrEqual(total);
    }
  });

  it('builds a first line end to end: extractors belted to the hub, solar panels and a storage', () => {
    const engine = campaignEngine(1);
    const hubId = engine.getHubId()!;
    const hubPorts = getBuildingType(HUB_BUILDING_TYPE_ID)!.ports.map((port) => port.id);

    // Extractors first, like a player planning the line: belts routed
    // afterwards may cross deposit tiles, so they must not come first.
    const extractors: TileCoord[] = [];
    for (const resourceType of FIRST_LINE_EXTRACTORS) {
      const at = depositsNearHub(engine, resourceType)[0]!;
      expect(engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, at)).not.toBeNull();
      extractors.push(at);
    }

    // Then belt each one to the hub, rotating it when its output is blocked
    // (e.g. two deposits side by side), as a player would.
    for (const at of extractors) {
      let connected = false;
      for (const rotation of [Direction.North, Direction.East, Direction.South, Direction.West]) {
        engine.removeBuilding(engine.getBuildingAt(at.x, at.y)!.id);
        const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, at, rotation)!;
        connected = hubPorts.some(
          (port) => engine.placeBelt({ building: extractor, port: 'out_east' }, { building: hubId, port }).ok,
        );
        if (connected) break;
      }
      expect(connected, `belt from ${at.x},${at.y}`).toBe(true);
    }

    for (let i = 0; i < FIRST_LINE_SOLAR_PANELS; i++) {
      const spot = findSpot(engine, SOLAR_PANEL_BUILDING_TYPE_ID);
      expect(spot, `solar ${i}`).not.toBeNull();
      expect(engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, spot!)).not.toBeNull();
    }
    const storageSpot = findSpot(engine, STORAGE_BUILDING_TYPE_ID);
    expect(storageSpot).not.toBeNull();
    expect(engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, storageSpot!)).not.toBeNull();
    expect(engine.getHubInventory()!.regolith).toBeGreaterThanOrEqual(0);
  });
});

describe('ensureStartingDeposits', () => {
  function revealedGround(): TileGrid {
    const grid = new TileGrid();
    grid.fill(TileType.Ground);
    grid.revealAll();
    return grid;
  }

  const origin = { x: MAP_CENTER.x - 2, y: MAP_CENTER.y - 2 };

  it('adds exactly the missing tiles of each type, on different sides of the hub', () => {
    const grid = revealedGround();

    const added = ensureStartingDeposits(grid, origin, HUB_FOOTPRINT);

    expect(added).toHaveLength(STARTING_DEPOSITS.reduce((sum, requirement) => sum + requirement.minTiles, 0));
    const byType = STARTING_DEPOSITS.map((requirement) =>
      added.filter((tile) => grid.getResource(tile.x, tile.y) === requirement.resourceType),
    );
    byType.forEach((tiles, index) => expect(tiles, `requirement ${index}`).toHaveLength(STARTING_DEPOSITS[index]!.minTiles));
    const [first, second] = byType.map((tiles) => tiles[0]!);
    expect(Math.hypot(first!.x - second!.x, first!.y - second!.y)).toBeGreaterThan(HUB_FOOTPRINT.w);
  });

  it('adds nothing when the requirements are already met', () => {
    const grid = revealedGround();
    ensureStartingDeposits(grid, origin, HUB_FOOTPRINT);

    expect(ensureStartingDeposits(grid, origin, HUB_FOOTPRINT)).toEqual([]);
  });

  it('never adds deposits on blocked or fogged tiles', () => {
    const grid = new TileGrid();
    grid.fill(TileType.Ground);

    expect(ensureStartingDeposits(grid, origin, HUB_FOOTPRINT)).toEqual([]);

    const revealed = revealedGround();
    expect(ensureStartingDeposits(revealed, origin, HUB_FOOTPRINT, () => true)).toEqual([]);
  });
});
