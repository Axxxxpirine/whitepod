import { Container, Graphics, type Application } from 'pixi.js';
import { TILE_SIZE } from '../constants';
import { getBuildingType } from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type { SelectedTool, TileCoord } from '../types';
import { getPlacementPreviewModel, type BeltPlacementPreviewModel } from './placementPreviewModel';
import { drawBuildingPortMarkers } from './buildingPortMarkers';
import { PIXI } from '@/design/tokens';

const PREVIEW_INSET = 2;
const VALID_FILL = PIXI.ok;
const VALID_STROKE = PIXI.accent;
const INVALID_FILL = PIXI.error;
const INVALID_STROKE = PIXI.error;

const FLASH_DURATION_MS = 320;
const FLASH_PEAK_ALPHA = 0.65;

interface InvalidFlash {
  readonly origin: TileCoord;
  readonly footprint: { readonly w: number; readonly h: number };
  readonly startedAt: number;
}

interface PreviewState {
  readonly selectedTool: SelectedTool;
  readonly hoverTile: TileCoord | null;
  readonly beltPreview: BeltPlacementPreviewModel | null;
  readonly currentBuildingRotation: import('../types').Direction;
}

export class PlacementPreviewRenderer {
  private readonly previewContainer: Container;
  private readonly previewGraphic: Graphics;
  private readonly flashGraphic: Graphics;
  private readonly engine: GameEngine;
  private readonly getPreviewState: () => PreviewState;
  private activeFlash: InvalidFlash | null = null;

  constructor(app: Application, engine: GameEngine, getPreviewState: () => PreviewState) {
    this.engine = engine;
    this.getPreviewState = getPreviewState;
    this.previewContainer = new Container();
    this.previewGraphic = new Graphics();
    this.previewGraphic.visible = false;
    this.flashGraphic = new Graphics();
    this.flashGraphic.visible = false;
    this.previewContainer.addChild(this.previewGraphic);
    this.previewContainer.addChild(this.flashGraphic);
    app.stage.addChild(this.previewContainer);
  }

  flashInvalid(origin: TileCoord, footprint: { w: number; h: number }): void {
    this.activeFlash = {
      origin,
      footprint,
      startedAt: performance.now(),
    };
  }

  render(): void {
    const { viewport } = this.engine;

    this.previewContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.previewContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.previewContainer.scale.set(viewport.zoom);

    this.renderFlash();

    const { selectedTool, hoverTile, beltPreview, currentBuildingRotation } = this.getPreviewState();
    const preview = getPlacementPreviewModel(
      this.engine,
      selectedTool,
      hoverTile,
      beltPreview,
      currentBuildingRotation,
    );

    if (!preview) {
      this.previewGraphic.visible = false;
      this.previewGraphic.clear();
      return;
    }

    const fillColor = preview.isValid ? VALID_FILL : INVALID_FILL;
    const fillAlpha = preview.isValid ? 0.22 : 0.24;
    const strokeColor = preview.isValid ? VALID_STROKE : INVALID_STROKE;

    this.previewGraphic.clear();

    if (preview.kind === 'belt') {
      for (const tile of preview.tiles) {
        this.previewGraphic
          .rect(
            tile.coord.x * TILE_SIZE + PREVIEW_INSET,
            tile.coord.y * TILE_SIZE + PREVIEW_INSET,
            TILE_SIZE - PREVIEW_INSET * 2,
            TILE_SIZE - PREVIEW_INSET * 2,
          )
          .fill({ color: tile.tint, alpha: fillAlpha })
          .stroke({ color: strokeColor, width: 1, alpha: 0.95 });
      }
    } else {
      this.previewGraphic
        .rect(
          preview.origin.x * TILE_SIZE + PREVIEW_INSET,
          preview.origin.y * TILE_SIZE + PREVIEW_INSET,
          preview.footprint.w * TILE_SIZE - PREVIEW_INSET * 2,
          preview.footprint.h * TILE_SIZE - PREVIEW_INSET * 2,
        )
        .fill({ color: fillColor, alpha: fillAlpha })
        .stroke({ color: strokeColor, width: 1, alpha: 0.95 });

      const type = getBuildingType(preview.buildingTypeId);
      if (type) {
        drawBuildingPortMarkers(this.previewGraphic, {
          id: 0,
          typeId: preview.buildingTypeId,
          origin: preview.origin,
          rotation: preview.rotation,
        }, type);
      }
    }
    this.previewGraphic.visible = true;
  }

  private renderFlash(): void {
    if (!this.activeFlash) {
      if (this.flashGraphic.visible) {
        this.flashGraphic.visible = false;
        this.flashGraphic.clear();
      }
      return;
    }

    const elapsed = performance.now() - this.activeFlash.startedAt;
    if (elapsed >= FLASH_DURATION_MS) {
      this.activeFlash = null;
      this.flashGraphic.visible = false;
      this.flashGraphic.clear();
      return;
    }

    // Ease-out: fast peak, gentle fade.
    const t = elapsed / FLASH_DURATION_MS;
    const alpha = FLASH_PEAK_ALPHA * (1 - t) * (1 - t);

    const { origin, footprint } = this.activeFlash;
    this.flashGraphic.clear();
    this.flashGraphic
      .rect(
        origin.x * TILE_SIZE,
        origin.y * TILE_SIZE,
        footprint.w * TILE_SIZE,
        footprint.h * TILE_SIZE,
      )
      .fill({ color: INVALID_FILL, alpha })
      .stroke({ color: INVALID_STROKE, width: 2, alpha: Math.min(1, alpha * 1.5) });
    this.flashGraphic.visible = true;
  }

  destroy(): void {
    this.previewContainer.destroy({ children: true });
  }
}
