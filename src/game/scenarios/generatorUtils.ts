import { GRID_HEIGHT, GRID_WIDTH } from '@/game/constants';
import { gridToWorld } from '@/game/engine/CoordinateTransform';
import { GameEngine } from '@/game/engine/GameEngine';
import { Direction, ResourceType, TileType, type BuildingId, type BuildingTypeId, type PortId, type TileCoord } from '@/game/types';

export interface PreparedEngine {
  readonly engine: GameEngine;
  readonly rng: () => number;
  readonly scenarioSeed: number;
  readonly baseAnchor: TileCoord;
  readonly mirrorX: 1 | -1;
  readonly mirrorY: 1 | -1;
}

export function createScenarioSeed(): number {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(values);
  return values[0] || ((Date.now() ^ (Math.random() * 0x1_0000_0000)) >>> 0);
}

export function randomInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function clampTile(coord: TileCoord): TileCoord {
  return {
    x: Math.max(3, Math.min(GRID_WIDTH - 4, coord.x)),
    y: Math.max(3, Math.min(GRID_HEIGHT - 4, coord.y)),
  };
}

export function spiralCandidates(origin: TileCoord, searchRadius: number): TileCoord[] {
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

export function shuffleInPlace<T>(items: T[], rng: () => number): void {
  for (let index = items.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = items[index];
    items[index] = items[swapIndex];
    items[swapIndex] = current;
  }
}

export function findPlacement(
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

export function mustPlaceBuilding(
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

export function mustConnect(engine: GameEngine, a: BuildingId, b: BuildingId): void {
  if (!engine.connectBuildings(a, b)) {
    throw new Error(`Failed to connect energy link ${a} -> ${b}`);
  }
}

/** Attempt to route a belt between two building ports. Returns true if successful, false if routing failed. */
export function tryBelt(
  engine: GameEngine,
  from: { building: BuildingId; port: PortId },
  to: { building: BuildingId; port: PortId },
): boolean {
  const result = engine.placeBelt(from, to);
  return result.ok;
}

export function advanceSimulation(engine: GameEngine, totalSeconds: number, stepSeconds: number): void {
  let elapsedSeconds = 0;
  while (elapsedSeconds < totalSeconds) {
    const dt = Math.min(stepSeconds, totalSeconds - elapsedSeconds);
    engine.update(dt);
    elapsedSeconds += dt;
  }
}

export function countVisibleUncoveredDeposits(engine: GameEngine): number {
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

/** Count how many distinct energy networks the engine currently has (connected components). */
export function countEnergyNetworks(engine: GameEngine): number {
  return engine.getEnergyNetworkBalances().length;
}

/**
 * Clears terrain to Ground and reveals fog within a circle of `radius` tiles
 * around `(cx, cy)`.
 *
 * Call at the start of a scenario generator after `prepareEngine` to guarantee
 * that every building footprint and belt corridor in the build zone is passable,
 * regardless of the random terrain produced by `generateMap`.
 */
export function prepareBuildZone(engine: GameEngine, cx: number, cy: number, radius: number): void {
  engine.grid.revealCircle(cx, cy, radius);
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const x1 = Math.min(GRID_WIDTH - 1, Math.ceil(cx + radius));
  const y1 = Math.min(GRID_HEIGHT - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        engine.placeTile(x, y, TileType.Ground);
        engine.removeResource(x, y);
      }
    }
  }
}

export function prepareEngine(screenWidth: number, screenHeight: number, rng: () => number, scenarioSeed: number): PreparedEngine {
  const engine = new GameEngine(screenWidth, screenHeight);
  engine.generateMap(scenarioSeed);

  const baseAnchor = clampTile({
    x: Math.floor(GRID_WIDTH / 2) + randomInt(rng, -4, 4),
    y: Math.floor(GRID_HEIGHT / 2) + randomInt(rng, -4, 4),
  });
  const mirrorX = rng() < 0.5 ? (-1 as const) : (1 as const);
  const mirrorY = rng() < 0.5 ? (-1 as const) : (1 as const);

  return { engine, rng, scenarioSeed, baseAnchor, mirrorX, mirrorY };
}

export function makeViewport(engine: GameEngine, baseAnchor: TileCoord, zoom: number) {
  const center = gridToWorld(baseAnchor.x, baseAnchor.y);
  const viewport = {
    centerX: center.wx,
    centerY: center.wy,
    zoom,
  };
  engine.viewport.restore(viewport);
  return engine.getViewportSnapshot();
}
