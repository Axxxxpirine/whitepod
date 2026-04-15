import { TileGrid } from '../data/TileGrid';
import { Viewport } from './Viewport';
import type { VisibleTileRange } from './Viewport';
import type { TileCoord, TileType } from '../types';
import { isInBounds } from '../data/coords';
import { screenToGrid } from './CoordinateTransform';

export class GameEngine {
  readonly grid: TileGrid;
  readonly viewport: Viewport;

  constructor(screenWidth: number, screenHeight: number) {
    this.grid = new TileGrid();
    this.viewport = new Viewport(screenWidth, screenHeight);
  }

  update(_dt: number): void {
    // Simulation tick — will grow with future features
  }

  placeTile(x: number, y: number, type: TileType): boolean {
    if (!isInBounds(x, y)) return false;
    this.grid.setType(x, y, type);
    return true;
  }

  getTileAt(x: number, y: number): TileType {
    return this.grid.getType(x, y);
  }

  getVisibleTiles(): VisibleTileRange {
    return this.viewport.getVisibleTileRange();
  }

  screenToTile(screenX: number, screenY: number): TileCoord {
    return screenToGrid(this.viewport, screenX, screenY);
  }
}
