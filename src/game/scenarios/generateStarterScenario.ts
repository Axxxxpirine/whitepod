import { GRID_HEIGHT, GRID_WIDTH, TILE_SIZE } from '@/game/constants';
import { mulberry32 } from '@/game/data/SeededRNG';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { GameEngine } from '@/game/engine/GameEngine';
import { Direction, ResourceType, type BuildingId, type BuildingTypeId, type TileCoord } from '@/game/types';
import type { PreparedScenarioResult } from './types';

interface LayoutTemplate {
  readonly extractorDeposits: readonly { readonly dx: number; readonly dy: number; readonly type: ResourceType }[];
  readonly visibleDeposits: readonly { readonly dx: number; readonly dy: number; readonly type: ResourceType }[];
  readonly solarTargets: readonly { readonly dx: number; readonly dy: number }[];
  readonly batteryTarget: { readonly dx: number; readonly dy: number };
}

const STARTER_LAYOUTS: readonly LayoutTemplate[] = [
  {
    extractorDeposits: [
      { dx: -5, dy: -1, type: ResourceType.Coal },
      { dx: 5, dy: 0, type: ResourceType.IronOre },
    ],
    visibleDeposits: [
      { dx: -2, dy: 6, type: ResourceType.Coal },
      { dx: 3, dy: 7, type: ResourceType.CopperOre },
      { dx: 7, dy: -5, type: ResourceType.IronOre },
    ],
    solarTargets: [
      { dx: -1, dy: 2 },
      { dx: 1, dy: 2 },
      { dx: 0, dy: 5 },
    ],
    batteryTarget: { dx: -1, dy: 3 },
  },
  {
    extractorDeposits: [
      { dx: -1, dy: -5, type: ResourceType.Coal },
      { dx: 0, dy: 5, type: ResourceType.IronOre },
    ],
    visibleDeposits: [
      { dx: 6, dy: -2, type: ResourceType.Coal },
      { dx: 7, dy: 3, type: ResourceType.CopperOre },
      { dx: -6, dy: 6, type: ResourceType.IronOre },
    ],
    solarTargets: [
      { dx: 2, dy: -1 },
      { dx: 2, dy: 1 },
      { dx: 5, dy: 0 },
    ],
    batteryTarget: { dx: 3, dy: -1 },
  },
  {
    extractorDeposits: [
      { dx: -6, dy: 1, type: ResourceType.Coal },
      { dx: 4, dy: -3, type: ResourceType.IronOre },
    ],
    visibleDeposits: [
      { dx: 1, dy: 7, type: ResourceType.Coal },
      { dx: 6, dy: 5, type: ResourceType.CopperOre },
      { dx: -7, dy: -5, type: ResourceType.IronOre },
    ],
    solarTargets: [
      { dx: -1, dy: 3 },
      { dx: 2, dy: 2 },
      { dx: 4, dy: 4 },
    ],
    batteryTarget: { dx: 1, dy: 3 },
  },
];

function createScenarioSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return values[0] || ((Date.now() ^ (Math.random() * 0x1_0000_0000)) >>> 0);
}

function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function clampTile(coord: TileCoord): TileCoord {
  return {
    x: Math.max(3, Math.min(GRID_WIDTH - 4, coord.x)),
    y: Math.max(3, Math.min(GRID_HEIGHT - 4, coord.y)),
  };
}

function spiralCandidates(origin: TileCoord, searchRadius: number): TileCoord[] {
  const candidates: TileCoord[] = [];
  for (let radius = 0; radius <= searchRadius; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        candidates.push(clampTile({ x: origin.x + dx, y: origin.y + dy }));
      }
    }
  }
  return candidates;
}

function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = current;
  }
}

function findPlacement(
  engine: GameEngine,
  typeId: BuildingTypeId,
  preferredOrigin: TileCoord,
  searchRadius: number,
  rng: () => number,
): TileCoord {
  const candidates = spiralCandidates(preferredOrigin, searchRadius);
  shuffleInPlace(candidates, rng);

  candidates.sort((left, right) => {
    const leftDistance = Math.abs(left.x - preferredOrigin.x) + Math.abs(left.y - preferredOrigin.y);
    const rightDistance = Math.abs(right.x - preferredOrigin.x) + Math.abs(right.y - preferredOrigin.y);
    return leftDistance - rightDistance;
  });

  for (const candidate of candidates) {
    if (engine.canPlaceBuilding(typeId, candidate).ok) {
      return candidate;
    }
  }

  throw new Error(`Unable to place ${typeId} near ${preferredOrigin.x},${preferredOrigin.y}`);
}

function mustPlaceBuilding(
  engine: GameEngine,
  typeId: BuildingTypeId,
  preferredOrigin: TileCoord,
  searchRadius: number,
  rng: () => number,
): BuildingId {
  const origin = findPlacement(engine, typeId, preferredOrigin, searchRadius, rng);
  const buildingId = engine.placeBuilding(typeId, origin, Direction.North, { emitSfx: false });
  if (buildingId === null) {
    throw new Error(`Failed to place ${typeId} at ${origin.x},${origin.y}`);
  }
  return buildingId;
}

