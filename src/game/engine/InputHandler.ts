import type { GameEngine } from './GameEngine';
import type { BuildingId, SelectedTool } from '../types';
import { screenToGrid } from './CoordinateTransform';
import { isInBounds } from '../data/coords';

export class InputHandler {
  private readonly engine: GameEngine;
  private readonly getSelectedTool: () => SelectedTool;
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private onHoverChange: ((tile: { x: number; y: number } | null) => void) | null = null;
  private onBuildingPlaced: (() => void) | null = null;
  private onBuildingSelected: ((buildingId: BuildingId | null) => void) | null = null;

  constructor(engine: GameEngine, getSelectedTool: () => SelectedTool) {
    this.engine = engine;
    this.getSelectedTool = getSelectedTool;
  }

  setHoverCallback(cb: (tile: { x: number; y: number } | null) => void): void {
    this.onHoverChange = cb;
  }

  setBuildingPlacedCallback(cb: (() => void) | null): void {
    this.onBuildingPlaced = cb;
  }

  setBuildingSelectedCallback(cb: ((buildingId: BuildingId | null) => void) | null): void {
    this.onBuildingSelected = cb;
  }

  onPointerDown(screenX: number, screenY: number, button: number): void {
    if (button === 1 || button === 2) {
      this.isPanning = true;
      this.lastPanX = screenX;
      this.lastPanY = screenY;
    } else if (button === 0) {
      const coord = screenToGrid(this.engine.viewport, screenX, screenY);
      if (!isInBounds(coord.x, coord.y)) return;

      const selectedTool = this.getSelectedTool();
      if (selectedTool.kind === 'select') {
        const building = this.engine.getBuildingAt(coord.x, coord.y);
        this.onBuildingSelected?.(building?.id ?? null);
        return;
      }

      const buildingId = this.engine.placeBuilding(selectedTool.buildingType, coord);
      if (buildingId !== null) {
        this.onBuildingPlaced?.();
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

    if (this.onHoverChange) {
      const coord = screenToGrid(this.engine.viewport, screenX, screenY);
      if (isInBounds(coord.x, coord.y)) {
        this.onHoverChange(coord);
      } else {
        this.onHoverChange(null);
      }
    }
  }

  onPointerUp(): void {
    this.isPanning = false;
  }

  onPointerLeave(): void {
    this.isPanning = false;
    this.onHoverChange?.(null);
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
