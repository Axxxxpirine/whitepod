import { GRID_HEIGHT, GRID_WIDTH, TILE_SIZE } from '../constants';
import { screenToWorld } from '../engine/CoordinateTransform';
import type { Viewport } from '../engine/Viewport';

/**
 * Minimap geometry, kept free of PixiJS so it can be unit-tested.
 *
 * The minimap is a top-down, scaled-down copy of the logical grid. Grid space
 * here is continuous tile coordinates where tile (tx, ty) covers
 * [tx, tx + 1) x [ty, ty + 1), matching world space divided by TILE_SIZE.
 */
export interface MinimapLayout {
  readonly width: number;
  readonly height: number;
  /** Minimap pixels per tile. */
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
  const scale = width / gridWidth;
  return {
    width,
    height: gridHeight * scale,
    scale,
    gridWidth,
    gridHeight,
  };
}

/** Grid space -> minimap local pixels. */
export function gridToMinimap(layout: MinimapLayout, gx: number, gy: number): MinimapPoint {
  return { x: gx * layout.scale, y: gy * layout.scale };
}

/** Minimap local pixels -> grid space (inverse of gridToMinimap). */
export function minimapToGrid(layout: MinimapLayout, mx: number, my: number): MinimapPoint {
  return { x: mx / layout.scale, y: my / layout.scale };
}

/** The four corners of the grid in minimap pixels (clockwise from top-left). */
export function minimapOutline(layout: MinimapLayout): MinimapPoint[] {
  return [
    { x: 0, y: 0 },
    { x: layout.width, y: 0 },
    { x: layout.width, y: layout.height },
    { x: 0, y: layout.height },
  ];
}

/** True when a minimap-local point lies on the grid. */
export function isInsideMinimap(layout: MinimapLayout, mx: number, my: number): boolean {
  return mx >= 0 && my >= 0 && mx <= layout.width && my <= layout.height;
}

/** World point the camera should center on to look at a minimap point. */
export function minimapToWorld(layout: MinimapLayout, mx: number, my: number): { wx: number; wy: number } {
  const g = minimapToGrid(layout, mx, my);
  return { wx: g.x * TILE_SIZE, wy: g.y * TILE_SIZE };
}

/** Outline of the area the main view shows, in minimap pixels. */
export function viewportOutline(layout: MinimapLayout, viewport: Viewport): MinimapPoint[] {
  const corners: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [viewport.screenWidth, 0],
    [viewport.screenWidth, viewport.screenHeight],
    [0, viewport.screenHeight],
  ];
  return corners.map(([sx, sy]) => {
    const { wx, wy } = screenToWorld(viewport, sx, sy);
    return gridToMinimap(layout, wx / TILE_SIZE, wy / TILE_SIZE);
  });
}

/** Radius on the minimap of a circle of `radius` tiles. */
export function minimapCircleRadius(layout: MinimapLayout, radius: number): number {
  return radius * layout.scale;
}
