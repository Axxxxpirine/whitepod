import { GRID_HEIGHT, GRID_WIDTH, ISO_TILE_H, ISO_TILE_W } from '../constants';

export interface IsoPoint {
  readonly wx: number;
  readonly wy: number;
}

export interface IsoBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface IsoTileRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Project logical tile coordinates to iso world space.
 * Returns the iso world position of the CENTER of the tile diamond.
 *
 * For a 2:1 diamond, two horizontally-adjacent tiles in iso world are offset
 * by (ISO_TILE_W/2, ISO_TILE_H/2) — east of (tx, ty) is at iso
 * ((tx-ty+1)*W/2, (tx+ty+1)*H/2).
 */
export function tileCenterToIso(tx: number, ty: number): IsoPoint {
  return {
    wx: (tx - ty) * (ISO_TILE_W / 2),
    wy: (tx + ty) * (ISO_TILE_H / 2),
  };
}

/**
 * Project iso world space to continuous tile coordinates.
 * The integer pair Math.round(tx_c, ty_c) identifies the diamond that contains
 * the point. Math.round is correct for diamond picking — see IsoTransform.test.
 */
export function isoToTileContinuous(wx: number, wy: number): { tx: number; ty: number } {
  return {
    tx: wx / ISO_TILE_W + wy / ISO_TILE_H,
    ty: wy / ISO_TILE_H - wx / ISO_TILE_W,
  };
}

/**
 * Pick the logical tile whose diamond contains the iso world point.
 * Result is NOT clamped to grid bounds — caller decides what to do off-grid.
 */
export function isoToTile(wx: number, wy: number): { tx: number; ty: number } {
  const { tx, ty } = isoToTileContinuous(wx, wy);
  return {
    tx: Math.round(tx),
    ty: Math.round(ty),
  };
}

/**
 * Iso-world bounding box of the entire logical grid.
 * The grid forms a diamond in iso world, so bounds X spans both negative and
 * positive (the (0, GRID_HEIGHT-1) tile sits far west, (GRID_WIDTH-1, 0) far east).
 */
export function isoWorldBounds(gridWidth: number = GRID_WIDTH, gridHeight: number = GRID_HEIGHT): IsoBounds {
  const halfW = ISO_TILE_W / 2;
  const halfH = ISO_TILE_H / 2;
  return {
    minX: -(gridHeight - 1) * halfW,
    maxX: (gridWidth - 1) * halfW,
    minY: 0,
    maxY: (gridWidth - 1 + gridHeight - 1) * halfH,
  };
}

/**
 * Default viewport center: middle of the iso-projected world.
 * Logical center tile (GRID_WIDTH/2, GRID_HEIGHT/2) in iso space.
 */
export function isoWorldCenter(
  gridWidth: number = GRID_WIDTH,
  gridHeight: number = GRID_HEIGHT,
): IsoPoint {
  return tileCenterToIso(gridWidth / 2, gridHeight / 2);
}

interface ViewportRect {
  readonly centerX: number;
  readonly centerY: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/**
 * Compute the rectangular tile range that covers everything visible in the
 * iso-projected viewport rectangle.
 *
 * Because the iso projection rotates the world by 45° on screen, the visible
 * tile set is actually a diamond on the logical grid. We return its bounding
 * rectangle (an over-approximation safe for sprite culling), padded by `padding`
 * tiles on each side, then clamped to the logical grid.
 */
export function isoVisibleTileRange(
  viewport: ViewportRect,
  padding: number = 2,
  gridWidth: number = GRID_WIDTH,
  gridHeight: number = GRID_HEIGHT,
): IsoTileRange {
  const corners = [
    { wx: viewport.centerX - viewport.halfWidth, wy: viewport.centerY - viewport.halfHeight },
    { wx: viewport.centerX + viewport.halfWidth, wy: viewport.centerY - viewport.halfHeight },
    { wx: viewport.centerX - viewport.halfWidth, wy: viewport.centerY + viewport.halfHeight },
    { wx: viewport.centerX + viewport.halfWidth, wy: viewport.centerY + viewport.halfHeight },
  ];

  let minTx = Infinity;
  let maxTx = -Infinity;
  let minTy = Infinity;
  let maxTy = -Infinity;

  for (const c of corners) {
    const { tx, ty } = isoToTileContinuous(c.wx, c.wy);
    if (tx < minTx) minTx = tx;
    if (tx > maxTx) maxTx = tx;
    if (ty < minTy) minTy = ty;
    if (ty > maxTy) maxTy = ty;
  }

  return {
    x0: Math.max(0, Math.floor(minTx) - padding),
    y0: Math.max(0, Math.floor(minTy) - padding),
    x1: Math.min(gridWidth - 1, Math.ceil(maxTx) + padding),
    y1: Math.min(gridHeight - 1, Math.ceil(maxTy) + padding),
  };
}
