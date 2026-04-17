import { GRID_HEIGHT, GRID_WIDTH } from '@/game/constants';
import {
  WATCHTOWER_BUILDING_TYPE_ID,
  getBuildingType,
} from '@/game/data/buildingCatalog';
import { type TileCoord } from '@/game/types';
import type { GameEngine } from '@/game/engine/GameEngine';

export interface SpiralAnchor {
  x: number;
  y: number;
  step: number;
  adaptiveStepSize: number;
}

export interface FrontierPosition {
  x: number;
  y: number;
  distanceFromCenter: number;
}

export function calculateBuildDensity(engine: GameEngine): number {
  const occupiedTiles = new Set<string>();
  const revealedTiles = new Set<string>();

  for (const [, building] of engine.getBuildings()) {
    const type = getBuildingType(building.typeId);
    if (!type) continue;

    for (let dy = 0; dy < type.footprint.h; dy++) {
      for (let dx = 0; dx < type.footprint.w; dx++) {
        const tileX = building.origin.x + dx;
        const tileY = building.origin.y + dy;
        if (tileX >= 0 && tileX < GRID_WIDTH && tileY >= 0 && tileY < GRID_HEIGHT) {
          occupiedTiles.add(`${tileX},${tileY}`);
        }
      }
    }
  }

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (engine.grid.isRevealed(x, y)) {
        revealedTiles.add(`${x},${y}`);
      }
    }
  }

  const totalRevealed = revealedTiles.size;
  if (totalRevealed === 0) return 0;

  return occupiedTiles.size / totalRevealed;
}

export function shouldTriggerExploration(engine: GameEngine, threshold: number = 0.3): boolean {
  const density = calculateBuildDensity(engine);
  return density >= threshold;
}

export function findFrontierWatchtowerPosition(engine: GameEngine): TileCoord | null {
  const frontierTiles: Array<{ x: number; y: number; distance: number }> = [];
  const centerX = Math.floor(GRID_WIDTH / 2);
  const centerY = Math.floor(GRID_HEIGHT / 2);

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      if (!engine.grid.isRevealed(x, y)) continue;

      const hasUnrevealedNeighbor = [
        { x: x + 1, y },
        { x: x - 1, y },
        { x, y: y + 1 },
        { x, y: y - 1 },
      ].some((n) => {
        if (n.x < 0 || n.x >= GRID_WIDTH || n.y < 0 || n.y >= GRID_HEIGHT) return false;
        return !engine.grid.isRevealed(n.x, n.y);
      });

      if (hasUnrevealedNeighbor) {
        const distance = Math.abs(x - centerX) + Math.abs(y - centerY);
        frontierTiles.push({ x, y, distance });
      }
    }
  }

  if (frontierTiles.length === 0) return null;

  frontierTiles.sort((a, b) => b.distance - a.distance || a.x - b.x || a.y - b.y);

  return { x: frontierTiles[0]!.x, y: frontierTiles[0]!.y };
}

export function calculateSpiralAnchor(engine: GameEngine, startStep: number): SpiralAnchor {
  const centerX = Math.floor(GRID_WIDTH / 2);
  const centerY = Math.floor(GRID_HEIGHT / 2);

  let x = 0;
  let y = 0;
  let dx = 0;
  let dy = -1;

  for (let index = 0; index < startStep; index++) {
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) {
      const prevDx = dx;
      dx = -dy;
      dy = prevDx;
    }
    x += dx;
    y += dy;
  }

  const targetX = centerX + x;
  const targetY = centerY + y;

  const visibleDense = countVisibleDepositsInRing(engine, startStep, 3);
  let adaptiveStepSize = 5;
  if (visibleDense >= 4) {
    adaptiveStepSize = 3;
  } else if (visibleDense < 2) {
    adaptiveStepSize = 7;
  }

  return { x: targetX, y: targetY, step: startStep, adaptiveStepSize };
}

