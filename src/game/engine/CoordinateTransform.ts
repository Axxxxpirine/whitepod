import { TILE_SIZE } from '../constants';
import type { Viewport } from './Viewport';
import type { TileCoord } from '../types';

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

export function worldToGrid(wx: number, wy: number): TileCoord {
  return {
    x: Math.floor(wx / TILE_SIZE),
    y: Math.floor(wy / TILE_SIZE),
  };
}

export function gridToWorld(x: number, y: number): { wx: number; wy: number } {
  return {
    wx: x * TILE_SIZE,
    wy: y * TILE_SIZE,
  };
}

export function screenToGrid(viewport: Viewport, sx: number, sy: number): TileCoord {
  const { wx, wy } = screenToWorld(viewport, sx, sy);
  return worldToGrid(wx, wy);
}
