import type { Viewport } from './Viewport';
import type { TileCoord } from '../types';
import { isoToTile, tileCenterToIso } from './IsoTransform';

/**
 * Screen → iso world. The viewport center sits at iso world (centerX, centerY)
 * and the camera zooms uniformly. The iso projection itself is applied at the
 * tile/sprite level (see tileCenterToIso); world space is already iso here.
 */
export function screenToWorld(
  viewport: Viewport,
  sx: number,
  sy: number,
): { wx: number; wy: number } {
  return {
    wx: viewport.centerX + (sx - viewport.screenWidth / 2) / viewport.zoom,
    wy: viewport.centerY + (sy - viewport.screenHeight / 2) / viewport.zoom,
  };
}

export function worldToScreen(
  viewport: Viewport,
  wx: number,
  wy: number,
): { sx: number; sy: number } {
  return {
    sx: (wx - viewport.centerX) * viewport.zoom + viewport.screenWidth / 2,
    sy: (wy - viewport.centerY) * viewport.zoom + viewport.screenHeight / 2,
  };
}

/**
 * Iso world → logical tile (tx, ty).
 * Picking uses Math.round on the inverse iso formula — see IsoTransform.
 * Result is NOT clamped to grid bounds; callers must handle off-grid picks
 * (return null, ignore, etc.).
 */
export function worldToGrid(wx: number, wy: number): TileCoord {
  const { tx, ty } = isoToTile(wx, wy);
  return { x: tx, y: ty };
}

/**
 * Logical tile (x, y) → iso world position of the diamond CENTER.
 * Used by renderers to anchor sprites and by pan/zoom math to focus on a tile.
 */
export function gridToWorld(x: number, y: number): { wx: number; wy: number } {
  return tileCenterToIso(x, y);
}

export function screenToGrid(viewport: Viewport, sx: number, sy: number): TileCoord {
  const { wx, wy } = screenToWorld(viewport, sx, sy);
  return worldToGrid(wx, wy);
}
