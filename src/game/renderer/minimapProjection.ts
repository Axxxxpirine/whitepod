import { GRID_HEIGHT, GRID_WIDTH } from '../constants';
import { screenToWorld } from '../engine/CoordinateTransform';
import { isoToTileContinuous, tileCenterToIso, type IsoPoint } from '../engine/IsoTransform';
import type { Viewport } from '../engine/Viewport';

/**
 * Minimap geometry, kept free of PixiJS so it can be unit-tested.
 *
 * The minimap shows the logical grid with the same 2:1 iso projection as the
 * main view, scaled down to a diamond `width` px wide and `width / 2` px tall.
 * Grid space here is continuous tile coordinates where tile (tx, ty) covers
 * [tx, tx + 1) x [ty, ty + 1), so its center is (tx + 0.5, ty + 0.5).
 */
export interface MinimapLayout {
  readonly width: number;
  readonly height: number;
  /** Minimap pixels per grid unit along each iso axis. */
  readonly scale: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
}

export interface MinimapPoint {
  readonly x: number;
  readonly y: number;
}

export function createMinimapLayout(
  width: number,
  gridWidth: number = GRID_WIDTH,
  gridHeight: number = GRID_HEIGHT,
): MinimapLayout {
  return {
    width,
    height: width / 2,
    scale: width / (gridWidth + gridHeight),
    gridWidth,
    gridHeight,
  };
}

/** Grid space -> minimap local pixels. */
export function gridToMinimap(layout: MinimapLayout, gx: number, gy: number): MinimapPoint {
  const { scale, gridHeight } = layout;
  return {
    x: (gx - gy + gridHeight) * scale,
    y: ((gx + gy) / 2) * scale,
  };
}

/** Minimap local pixels -> grid space (inverse of gridToMinimap). */
export function minimapToGrid(layout: MinimapLayout, mx: number, my: number): MinimapPoint {
  const { scale, gridHeight } = layout;
  const diff = mx / scale - gridHeight;
  const sum = (2 * my) / scale;
  return {
    x: (sum + diff) / 2,
    y: (sum - diff) / 2,
  };
}

/** The four corners of the grid diamond in minimap pixels (N, E, S, W). */
export function minimapDiamond(layout: MinimapLayout): MinimapPoint[] {
  const { gridWidth, gridHeight } = layout;
  return [
    gridToMinimap(layout, 0, 0),
    gridToMinimap(layout, gridWidth, 0),
    gridToMinimap(layout, gridWidth, gridHeight),
    gridToMinimap(layout, 0, gridHeight),
  ];
}

/** True when a minimap-local point lies inside the grid diamond. */
export function isInsideMinimap(layout: MinimapLayout, mx: number, my: number): boolean {
  const g = minimapToGrid(layout, mx, my);
  return g.x >= 0 && g.y >= 0 && g.x <= layout.gridWidth && g.y <= layout.gridHeight;
}

/** Iso world point the camera should center on to look at a minimap point. */
export function minimapToWorld(layout: MinimapLayout, mx: number, my: number): IsoPoint {
  const g = minimapToGrid(layout, mx, my);
  return tileCenterToIso(g.x - 0.5, g.y - 0.5);
}

/**
 * Outline of the area the main view shows, in minimap pixels. The screen is a
 * rectangle in iso world space, which stays a rectangle on the minimap since
 * both use the same projection.
 */
export function viewportOutline(layout: MinimapLayout, viewport: Viewport): MinimapPoint[] {
  const corners: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [viewport.screenWidth, 0],
    [viewport.screenWidth, viewport.screenHeight],
    [0, viewport.screenHeight],
  ];
  return corners.map(([sx, sy]) => {
    const { wx, wy } = screenToWorld(viewport, sx, sy);
    const t = isoToTileContinuous(wx, wy);
    return gridToMinimap(layout, t.tx + 0.5, t.ty + 0.5);
  });
}

/**
 * Radii of the ellipse a circle of `radius` tiles becomes on the minimap
 * (the iso projection stretches diagonals horizontally and squashes them vertically).
 */
export function minimapCircleRadii(layout: MinimapLayout, radius: number): { rx: number; ry: number } {
  return {
    rx: radius * layout.scale * Math.SQRT2,
    ry: (radius * layout.scale) / Math.SQRT2,
  };
}
