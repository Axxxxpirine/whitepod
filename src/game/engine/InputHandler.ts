import type { GameEngine } from './GameEngine';
import { ResourceType, type BuildingId, type Direction, type SelectedTool, type TileCoord } from '../types';
import { screenToGrid } from './CoordinateTransform';
import { isInBounds } from '../data/coords';

export class InputHandler {
  private readonly engine: GameEngine;
  private readonly getSelectedTool: () => SelectedTool;
  private readonly getBuildingRotation: () => Direction;
  private isPanning = false;
  private lastPanX = 0;
  private lastPanY = 0;
  private onHoverChange: ((tile: { x: number; y: number } | null) => void) | null = null;
  private onBuildingPlaced: ((buildingId: BuildingId) => void) | null = null;
  private onBuildingSelected: ((buildingId: BuildingId | null) => void) | null = null;
  private onResourceSelected: ((tile: TileCoord | null) => void) | null = null;
  private onEnergyLinkClick: ((buildingId: BuildingId) => void) | null = null;
  private onOutOfGridClick: (() => void) | null = null;
  private onInvalidPlacement:
    | ((origin: { x: number; y: number }, buildingType: string) => void)
    | null = null;

  constructor(
    engine: GameEngine,
    getSelectedTool: () => SelectedTool,
    getBuildingRotation: () => Direction,
  ) {
    this.engine = engine;
    this.getSelectedTool = getSelectedTool;
    this.getBuildingRotation = getBuildingRotation;
  }

  setHoverCallback(cb: (tile: { x: number; y: number } | null) => void): void {
    this.onHoverChange = cb;
  }

  setBuildingPlacedCallback(cb: ((buildingId: BuildingId) => void) | null): void {
    this.onBuildingPlaced = cb;
  }

  setBuildingSelectedCallback(cb: ((buildingId: BuildingId | null) => void) | null): void {
    this.onBuildingSelected = cb;
  }

  setResourceSelectedCallback(cb: ((tile: TileCoord | null) => void) | null): void {
    this.onResourceSelected = cb;
  }

  setEnergyLinkClickCallback(cb: ((buildingId: BuildingId) => void) | null): void {
    this.onEnergyLinkClick = cb;
  }

  setOutOfGridClickCallback(cb: (() => void) | null): void {
    this.onOutOfGridClick = cb;
  }

  setInvalidPlacementCallback(
    cb: ((origin: { x: number; y: number }, buildingType: string) => void) | null,
  ): void {
    this.onInvalidPlacement = cb;
  }

  onPointerDown(screenX: number, screenY: number, button: number): void {
    if (button === 1 || button === 2) {
      this.isPanning = true;
      this.lastPanX = screenX;
      this.lastPanY = screenY;
      return;
    }

    if (button !== 0) return;

    const coord = screenToGrid(this.engine.viewport, screenX, screenY);
    if (!isInBounds(coord.x, coord.y)) {
      this.onOutOfGridClick?.();
      return;
    }

    const selectedTool = this.getSelectedTool();
    if (selectedTool.kind === 'select') {
      const building = this.engine.getBuildingAt(coord.x, coord.y);
      if (building) {
        this.onBuildingSelected?.(building.id);
        this.onResourceSelected?.(null);
        return;
      }

      const resource = this.engine.getResourceAt(coord.x, coord.y);
      if (resource !== ResourceType.None) {
        this.onBuildingSelected?.(null);
        this.onResourceSelected?.(coord);
        return;
      }

      this.onBuildingSelected?.(null);
      this.onResourceSelected?.(null);
      return;
    }

    if (selectedTool.kind === 'building') {
      const buildingId = this.engine.placeBuilding(
        selectedTool.buildingType,
        coord,
        this.getBuildingRotation(),
      );
      if (buildingId !== null) {
        this.onBuildingPlaced?.(buildingId);
      } else {
        this.onInvalidPlacement?.(coord, selectedTool.buildingType);
      }
      return;
    }

    // Belt tool handled by BeltToolController with drag-to-route semantics.
    if (selectedTool.kind === 'belt') {
      return;
    }

    if (selectedTool.kind === 'energy_link') {
      const building = this.engine.getBuildingAt(coord.x, coord.y);
      if (!building) {
        this.onBuildingSelected?.(null);
        return;
      }
      this.onEnergyLinkClick?.(building.id);
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

  onWheel(screenX: number, screenY: number, deltaX: number, deltaY: number, ctrlKey: boolean, deltaMode: number, shiftKey: boolean = false): void {
    if (ctrlKey) {
      const factor = Math.pow(1.01, -deltaY);
      this.engine.viewport.zoomAt(screenX, screenY, factor);
    } else if (shiftKey) {
      const factor = deltaY < 0 ? 1.1 : 0.9;
      this.engine.viewport.zoomAt(screenX, screenY, factor);
    } else if (deltaMode !== 0 || Math.abs(deltaY) >= 50) {
      const factor = deltaY < 0 ? 1.1 : 0.9;
      this.engine.viewport.zoomAt(screenX, screenY, factor);
    } else {
      this.engine.viewport.pan(deltaX, deltaY);
    }
  }
}
