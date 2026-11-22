import { MAP_CENTER, RESOURCE_DEPOSIT_AMOUNT } from '../constants';

/**
 * How much a deposit tile holds when the map is generated (decision D3).
 * Gameplay numbers live here, never in systems.
 *
 * - Near the hub a tile holds `DEPOSIT_BASE_AMOUNT`: 50 minutes of one
 *   extractor, enough for chapters 1–2 on the starting deposits.
 * - Amounts grow with the distance from the map centre, so expanding pays.
 * - Beyond the area revealed at start, some tiles are rich veins (×4), found
 *   by exploring (watchtower).
 *
 * Deterministic from the tile and the map seed, so old saves can be given the
 * same amounts on load (GameEngine.fromSnapshot).
 */

export const DEPOSIT_BASE_AMOUNT = RESOURCE_DEPOSIT_AMOUNT;
/** Distance (tiles) over which a tile's amount doubles. */
const DEPOSIT_GROWTH_DISTANCE = 64;
/** Rich veins only appear this far from the centre: outside the initial reveal (radius 20). */
export const RICH_VEIN_MIN_DISTANCE = 24;
const RICH_VEIN_CHANCE = 0.2;
const RICH_VEIN_FACTOR = 4;
/** Tile amounts are stored as Uint16. */
const MAX_AMOUNT = 65535;

/** Stable pseudo-random value in [0, 1) for a tile and a seed. */
function tileHash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function distanceFromCentre(x: number, y: number): number {
  return Math.hypot(x - MAP_CENTER.x, y - MAP_CENTER.y);
}

export function isRichVein(x: number, y: number, seed: number): boolean {
  return distanceFromCentre(x, y) >= RICH_VEIN_MIN_DISTANCE && tileHash(x, y, seed) < RICH_VEIN_CHANCE;
}

export function depositAmountAt(x: number, y: number, seed: number): number {
  const base = DEPOSIT_BASE_AMOUNT * (1 + distanceFromCentre(x, y) / DEPOSIT_GROWTH_DISTANCE);
  const amount = isRichVein(x, y, seed) ? base * RICH_VEIN_FACTOR : base;
  return Math.min(MAX_AMOUNT, Math.round(amount));
}
