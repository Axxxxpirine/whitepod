import { GRID_HEIGHT, GRID_WIDTH, TILE_SIZE } from '@/game/constants';
import { GameEngine } from '@/game/engine/GameEngine';
import { getBuildingType, STORAGE_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { oppositeSide, worldSideOf } from '@/game/data/ConnectionRegistry';
import { GameMode } from '@/game/data/gameMode';
import { Direction, PortKind, ResourceType, TileType, type BuildingId, type BuildingTypeId, type PortId, type TileCoord } from '@/game/types';

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
  rotation: Direction = Direction.North,
): BuildingId {
  const origin = findPlacement(engine, typeId, preferredOrigin, searchRadius, rng);
  const buildingId = engine.placeBuilding(typeId, origin, rotation, { emitSfx: false });
  if (buildingId === null) {
    throw new Error(`Failed to place ${typeId} at ${origin.x},${origin.y}`);
  }
  return buildingId;
}

export function placeScenarioStorage(engine: GameEngine, center: TileCoord, rng: () => number): BuildingId {
  const { w, h } = getBuildingType(STORAGE_BUILDING_TYPE_ID)!.footprint;
  const origin = { x: center.x - Math.floor(w / 2), y: center.y - Math.floor(h / 2) };
  return mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, origin, 0, rng);
}

/** Place a producer facing the physical input on its side of a storage or merger. */
export function placeScenarioFeeder(
  engine: GameEngine,
  typeId: BuildingTypeId,
  origin: TileCoord,
  targetId: BuildingId,
  rng: () => number,
): BuildingId {
  const target = engine.getBuildings().get(targetId)!;
  const type = getBuildingType(target.typeId)!;
  const dx = origin.x - (target.origin.x + Math.floor(type.footprint.w / 2));
  const dy = origin.y - (target.origin.y + Math.floor(type.footprint.h / 2));
  const targetSide = Math.abs(dx) >= Math.abs(dy)
    ? (dx < 0 ? Direction.West : Direction.East)
    : (dy < 0 ? Direction.North : Direction.South);
  const input = type.ports.find((port) => port.kind === PortKind.Input && worldSideOf(port, target.rotation) === targetSide);
  if (!input) throw new Error(`Missing scenario input on ${targetId} facing ${targetSide}`);
  const rotation = ((oppositeSide(targetSide) - Direction.East + 4) % 4) as Direction;
  const id = mustPlaceBuilding(engine, typeId, origin, 0, rng, rotation);
  const result = engine.placeBelt({ building: id, port: 'out_east' }, { building: targetId, port: input.id });
  if (!result.ok) throw new Error(`Cannot route scenario feeder ${id} to ${targetId}: ${result.reason}`);
  return id;
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

export function countRevealedUncoveredDeposits(engine: GameEngine, deposits: readonly TileCoord[]): number {
  return deposits.filter(({ x, y }) =>
    engine.grid.isRevealed(x, y) &&
    engine.getResourceAt(x, y) !== ResourceType.None &&
    engine.getBuildingAt(x, y) === null,
  ).length;
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
  const engine = new GameEngine(screenWidth, screenHeight, { gameMode: GameMode.Sandbox });
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
  const viewport = {
    centerX: (baseAnchor.x + 0.5) * TILE_SIZE,
    centerY: (baseAnchor.y + 0.5) * TILE_SIZE,
    zoom,
  };
  engine.viewport.restore(viewport);
  return engine.getViewportSnapshot();
}
