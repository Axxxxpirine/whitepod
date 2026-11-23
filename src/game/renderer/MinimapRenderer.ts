import {
  Container,
  Graphics,
  Polygon,
  Sprite,
  Texture,
  type Application,
  type FederatedPointerEvent,
} from 'pixi.js';
import { PIXI } from '@/design/tokens';
import type { GameEngine } from '../engine/GameEngine';
import { GRID_WIDTH, GRID_HEIGHT, WATCHTOWER_REVEAL_RADIUS } from '../constants';
import { WATCHTOWER_BUILDING_TYPE_ID, getBuildingType } from '../data/buildingCatalog';
import { ResourceType, type SelectedTool, type TileCoord } from '../types';
import {
  MINIMAP_MARGIN,
  MINIMAP_WIDTH,
  createMinimapLayout,
  gridToMinimap,
  isInsideMinimap,
  minimapCircleRadius,
  minimapOutline,
  minimapToWorld,
  viewportOutline,
  type MinimapLayout,
} from './minimapProjection';

interface MinimapPreviewState {
  readonly selectedTool: SelectedTool;
  readonly hoverTile: TileCoord | null;
}

const REBUILD_INTERVAL_MS = 250;

/** Canvas pixels are written as little-endian RGBA words (0xAABBGGRR). */
function rgba(hex: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

const COLOR_HIDDEN = rgba(PIXI.bg);
const COLOR_REVEALED = rgba(PIXI.gridTile);
const COLOR_RESOURCE = rgba(PIXI.accent);
const COLOR_BUILDING = rgba(PIXI.accentWarm);

/**
 * Minimap in the top-right corner: one canvas pixel per tile, scaled down by
 * the sprite; overlays (frame, viewport outline, watchtower preview) are drawn
 * directly in minimap pixels. Click or drag on it to move the camera.
 */
export class MinimapRenderer {
  private readonly app: Application;
  private readonly engine: GameEngine;
  private readonly getPreviewState: () => MinimapPreviewState;
  private readonly layout: MinimapLayout;
  private readonly container: Container;
  private readonly mapSprite: Sprite;
  private readonly frame: Graphics;
  private readonly viewportBorder: Graphics;
  private readonly viewportMask: Graphics;
  private readonly watchtowerPreview: Graphics;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly pixels: Uint32Array;
  private readonly texture: Texture;
  private drawnWorldKey: string | null = null;
  private lastRebuildAt = -Infinity;
  private lastViewportKey = '';
  private isDragging = false;

  constructor(
    app: Application,
    engine: GameEngine,
    getPreviewState: () => MinimapPreviewState,
    width: number = MINIMAP_WIDTH,
  ) {
    this.app = app;
    this.engine = engine;
    this.getPreviewState = getPreviewState;
    this.layout = createMinimapLayout(width);

    this.container = new Container();
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    const outline = minimapOutline(this.layout).flatMap((p) => [p.x, p.y]);
    this.container.hitArea = new Polygon(outline);
    app.stage.addChild(this.container);

    this.canvas = document.createElement('canvas');
    this.canvas.width = GRID_WIDTH;
    this.canvas.height = GRID_HEIGHT;
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(GRID_WIDTH, GRID_HEIGHT);
    this.pixels = new Uint32Array(this.image.data.buffer);

    this.texture = Texture.from(this.canvas);
    this.mapSprite = new Sprite(this.texture);
    this.mapSprite.scale.set(this.layout.scale);
    this.container.addChild(this.mapSprite);

    this.frame = new Graphics();
    this.frame
      .poly(outline)
      .stroke({ color: PIXI.ink, width: 1, alpha: 0.25 });
    this.container.addChild(this.frame);

    this.viewportMask = new Graphics();
    this.viewportMask.poly(outline).fill({ color: 0xffffff });
    this.container.addChild(this.viewportMask);

    this.viewportBorder = new Graphics();
    this.viewportBorder.mask = this.viewportMask;
    this.container.addChild(this.viewportBorder);

    this.watchtowerPreview = new Graphics();
    this.watchtowerPreview.visible = false;
    this.container.addChild(this.watchtowerPreview);

    this.container.on('pointerdown', this.onPointerDown, this);
    this.container.on('globalpointermove', this.onPointerMove, this);
    this.container.on('pointerup', this.onPointerUp, this);
    this.container.on('pointerupoutside', this.onPointerUp, this);

    this.updatePosition();
    this.rebuildTexture();
    this.updateViewportBorder();
  }

  /** True when a canvas-space point (CSS px) falls on the minimap. */
  containsScreenPoint(sx: number, sy: number): boolean {
    return isInsideMinimap(this.layout, sx - this.container.x, sy - this.container.y);
  }

  render(): void {
    this.updatePosition();

    const { viewport } = this.engine;
    // Rebuilt only when the map itself changes (tiles, fog, deposits, buildings):
    // the simulation's own notifications, several a second, show nothing here.
    if (this.worldKey() !== this.drawnWorldKey && performance.now() - this.lastRebuildAt >= REBUILD_INTERVAL_MS) {
      this.rebuildTexture();
    }

    const key = `${viewport.centerX},${viewport.centerY},${viewport.zoom},${viewport.screenWidth},${viewport.screenHeight}`;
    if (key !== this.lastViewportKey) {
      this.updateViewportBorder();
      this.lastViewportKey = key;
    }

    this.renderWatchtowerPreview();
  }

  private updatePosition(): void {
    this.container.x = Math.round(this.app.screen.width - this.layout.width - MINIMAP_MARGIN);
    this.container.y = MINIMAP_MARGIN;
  }

  private renderWatchtowerPreview(): void {
    const { selectedTool, hoverTile } = this.getPreviewState();
    const isWatchtower =
      selectedTool.kind === 'building' && selectedTool.buildingType === WATCHTOWER_BUILDING_TYPE_ID;

    this.watchtowerPreview.clear();
    if (!isWatchtower || !hoverTile) {
      this.watchtowerPreview.visible = false;
      return;
    }

    const center = gridToMinimap(this.layout, hoverTile.x + 0.5, hoverTile.y + 0.5);
    const radius = minimapCircleRadius(this.layout, WATCHTOWER_REVEAL_RADIUS);
    this.watchtowerPreview
      .circle(center.x, center.y, radius)
      .stroke({ color: PIXI.ink, width: 1, alpha: 0.7 });
    this.watchtowerPreview.visible = true;
  }

  private worldKey(): string {
    return `${this.engine.grid.revision}:${this.engine.buildings.revision}`;
  }

  private rebuildTexture(): void {
    const { grid } = this.engine;
    const { pixels } = this;

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const idx = y * GRID_WIDTH + x;
        if (!grid.isRevealed(x, y)) {
          pixels[idx] = COLOR_HIDDEN;
        } else if (grid.resourceType[idx] !== ResourceType.None && grid.resourceAmount[idx] > 0) {
          pixels[idx] = COLOR_RESOURCE;
        } else {
          pixels[idx] = COLOR_REVEALED;
        }
      }
    }

    for (const building of this.engine.getBuildings().values()) {
      const type = getBuildingType(building.typeId);
      if (!type) continue;
      for (let dy = 0; dy < type.footprint.h; dy++) {
        for (let dx = 0; dx < type.footprint.w; dx++) {
          const bx = building.origin.x + dx;
          const by = building.origin.y + dy;
          if (bx >= 0 && bx < GRID_WIDTH && by >= 0 && by < GRID_HEIGHT) {
            pixels[by * GRID_WIDTH + bx] = COLOR_BUILDING;
          }
        }
      }
    }

    this.ctx.putImageData(this.image, 0, 0);
    this.texture.source.update();
    this.drawnWorldKey = this.worldKey();
    this.lastRebuildAt = performance.now();
  }

  private updateViewportBorder(): void {
    const outline = viewportOutline(this.layout, this.engine.viewport);
    this.viewportBorder.clear();
    this.viewportBorder
      .poly(outline.flatMap((p) => [p.x, p.y]))
      .fill({ color: PIXI.ink, alpha: 0.1 })
      .stroke({ color: PIXI.ink, width: 1, alpha: 0.6 });
  }

  private moveCameraTo(event: FederatedPointerEvent): void {
    const local = this.container.toLocal(event.global);
    const target = minimapToWorld(this.layout, local.x, local.y);
    const { viewport } = this.engine;
    viewport.restore({ centerX: target.wx, centerY: target.wy, zoom: viewport.zoom });
  }

  private onPointerDown(event: FederatedPointerEvent): void {
    if (event.button !== 0) return;
    this.isDragging = true;
    this.moveCameraTo(event);
  }

  private onPointerMove(event: FederatedPointerEvent): void {
    if (!this.isDragging) return;
    this.moveCameraTo(event);
  }

  private onPointerUp(): void {
    this.isDragging = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.texture.destroy(true);
  }
}
