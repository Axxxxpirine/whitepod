import { ISO_TILE_H, ISO_TILE_W } from '../constants';
import { tileCenterToIso } from '../engine/IsoTransform';

export interface IsoFootprintDiamond {
  readonly north: { readonly x: number; readonly y: number };
  readonly east: { readonly x: number; readonly y: number };
  readonly south: { readonly x: number; readonly y: number };
  readonly west: { readonly x: number; readonly y: number };
  readonly center: { readonly x: number; readonly y: number };
}

/**
 * Return the four iso-world vertices of the diamond covering a w*h logical
 * footprint anchored at (originX, originY), plus its center. Used for
 * placement previews, selection rings and any other footprint-shaped overlay
 * that needs to align with the diamond grid.
 *
 * The diamond covers tiles [originX, originX + w) * [originY, originY + h):
 *   - North vertex: top of the (originX, originY) tile diamond
 *   - East vertex: right of the (originX + w - 1, originY) tile diamond
 *   - South vertex: bottom of the (originX + w - 1, originY + h - 1) tile diamond
 *   - West vertex: left of the (originX, originY + h - 1) tile diamond
 */
export function footprintDiamond(
  originX: number,
  originY: number,
  w: number,
  h: number,
): IsoFootprintDiamond {
  const halfW = ISO_TILE_W / 2;
  const halfH = ISO_TILE_H / 2;

  const nCenter = tileCenterToIso(originX, originY);
  const eCenter = tileCenterToIso(originX + w - 1, originY);
  const sCenter = tileCenterToIso(originX + w - 1, originY + h - 1);
  const wCenter = tileCenterToIso(originX, originY + h - 1);

  const center = tileCenterToIso(originX + (w - 1) / 2, originY + (h - 1) / 2);

  return {
    north: { x: nCenter.wx, y: nCenter.wy - halfH },
    east: { x: eCenter.wx + halfW, y: eCenter.wy },
    south: { x: sCenter.wx, y: sCenter.wy + halfH },
    west: { x: wCenter.wx - halfW, y: wCenter.wy },
    center: { x: center.wx, y: center.wy },
  };
}

/**
 * Iso-world point where HUD panels attach below a w*h footprint: horizontally
 * centered on the footprint, vertically on its south (lowest on-screen) vertex.
 */
export function footprintBottomAnchor(
  originX: number,
  originY: number,
  w: number,
  h: number,
): { readonly x: number; readonly y: number } {
  const diamond = footprintDiamond(originX, originY, w, h);
  return { x: diamond.center.x, y: diamond.south.y };
}

/**
 * Iso-world point where tooltips attach above a single tile: the north
 * (highest on-screen) vertex of its diamond.
 */
export function tileTopAnchor(x: number, y: number): { readonly x: number; readonly y: number } {
  return footprintDiamond(x, y, 1, 1).north;
}
