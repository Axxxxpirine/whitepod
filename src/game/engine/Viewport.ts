import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE } from '../constants';

export interface VisibleTileRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const VIEWPORT_PADDING = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class Viewport {
  centerX: number;
  centerY: number;
  zoom: number;
  screenWidth: number;
  screenHeight: number;

  constructor(screenWidth: number, screenHeight: number) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.zoom = 1;
    this.centerX = (GRID_WIDTH * TILE_SIZE) / 2;
    this.centerY = (GRID_HEIGHT * TILE_SIZE) / 2;
  }

  getVisibleTileRange(): VisibleTileRange {
    const halfW = this.screenWidth / 2 / this.zoom;
    const halfH = this.screenHeight / 2 / this.zoom;

    const x0 = Math.max(0, Math.floor((this.centerX - halfW) / TILE_SIZE) - VIEWPORT_PADDING);
    const y0 = Math.max(0, Math.floor((this.centerY - halfH) / TILE_SIZE) - VIEWPORT_PADDING);
    const x1 = Math.min(GRID_WIDTH - 1, Math.ceil((this.centerX + halfW) / TILE_SIZE) + VIEWPORT_PADDING);
    const y1 = Math.min(GRID_HEIGHT - 1, Math.ceil((this.centerY + halfH) / TILE_SIZE) + VIEWPORT_PADDING);

    return { x0, y0, x1, y1 };
  }

  pan(dx: number, dy: number): void {
    this.centerX = clamp(
      this.centerX + dx / this.zoom,
      0,
      GRID_WIDTH * TILE_SIZE,
    );
    this.centerY = clamp(
      this.centerY + dy / this.zoom,
      0,
      GRID_HEIGHT * TILE_SIZE,
    );
  }

  zoomAt(screenX: number, screenY: number, factor: number): void {
    const newZoom = clamp(this.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    if (newZoom === this.zoom) return;

    // Keep the world point under the cursor fixed
    const worldX = this.centerX + (screenX - this.screenWidth / 2) / this.zoom;
    const worldY = this.centerY + (screenY - this.screenHeight / 2) / this.zoom;

    this.centerX = worldX - (screenX - this.screenWidth / 2) / newZoom;
    this.centerY = worldY - (screenY - this.screenHeight / 2) / newZoom;
    this.zoom = newZoom;
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
  }
}
