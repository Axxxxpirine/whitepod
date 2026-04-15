import { Container, Graphics, type Application } from 'pixi.js';
import { TILE_SIZE } from '../constants';
import type { GameEngine } from '../engine/GameEngine';
import type { SelectedTool, TileCoord } from '../types';
import { getPlacementPreviewModel } from './placementPreviewModel';

const PREVIEW_INSET = 2;
const VALID_FILL = 0x22c55e;
const VALID_STROKE = 0x86efac;
const INVALID_FILL = 0xef4444;
const INVALID_STROKE = 0xfca5a5;

interface PreviewState {
  readonly selectedTool: SelectedTool;
  readonly hoverTile: TileCoord | null;
}

export class PlacementPreviewRenderer {
  private readonly previewContainer: Container;
  private readonly previewGraphic: Graphics;
  private readonly engine: GameEngine;
  private readonly getPreviewState: () => PreviewState;

  constructor(app: Application, engine: GameEngine, getPreviewState: () => PreviewState) {
    this.engine = engine;
    this.getPreviewState = getPreviewState;
    this.previewContainer = new Container();
    this.previewGraphic = new Graphics();
    this.previewGraphic.visible = false;
    this.previewContainer.addChild(this.previewGraphic);
    app.stage.addChild(this.previewContainer);
  }

  render(): void {
    const { viewport } = this.engine;

    this.previewContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.previewContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.previewContainer.scale.set(viewport.zoom);

    const { selectedTool, hoverTile } = this.getPreviewState();
    const preview = getPlacementPreviewModel(this.engine, selectedTool, hoverTile);

    if (!preview) {
      this.previewGraphic.visible = false;
      this.previewGraphic.clear();
      return;
    }

    const fillColor = preview.isValid ? VALID_FILL : INVALID_FILL;
    const fillAlpha = preview.isValid ? 0.22 : 0.24;
    const strokeColor = preview.isValid ? VALID_STROKE : INVALID_STROKE;

    this.previewGraphic
      .clear()
      .rect(
        preview.origin.x * TILE_SIZE + PREVIEW_INSET,
        preview.origin.y * TILE_SIZE + PREVIEW_INSET,
        preview.footprint.w * TILE_SIZE - PREVIEW_INSET * 2,
        preview.footprint.h * TILE_SIZE - PREVIEW_INSET * 2,
      )
      .fill({ color: fillColor, alpha: fillAlpha })
      .stroke({ color: strokeColor, width: 1, alpha: 0.95 });
    this.previewGraphic.visible = true;
  }

  destroy(): void {
    this.previewContainer.destroy({ children: true });
  }
}