function mustConnect(engine: GameEngine, a: BuildingId, b: BuildingId): void {
  if (!engine.connectBuildings(a, b)) {
    throw new Error(`Failed to connect energy link ${a} -> ${b}`);
  }
}

function advanceSimulation(engine: GameEngine, totalSeconds: number, stepSeconds: number): void {
  let elapsedSeconds = 0;
  while (elapsedSeconds < totalSeconds) {
    const dt = Math.min(stepSeconds, totalSeconds - elapsedSeconds);
    engine.update(dt);
    elapsedSeconds += dt;
  }
}

function countVisibleUncoveredDeposits(engine: GameEngine): number {
  let total = 0;
  const visible = engine.getVisibleTiles();
  for (let y = visible.y0; y <= visible.y1; y++) {
    for (let x = visible.x0; x <= visible.x1; x++) {
      if (engine.getResourceAt(x, y) === ResourceType.None) continue;
      if (engine.getBuildingAt(x, y) !== null) continue;
      total += 1;
    }
  }
  return total;
}

export function generateStarterScenario(screenWidth: number, screenHeight: number): PreparedScenarioResult {
  const scenarioSeed = createScenarioSeed();
  const rng = mulberry32(scenarioSeed);
  const engine = new GameEngine(screenWidth, screenHeight);
  engine.generateMap(scenarioSeed);

  const baseAnchor = clampTile({
    x: Math.floor(GRID_WIDTH / 2) + randomInt(rng, -4, 4),
    y: Math.floor(GRID_HEIGHT / 2) + randomInt(rng, -4, 4),
  });
  const mirrorX = rng() < 0.5 ? -1 : 1;
  const mirrorY = rng() < 0.5 ? -1 : 1;
  const layout = STARTER_LAYOUTS[randomInt(rng, 0, STARTER_LAYOUTS.length - 1)] ?? STARTER_LAYOUTS[0];
  const toWorldCoord = (dx: number, dy: number): TileCoord =>
    clampTile({
      x: baseAnchor.x + dx * mirrorX,
      y: baseAnchor.y + dy * mirrorY,
    });

  const extractorDeposits = layout.extractorDeposits.map((deposit) => ({
    coord: toWorldCoord(deposit.dx, deposit.dy),
    type: deposit.type,
  }));
  const visibleDeposits = layout.visibleDeposits.map((deposit) => ({
    coord: toWorldCoord(deposit.dx, deposit.dy),
    type: deposit.type,
  }));

  for (const deposit of [...extractorDeposits, ...visibleDeposits]) {
    engine.placeResource(deposit.coord.x, deposit.coord.y, deposit.type);
  }

  const solarA = mustPlaceBuilding(
    engine,
    SOLAR_PANEL_BUILDING_TYPE_ID,
    toWorldCoord(layout.solarTargets[0]?.dx ?? -1, layout.solarTargets[0]?.dy ?? 2),
    4,
    rng,
  );
  const solarB = mustPlaceBuilding(
    engine,
    SOLAR_PANEL_BUILDING_TYPE_ID,
    toWorldCoord(layout.solarTargets[1]?.dx ?? 1, layout.solarTargets[1]?.dy ?? 2),
    4,
    rng,
  );
  const solarC = mustPlaceBuilding(
    engine,
    SOLAR_PANEL_BUILDING_TYPE_ID,
    toWorldCoord(layout.solarTargets[2]?.dx ?? 0, layout.solarTargets[2]?.dy ?? 5),
    4,
    rng,
  );
  const battery = mustPlaceBuilding(
    engine,
    BATTERY_BASIC_BUILDING_TYPE_ID,
    toWorldCoord(layout.batteryTarget.dx, layout.batteryTarget.dy),
    5,
    rng,
  );
  const coalExtractor = mustPlaceBuilding(
    engine,
    EXTRACTOR_BUILDING_TYPE_ID,
    extractorDeposits[0]?.coord ?? toWorldCoord(-5, 0),
    0,
    rng,
  );
  const ironExtractor = mustPlaceBuilding(
    engine,
    EXTRACTOR_BUILDING_TYPE_ID,
    extractorDeposits[1]?.coord ?? toWorldCoord(5, 0),
    0,
    rng,
  );

  mustConnect(engine, solarA, battery);
  mustConnect(engine, solarB, battery);
  mustConnect(engine, solarC, battery);
  mustConnect(engine, battery, coalExtractor);
  mustConnect(engine, battery, ironExtractor);

  engine.setSimulationTime(0.28 + rng() * 0.16);
  advanceSimulation(engine, 18, 0.2);

  if (countVisibleUncoveredDeposits(engine) < 3) {
    throw new Error('Generated starter scenario did not preserve enough visible deposits');
  }

  const viewport = {
    centerX: (baseAnchor.x + 0.5) * TILE_SIZE,
    centerY: (baseAnchor.y + 0.5) * TILE_SIZE,
    zoom: 0.7,
  };
  engine.viewport.restore(viewport);

  return {
    engine,
    selectedTool: { kind: 'select' },
    viewport: engine.getViewportSnapshot(),
  };
}
