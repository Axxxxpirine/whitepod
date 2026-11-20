import { REVEALED_FLAG } from '../constants';
import { isInBounds, toIndex } from '../data/coords';
import type { TileGrid } from '../data/TileGrid';
import { ResourceType, TileType, type Footprint, type TileCoord } from '../types';

/** Free ground ring kept around the hub so belts can reach every input port. */
export const HUB_CLEARANCE = 1;

function hasDeposit(grid: TileGrid, index: number): boolean {
  return grid.resourceType[index] !== ResourceType.None && grid.resourceAmount[index] > 0;
}

/** Extra per-tile veto, e.g. tiles already occupied by a building. */
export type TileBlocker = (index: number) => boolean;

/**
 * True when the footprint plus its clearance ring is in bounds, revealed,
 * plain ground, free of deposits and not vetoed by `isBlocked`.
 */
export function isHubSiteClear(
  grid: TileGrid,
  origin: TileCoord,
  footprint: Footprint,
  isBlocked: TileBlocker = () => false,
): boolean {
  for (let y = origin.y - HUB_CLEARANCE; y < origin.y + footprint.h + HUB_CLEARANCE; y++) {
    for (let x = origin.x - HUB_CLEARANCE; x < origin.x + footprint.w + HUB_CLEARANCE; x++) {
      if (!isInBounds(x, y)) return false;
      const index = toIndex(x, y);
      if (!(grid.flags[index] & REVEALED_FLAG)) return false;
      if (grid.tileType[index] !== TileType.Ground) return false;
      if (hasDeposit(grid, index)) return false;
      if (isBlocked(index)) return false;
    }
  }
  return true;
}

/**
 * Finds a clear hub origin near `center` (footprint centered on it): scans
 * square rings outward up to `maxRadius` and returns the Euclidean-closest
 * clear origin of the first ring that has one. Deterministic for a given
 * grid. Returns null when no clear site exists in range.
 */
export function findHubOrigin(
  grid: TileGrid,
  footprint: Footprint,
  center: TileCoord,
  maxRadius: number,
  isBlocked: TileBlocker = () => false,
): TileCoord | null {
  const base = {
    x: center.x - Math.floor(footprint.w / 2),
    y: center.y - Math.floor(footprint.h / 2),
  };

  for (let radius = 0; radius <= maxRadius; radius++) {
    let best: TileCoord | null = null;
    let bestDistance = Infinity;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const origin = { x: base.x + dx, y: base.y + dy };
        if (!isHubSiteClear(grid, origin, footprint, isBlocked)) continue;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          best = origin;
          bestDistance = distance;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/**
 * Last-resort site: turns the footprint centered on `center` (plus clearance)
 * into revealed plain ground without deposits, so a campaign always starts
 * with a hub even on a pathological map.
 */
export function clearHubSite(grid: TileGrid, footprint: Footprint, center: TileCoord): TileCoord {
  const origin = {
    x: center.x - Math.floor(footprint.w / 2),
    y: center.y - Math.floor(footprint.h / 2),
  };
  for (let y = origin.y - HUB_CLEARANCE; y < origin.y + footprint.h + HUB_CLEARANCE; y++) {
    for (let x = origin.x - HUB_CLEARANCE; x < origin.x + footprint.w + HUB_CLEARANCE; x++) {
      if (!isInBounds(x, y)) continue;
      const index = toIndex(x, y);
      grid.tileType[index] = TileType.Ground;
      grid.resourceType[index] = ResourceType.None;
      grid.resourceAmount[index] = 0;
      grid.flags[index] |= REVEALED_FLAG;
    }
  }
  return origin;
}