export function countVisibleDepositsInRing(engine: GameEngine, spiralRadius: number, searchRadius: number): number {
  const anchor = calculateSpiralAnchor(engine, spiralRadius);
  let count = 0;

  for (let dy = -searchRadius; dy <= searchRadius; dy++) {
    for (let dx = -searchRadius; dx <= searchRadius; dx++) {
      const x = anchor.x + dx;
      const y = anchor.y + dy;
      if (x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
        if (engine.grid.isRevealed(x, y)) {
          const resource = engine.getResourceAt(x, y);
          if (resource !== 0) {
            count++;
          }
        }
      }
    }
  }

  return count;
}

export function reserveBeltCorridors(_engine: GameEngine, moduleCenter: TileCoord, corridorWidth: number = 2): Set<string> {
  const reserved = new Set<string>();

  for (let x = moduleCenter.x - corridorWidth * 2; x <= moduleCenter.x + corridorWidth * 2; x++) {
    for (let dy = -corridorWidth; dy <= corridorWidth; dy++) {
      const tileY = moduleCenter.y + dy;
      if (x >= 0 && x < GRID_WIDTH && tileY >= 0 && tileY < GRID_HEIGHT) {
        reserved.add(`${x},${tileY}`);
      }
    }
  }

  for (let y = moduleCenter.y - corridorWidth * 2; y <= moduleCenter.y + corridorWidth * 2; y++) {
    for (let dx = -corridorWidth; dx <= corridorWidth; dx++) {
      const tileX = moduleCenter.x + dx;
      if (tileX >= 0 && tileX < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT) {
        reserved.add(`${tileX},${y}`);
      }
    }
  }

  return reserved;
}

export function isTileInCorridor(tile: TileCoord, reservedCorridors: Set<string>): boolean {
  return reservedCorridors.has(`${tile.x},${tile.y}`);
}

export function findAvailableTileNearModule(
  engine: GameEngine,
  moduleCenter: TileCoord,
  reservedCorridors: Set<string>,
  searchRadius: number = 3,
): TileCoord | null {
  for (let r = 1; r <= searchRadius; r++) {
    for (let y = moduleCenter.y - r; y <= moduleCenter.y + r; y++) {
      for (let x = moduleCenter.x - r; x <= moduleCenter.x + r; x++) {
        if (x < 0 || x >= GRID_WIDTH || y < 0 || y >= GRID_HEIGHT) continue;
        if (reservedCorridors.has(`${x},${y}`)) continue;
        if (!engine.grid.isRevealed(x, y)) continue;
        if (engine.getBuildingAt(x, y) !== null) continue;

        return { x, y };
      }
    }
  }

  return null;
}

export function countBuildingsByTypeInRadius(
  engine: GameEngine,
  center: TileCoord,
  typeId: string,
  radius: number,
): number {
  let count = 0;

  for (const [, building] of engine.getBuildings()) {
    const type = getBuildingType(building.typeId);
    if (!type || type.id !== typeId) continue;

    const distance = Math.abs(building.origin.x - center.x) + Math.abs(building.origin.y - center.y);
    if (distance <= radius) {
      count++;
    }
  }

  return count;
}

export function findWatchtowerRangeBoundaries(engine: GameEngine): { min: number; max: number } {
  let minDistance = Infinity;
  let maxDistance = 0;

  for (const [, building] of engine.getBuildings()) {
    const type = getBuildingType(building.typeId);
    if (!type || type.id !== WATCHTOWER_BUILDING_TYPE_ID) continue;

    const centerX = Math.floor(GRID_WIDTH / 2);
    const centerY = Math.floor(GRID_HEIGHT / 2);
    const distance = Math.abs(building.origin.x - centerX) + Math.abs(building.origin.y - centerY);

    if (distance < minDistance) minDistance = distance;
    if (distance > maxDistance) maxDistance = distance;
  }

  return { min: minDistance === Infinity ? 0 : minDistance, max: maxDistance };
}
