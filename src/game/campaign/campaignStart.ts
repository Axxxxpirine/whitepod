import { REVEALED_FLAG } from '../constants';
import { isInBounds, toIndex } from '../data/coords';
import type { TileGrid } from '../data/TileGrid';
import { ResourceType, TileType, type Footprint, type ResourceCost, type TileCoord } from '../types';
import { HUB_CLEARANCE, type TileBlocker } from './hubPlacement';

/**
 * Campaign start data. Gameplay numbers live here, never in systems; they are
 * tuned with the chapter 1-2 content (#71).
 */

/**
 * Stock credited to the hub when a campaign starts. Sized for a first line:
 * ~4 extractors, ~6 solar panels, a storage and the belts to the hub.
 */
export const STARTING_KIT: readonly ResourceCost[] = [{ resourceType: ResourceType.Regolith, amount: 180 }];

export interface StartingDepositRequirement {
  readonly resourceType: ResourceType;
  /** Minimum deposit tiles of this type within `STARTING_DEPOSIT_RADIUS` of the hub. */
  readonly minTiles: number;
}

/** Deposits the first milestones need, guaranteed close to the hub. */
export const STARTING_DEPOSITS: readonly StartingDepositRequirement[] = [
  { resourceType: ResourceType.Regolith, minTiles: 2 },
  { resourceType: ResourceType.Oxygen, minTiles: 2 },
];

/** Chebyshev distance from the hub edge within which starting deposits must exist. */
export const STARTING_DEPOSIT_RADIUS = 10;

/** First ring searched when adding a missing deposit, leaving room for belts around the hub. */
const ADDED_DEPOSIT_MIN_DISTANCE = 4;

/** Chebyshev distance from a tile to the hub rectangle (0 inside it). */
function distanceToHub(x: number, y: number, origin: TileCoord, footprint: Footprint): number {
  const dx = Math.max(origin.x - x, 0, x - (origin.x + footprint.w - 1));
  const dy = Math.max(origin.y - y, 0, y - (origin.y + footprint.h - 1));
  return Math.max(dx, dy);
}

/** A tile an extractor could use: revealed, in reach, plain ground, outside the hub clearance, not blocked. */
function isUsableTile(
  grid: TileGrid,
  x: number,
  y: number,
  origin: TileCoord,
  footprint: Footprint,
  isBlocked: TileBlocker,
): boolean {
  if (!isInBounds(x, y)) return false;
  const distance = distanceToHub(x, y, origin, footprint);
  if (distance <= HUB_CLEARANCE || distance > STARTING_DEPOSIT_RADIUS) return false;
  const index = toIndex(x, y);
  return (
    (grid.flags[index] & REVEALED_FLAG) !== 0 &&
    grid.tileType[index] === TileType.Ground &&
    !isBlocked(index)
  );
}

/** Tiles at Chebyshev distance `distance` from the hub rectangle, clockwise from the north-west corner. */
function ringTiles(origin: TileCoord, footprint: Footprint, distance: number): TileCoord[] {
  const x0 = origin.x - distance;
  const y0 = origin.y - distance;
  const x1 = origin.x + footprint.w - 1 + distance;
  const y1 = origin.y + footprint.h - 1 + distance;
  const tiles: TileCoord[] = [];
  for (let x = x0; x < x1; x++) tiles.push({ x, y: y0 });
  for (let y = y0; y < y1; y++) tiles.push({ x: x1, y });
  for (let x = x1; x > x0; x--) tiles.push({ x, y: y1 });
  for (let y = y1; y > y0; y--) tiles.push({ x: x0, y });
  return tiles;
}

/**
 * Makes sure every starting requirement has enough deposit tiles near the hub,
 * adding the missing ones deterministically, one tile apart. Each requirement
 * grows from its own side of the hub so different resources do not merge.
 * Returns the tiles that were added.
 */
export function ensureStartingDeposits(
  grid: TileGrid,
  hubOrigin: TileCoord,
  hubFootprint: Footprint,
  isBlocked: TileBlocker = () => false,
): TileCoord[] {
  const added: TileCoord[] = [];

  STARTING_DEPOSITS.forEach((requirement, requirementIndex) => {
    let present = 0;
    for (let y = hubOrigin.y - STARTING_DEPOSIT_RADIUS; y < hubOrigin.y + hubFootprint.h + STARTING_DEPOSIT_RADIUS; y++) {
      for (let x = hubOrigin.x - STARTING_DEPOSIT_RADIUS; x < hubOrigin.x + hubFootprint.w + STARTING_DEPOSIT_RADIUS; x++) {
        if (!isUsableTile(grid, x, y, hubOrigin, hubFootprint, isBlocked)) continue;
        const index = toIndex(x, y);
        if (grid.resourceType[index] === requirement.resourceType && grid.resourceAmount[index] > 0) present++;
      }
    }

    let missing = requirement.minTiles - present;
    for (let distance = ADDED_DEPOSIT_MIN_DISTANCE; distance <= STARTING_DEPOSIT_RADIUS && missing > 0; distance++) {
      const ring = ringTiles(hubOrigin, hubFootprint, distance);
      const start = Math.floor((ring.length * requirementIndex) / STARTING_DEPOSITS.length);
      for (let step = 0; step < ring.length && missing > 0; step++) {
        const { x, y } = ring[(start + step) % ring.length]!;
        if (!isUsableTile(grid, x, y, hubOrigin, hubFootprint, isBlocked)) continue;
        if (grid.resourceType[toIndex(x, y)] !== ResourceType.None) continue;
        grid.setResource(x, y, requirement.resourceType);
        added.push({ x, y });
        missing--;
        // Leave one tile between added deposits so each extractor output stays free.
        step++;
      }
    }
  });

  return added;
}
