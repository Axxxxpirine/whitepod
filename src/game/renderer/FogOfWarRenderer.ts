import { Container, Graphics, Sprite, Texture, type Application } from 'pixi.js';
import type { GameEngine } from '../engine/GameEngine';
import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE, REVEALED_FLAG, WATCHTOWER_REVEAL_RADIUS } from '../constants';
import { WATCHTOWER_BUILDING_TYPE_ID, getBuildingType } from '../data/buildingCatalog';
import type { SelectedTool, TileCoord } from '../types';
import { PIXI } from '@/design/tokens';

const TEX_SCALE = 2; // 2 pixels per tile for smoother edges
const TEX_W = GRID_WIDTH * TEX_SCALE;
const TEX_H = GRID_HEIGHT * TEX_SCALE;
const DEEP_FOG_COLOR = { r: 2, g: 3, b: 10 };
const EARTHLIGHT_FOG_COLOR = { r: 26, g: 42, b: 58 };

const REVEAL_PREVIEW_COLOR = PIXI.accent;
const REVEAL_PREVIEW_STROKE_ALPHA = 0.7;
const REVEAL_PREVIEW_FILL_ALPHA = 0.08;
const REVEAL_PREVIEW_STROKE_WIDTH = 2;

export interface FogTileStyle {
  readonly color: { readonly r: number; readonly g: number; readonly b: number };
  readonly alpha: number;
}

export function getFogTileStyle(flags: Uint8Array, x: number, y: number): FogTileStyle {
  const idx = y * GRID_WIDTH + x;
  if (flags[idx] & REVEALED_FLAG) {
    return { color: DEEP_FOG_COLOR, alpha: 0 };
  }

  let nearestRevealed = Number.POSITIVE_INFINITY;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= GRID_WIDTH || ny < 0 || ny >= GRID_HEIGHT) continue;
      if (flags[ny * GRID_WIDTH + nx] & REVEALED_FLAG) {
        nearestRevealed = Math.min(nearestRevealed, Math.max(Math.abs(dx), Math.abs(dy)));
      }
    }
  }

  if (nearestRevealed === 1) {
    return { color: EARTHLIGHT_FOG_COLOR, alpha: 0.35 };
  }
  if (nearestRevealed === 2) {
    return { color: EARTHLIGHT_FOG_COLOR, alpha: 0.68 };
  }
  return { color: DEEP_FOG_COLOR, alpha: 0.95 };
}

interface FogPreviewState {
  readonly selectedTool: SelectedTool;
  readonly hoverTile: TileCoord | null;
}

export class FogOfWarRenderer {
  private readonly container: Container;
  private readonly sprite: Sprite;
  private readonly revealPreview: Graphics;
  private readonly engine: GameEngine;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly getPreviewState: () => FogPreviewState;
  private texture: Texture;
  private lastFogVersion = -1;
  private lastPreviewX = -1;
  private lastPreviewY = -1;
  private lastPreviewVisible = false;

  constructor(
    app: Application,
    engine: GameEngine,
    getPreviewState: () => FogPreviewState,
  ) {
    this.engine = engine;
    this.getPreviewState = getPreviewState;
    this.container = new Container();
    this.container.eventMode = 'none';
    app.stage.addChild(this.container);

    this.canvas = document.createElement('canvas');
    this.canvas.width = TEX_W;
    this.canvas.height = TEX_H;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = Texture.from(this.canvas);
    this.sprite = new Sprite(this.texture);
    this.sprite.width = GRID_WIDTH * TILE_SIZE;
    this.sprite.height = GRID_HEIGHT * TILE_SIZE;
    this.container.addChild(this.sprite);

    this.revealPreview = new Graphics();
    this.revealPreview.visible = false;
    this.container.addChild(this.revealPreview);

    this.rebuildTexture();
  }

  render(): void {
    const { viewport, grid } = this.engine;

    this.container.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.container.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.container.scale.set(viewport.zoom);

    if (grid.fogVersion !== this.lastFogVersion) {
      this.rebuildTexture();
      this.lastFogVersion = grid.fogVersion;
    }

    this.renderRevealPreview();
  }

  private renderRevealPreview(): void {
    const { selectedTool, hoverTile } = this.getPreviewState();

    const isWatchtower =
      selectedTool.kind === 'building' &&
      selectedTool.buildingType === WATCHTOWER_BUILDING_TYPE_ID;

    if (!isWatchtower || !hoverTile) {
      if (this.lastPreviewVisible) {
        this.revealPreview.visible = false;
        this.revealPreview.clear();
        this.lastPreviewVisible = false;
      }
      return;
    }

    const type = getBuildingType(WATCHTOWER_BUILDING_TYPE_ID)!;
    const cx = hoverTile.x + Math.floor(type.footprint.w / 2);
    const cy = hoverTile.y + Math.floor(type.footprint.h / 2);

    if (cx === this.lastPreviewX && cy === this.lastPreviewY && this.lastPreviewVisible) {
      return;
    }

    const radiusPx = WATCHTOWER_REVEAL_RADIUS * TILE_SIZE;
    const centerPx = { x: cx * TILE_SIZE + TILE_SIZE / 2, y: cy * TILE_SIZE + TILE_SIZE / 2 };

    this.revealPreview.clear();
    this.revealPreview
      .circle(centerPx.x, centerPx.y, radiusPx)
      .fill({ color: REVEAL_PREVIEW_COLOR, alpha: REVEAL_PREVIEW_FILL_ALPHA })
      .stroke({
        color: REVEAL_PREVIEW_COLOR,
        width: REVEAL_PREVIEW_STROKE_WIDTH,
        alpha: REVEAL_PREVIEW_STROKE_ALPHA,
      });

    this.revealPreview.visible = true;
    this.lastPreviewX = cx;
    this.lastPreviewY = cy;
    this.lastPreviewVisible = true;
  }

  private rebuildTexture(): void {
    const { ctx, canvas } = this;
    const { grid } = this.engine;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.drawFogTiles(grid.flags);

    // Update the PixiJS texture from the canvas
    this.texture.source.update();
  }

  private drawFogTiles(flags: Uint8Array): void {
    const { ctx } = this;

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const style = getFogTileStyle(flags, x, y);
        if (style.alpha <= 0) continue;
        ctx.fillStyle = `rgba(${style.color.r}, ${style.color.g}, ${style.color.b}, ${style.alpha})`;
        ctx.fillRect(x * TEX_SCALE, y * TEX_SCALE, TEX_SCALE, TEX_SCALE);
      }
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.texture.destroy();
    this.container.destroy();
  }
}
