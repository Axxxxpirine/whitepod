import { GRID_HEIGHT, GRID_WIDTH } from '../constants';
import { isoVisibleTileRange, isoWorldBounds, isoWorldCenter } from './IsoTransform';

export interface VisibleTileRange {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface ViewportSnapshot {
  readonly centerX: number;
  readonly centerY: number;
  readonly zoom: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const VIEWPORT_PADDING = 2;

const ISO_BOUNDS = isoWorldBounds(GRID_WIDTH, GRID_HEIGHT);
// Pan envelope — a generous bounding box of the iso world. Allows the camera
// to push slightly past the grid corners (the iso world is a diamond, not a
// rectangle, so corners of this bbox sit in empty visual space — that's fine).
const PAN_MIN_X = ISO_BOUNDS.minX;
const PAN_MAX_X = ISO_BOUNDS.maxX;
const PAN_MIN_Y = ISO_BOUNDS.minY;
const PAN_MAX_Y = ISO_BOUNDS.maxY;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class Viewport {
  centerX: number;
  centerY: number;
  zoom: number;
  screenWidth: number;
  screenHeight: number;
  private readonly onChange: (() => void) | null;

  constructor(screenWidth: number, screenHeight: number, onChange: (() => void) | null = null) {
    this.screenWidth = screenWidth;
    this.screenHeight = screenHeight;
    this.zoom = 1;
    const center = isoWorldCenter();
    this.centerX = center.wx;
    this.centerY = center.wy;
    this.onChange = onChange;
  }

  getVisibleTileRange(): VisibleTileRange {
    return isoVisibleTileRange(
      {
        centerX: this.centerX,
        centerY: this.centerY,
        halfWidth: this.screenWidth / 2 / this.zoom,
        halfHeight: this.screenHeight / 2 / this.zoom,
      },
      VIEWPORT_PADDING,
      GRID_WIDTH,
      GRID_HEIGHT,
    );
  }

  pan(dx: number, dy: number): void {
    const nextCenterX = clamp(this.centerX + dx / this.zoom, PAN_MIN_X, PAN_MAX_X);
    const nextCenterY = clamp(this.centerY + dy / this.zoom, PAN_MIN_Y, PAN_MAX_Y);
    if (nextCenterX === this.centerX && nextCenterY === this.centerY) return;
    this.centerX = nextCenterX;
    this.centerY = nextCenterY;
    this.onChange?.();
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
    this.onChange?.();
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
  }

  getSnapshot(): ViewportSnapshot {
    return {
      centerX: this.centerX,
      centerY: this.centerY,
      zoom: this.zoom,
    };
  }

  restore(snapshot: ViewportSnapshot): void {
    const nextCenterX = clamp(snapshot.centerX, PAN_MIN_X, PAN_MAX_X);
    const nextCenterY = clamp(snapshot.centerY, PAN_MIN_Y, PAN_MAX_Y);
    const nextZoom = clamp(snapshot.zoom, MIN_ZOOM, MAX_ZOOM);
    const changed =
      nextCenterX !== this.centerX ||
      nextCenterY !== this.centerY ||
      nextZoom !== this.zoom;
    this.centerX = nextCenterX;
    this.centerY = nextCenterY;
    this.zoom = nextZoom;
    if (changed) {
      this.onChange?.();
    }
  }
}
