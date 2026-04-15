import type { GameEngine } from './GameEngine';
import { TileType } from '../types';
import { screenToGrid } from './CoordinateTransform';
import { isInBounds } from '../data/coords';

export class InputHandler {
  private readonly engine: GameEngine;
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  onPointerDown(screenX: number, screenY: number, button: number): void {
    if (button === 1 || button === 2) {
      this.isPanning = true;
      this.lastPanX = screenX;
      this.lastPanY = screenY;
    } else if (button === 0) {
      const coord = screenToGrid(this.engine.viewport, screenX, screenY);
      if (isInBounds(coord.x, coord.y)) {
        this.engine.placeTile(coord.x, coord.y, TileType.Ground);
      }
    }
  }

  onPointerMove(screenX: number, screenY: number): void {
    if (this.isPanning) {
      const dx = screenX - this.lastPanX;
      const dy = screenY - this.lastPanY;
      this.engine.viewport.pan(-dx, -dy);
      this.lastPanX = screenX;
      this.lastPanY = screenY;
    }
  }

  onPointerUp(): void {
    this.isPanning = false;
  }

  onWheel(screenX: number, screenY: number, deltaX: number, deltaY: number, ctrlKey: boolean, deltaMode: number): void {
    if (ctrlKey) {
      // Trackpad pinch — proportional zoom, factor calibré pour les petits deltas
      const factor = Math.pow(1.01, -deltaY);
      this.engine.viewport.zoomAt(screenX, screenY, factor);
    } else if (deltaMode !== 0 || Math.abs(deltaY) >= 50) {
      // Molette souris — zoom discret
      const factor = deltaY < 0 ? 1.1 : 0.9;
      this.engine.viewport.zoomAt(screenX, screenY, factor);
    } else {
      // Scroll deux doigts trackpad — pan
      this.engine.viewport.pan(deltaX, deltaY);
    }
  }
}
