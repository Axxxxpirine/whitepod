import { Container, Graphics, Sprite, Texture, type Application } from 'pixi.js';
import { createWorldLayer } from './worldLayer';
import type { GameEngine } from '../engine/GameEngine';
import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE, REVEALED_FLAG, WATCHTOWER_REVEAL_RADIUS } from '../constants';
import { WATCHTOWER_BUILDING_TYPE_ID, getBuildingType } from '../data/buildingCatalog';
import type { SelectedTool, TileCoord } from '../types';
import { PIXI } from '@/design/tokens';

const TEX_SCALE = 2; // 2 pixels per tile for smoother edges
const TEX_W = GRID_WIDTH * TEX_SCALE;
const TEX_H = GRID_HEIGHT * TEX_SCALE;
const FOG_ALPHA = 0.92;

const REVEAL_PREVIEW_COLOR = PIXI.accent;
const REVEAL_PREVIEW_STROKE_ALPHA = 0.7;
const REVEAL_PREVIEW_FILL_ALPHA = 0.08;
const REVEAL_PREVIEW_STROKE_WIDTH = 2;

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
    this.container = createWorldLayer();
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

    // Fill with fog
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = `rgba(0, 0, 0, ${FOG_ALPHA})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Erase revealed areas
    ctx.globalCompositeOperation = 'destination-out';

    // Build a path for all revealed tiles, then fill once
    // For smooth edges, find revealed circles and draw them
    // But since we store per-tile flags, we draw per-tile rects with a smooth border
    this.drawRevealedArea(grid.flags);

    ctx.globalCompositeOperation = 'source-over';

    // Update the PixiJS texture from the canvas
    this.texture.source.update();
  }

  private drawRevealedArea(flags: Uint8Array): void {
    const { ctx } = this;

    // First pass: draw all revealed tiles as small rects (clears fog)
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        if (flags[y * GRID_WIDTH + x] & REVEALED_FLAG) {
          ctx.fillStyle = 'rgba(255, 255, 255, 1)';
          ctx.fillRect(x * TEX_SCALE, y * TEX_SCALE, TEX_SCALE, TEX_SCALE);
        }
      }
    }

    // Second pass: smooth the border with a soft gradient
    // For each fogged tile adjacent to a revealed tile, draw a partial alpha clear
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const idx = y * GRID_WIDTH + x;
        if (flags[idx] & REVEALED_FLAG) continue;

        // Check if any neighbor is revealed
        let revealedNeighbors = 0;
        if (x > 0 && flags[idx - 1] & REVEALED_FLAG) revealedNeighbors++;
        if (x < GRID_WIDTH - 1 && flags[idx + 1] & REVEALED_FLAG) revealedNeighbors++;
        if (y > 0 && flags[idx - GRID_WIDTH] & REVEALED_FLAG) revealedNeighbors++;
        if (y < GRID_HEIGHT - 1 && flags[idx + GRID_WIDTH] & REVEALED_FLAG) revealedNeighbors++;
        // Diagonals
        if (x > 0 && y > 0 && flags[idx - GRID_WIDTH - 1] & REVEALED_FLAG) revealedNeighbors++;
        if (x < GRID_WIDTH - 1 && y > 0 && flags[idx - GRID_WIDTH + 1] & REVEALED_FLAG) revealedNeighbors++;
        if (x > 0 && y < GRID_HEIGHT - 1 && flags[idx + GRID_WIDTH - 1] & REVEALED_FLAG) revealedNeighbors++;
        if (x < GRID_WIDTH - 1 && y < GRID_HEIGHT - 1 && flags[idx + GRID_WIDTH + 1] & REVEALED_FLAG) revealedNeighbors++;

        if (revealedNeighbors > 0) {
          // Partial alpha erase — more neighbors = more transparent
          const alpha = Math.min(1, revealedNeighbors / 6);
          ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.fillRect(x * TEX_SCALE, y * TEX_SCALE, TEX_SCALE, TEX_SCALE);
        }
      }
    }
  }

  destroy(): void {
    this.sprite.destroy();
    this.texture.destroy();
    this.container.destroy();
  }
}
