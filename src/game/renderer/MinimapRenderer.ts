import { Container, Graphics, Sprite, Texture, type Application } from 'pixi.js';
import type { GameEngine } from '../engine/GameEngine';
import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE, WATCHTOWER_REVEAL_RADIUS } from '../constants';
import type { SelectedTool, TileCoord } from '../types';

interface MinimapPreviewState {
  readonly selectedTool: SelectedTool;
  readonly hoverTile: TileCoord | null;
}

const WATCHTOWER_BUILDING_TYPE_ID = 'watchtower';

export class MinimapRenderer {
  private readonly container: Container;
  private readonly mapSprite: Sprite;
  private readonly viewportBorder: Graphics;
  private readonly watchtowerPreview: Graphics;
  private readonly engine: GameEngine;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly getPreviewState: () => MinimapPreviewState;
  private texture: Texture;
  private lastFogVersion = -1;
  private lastViewportVersion = '';
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartCenterX = 0;
  private dragStartCenterY = 0;
  private minimapSize = 180;

  constructor(
    app: Application,
    engine: GameEngine,
    getPreviewState: () => MinimapPreviewState,
    size: number = 180,
  ) {
    this.engine = engine;
    this.getPreviewState = getPreviewState;
    this.minimapSize = size;

    this.container = new Container();
    this.container.eventMode = 'static';
    // Position in top-right corner (20px from edges)
    this.container.x = app.screen.width - size - 20;
    this.container.y = 20;
    app.stage.addChild(this.container);

    this.canvas = document.createElement('canvas');
    this.canvas.width = GRID_WIDTH;
    this.canvas.height = GRID_HEIGHT;
    this.ctx = this.canvas.getContext('2d')!;

    this.texture = Texture.from(this.canvas);
    this.mapSprite = new Sprite(this.texture);
    this.mapSprite.width = GRID_WIDTH;
    this.mapSprite.height = GRID_HEIGHT;
    this.container.addChild(this.mapSprite);

    this.viewportBorder = new Graphics();
    this.container.addChild(this.viewportBorder);

    this.watchtowerPreview = new Graphics();
    this.watchtowerPreview.visible = false;
    this.container.addChild(this.watchtowerPreview);

    this.container.on('pointerdown', this.onPointerDown.bind(this));
    this.container.on('pointermove', this.onPointerMove.bind(this));
    this.container.on('pointerup', this.onPointerUp.bind(this));
    this.container.on('pointerout', this.onPointerOut.bind(this));

    this.rebuildTexture();
    this.updateViewportBorder();
  }

  render(): void {
    const { viewport, grid } = this.engine;

    this.container.scale.set(this.minimapSize / GRID_WIDTH);

    if (grid.fogVersion !== this.lastFogVersion) {
      this.rebuildTexture();
      this.lastFogVersion = grid.fogVersion;
    }

    const viewportSnapshot = viewport.getSnapshot();
    const versionKey = `${viewportSnapshot.centerX},${viewportSnapshot.centerY},${viewportSnapshot.zoom}`;
    if (versionKey !== this.lastViewportVersion) {
      this.updateViewportBorder();
      this.lastViewportVersion = versionKey;
    }

    this.renderWatchtowerPreview();
  }

  private renderWatchtowerPreview(): void {
    const { selectedTool, hoverTile } = this.getPreviewState();

    const isWatchtower =
      selectedTool.kind === 'building' &&
      selectedTool.buildingType === WATCHTOWER_BUILDING_TYPE_ID;

    if (!isWatchtower || !hoverTile) {
      if (this.watchtowerPreview.visible) {
        this.watchtowerPreview.visible = false;
        this.watchtowerPreview.clear();
      }
      return;
    }

    const radiusPx = WATCHTOWER_REVEAL_RADIUS;
    const centerPx = { x: hoverTile.x, y: hoverTile.y };

    this.watchtowerPreview.clear();
    this.watchtowerPreview
      .circle(centerPx.x, centerPx.y, radiusPx)
      .stroke({ color: 0xFFFFFF, width: 1, alpha: 0.7 });

    this.watchtowerPreview.visible = true;
  }

  private rebuildTexture(): void {
    const { ctx, canvas } = this;
    const { grid } = this.engine;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0B0D10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.globalCompositeOperation = 'source-over';

    this.drawRevealedArea(grid.flags);
    this.drawResources();
    this.drawBuildings();

    this.texture.source.update();
  }

  private drawRevealedArea(flags: Uint8Array): void {
    const { ctx } = this;

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const idx = y * GRID_WIDTH + x;
        if (flags[idx] & 0x01) {
          ctx.fillStyle = '#181A1F';
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  private drawResources(): void {
    const { ctx } = this;
    ctx.fillStyle = '#6EE7FF';

    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = 0; x < GRID_WIDTH; x++) {
        const resource = this.engine.getResourceAt(x, y);
        if (resource !== 0) {
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }

  private drawBuildings(): void {
    const { ctx } = this;
    const buildings = this.engine.getBuildings();

    ctx.fillStyle = '#F2B36B';

    for (const building of buildings.values()) {
      const type = this.getBuildingType(building.typeId);
      if (!type) continue;

      const w = type.footprint.w;
      const h = type.footprint.h;

      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const bx = building.origin.x + dx;
          const by = building.origin.y + dy;
          if (bx >= 0 && bx < GRID_WIDTH && by >= 0 && by < GRID_HEIGHT) {
            ctx.fillRect(bx, by, 1, 1);
          }
        }
      }
    }
  }

  private getBuildingType(typeId: string): { footprint: { w: number; h: number } } | null {
    const catalog: Record<string, { footprint: { w: number; h: number } }> = {
      solar_panel: { footprint: { w: 2, h: 2 } },
      battery: { footprint: { w: 2, h: 2 } },
      extractor: { footprint: { w: 2, h: 2 } },
      storage: { footprint: { w: 3, h: 3 } },
      converter: { footprint: { w: 2, h: 2 } },
      synthesizer: { footprint: { w: 3, h: 3 } },
      watchtower: { footprint: { w: 2, h: 2 } },
      merger: { footprint: { w: 2, h: 2 } },
      splitter: { footprint: { w: 2, h: 2 } },
    };
    return catalog[typeId] || null;
  }

  private updateViewportBorder(): void {
    const { viewport } = this.engine;

    const halfW = viewport.screenWidth / 2 / viewport.zoom;
    const halfH = viewport.screenHeight / 2 / viewport.zoom;

    const x0 = Math.max(0, (viewport.centerX - halfW) / TILE_SIZE);
    const y0 = Math.max(0, (viewport.centerY - halfH) / TILE_SIZE);
    const x1 = Math.min(GRID_WIDTH, (viewport.centerX + halfW) / TILE_SIZE);
    const y1 = Math.min(GRID_HEIGHT, (viewport.centerY + halfH) / TILE_SIZE);

    const width = x1 - x0;
    const height = y1 - y0;

    this.viewportBorder.clear();
    this.viewportBorder
      .rect(x0, y0, width, height)
      .stroke({ color: 0xFFFFFF, width: 1.5, alpha: 0.6 })
      .fill({ color: 0xFFFFFF, alpha: 0.1 });
  }

  private onPointerDown(event: any): void {
    this.isDragging = true;
    this.dragStartX = event.data.global.x;
    this.dragStartY = event.data.global.y;

    this.dragStartCenterX = this.engine.viewport.centerX;
    this.dragStartCenterY = this.engine.viewport.centerY;
  }

  private onPointerMove(event: any): void {
    if (!this.isDragging) return;

    const dx = event.data.global.x - this.dragStartX;
    const dy = event.data.global.y - this.dragStartY;

    const worldDx = (dx / this.minimapSize) * GRID_WIDTH * TILE_SIZE;
    const worldDy = (dy / this.minimapSize) * GRID_HEIGHT * TILE_SIZE;

    const newCenterX = Math.max(
      0,
      Math.min(
        GRID_WIDTH * TILE_SIZE,
        this.dragStartCenterX + worldDx,
      ),
    );
    const newCenterY = Math.max(
      0,
      Math.min(
        GRID_HEIGHT * TILE_SIZE,
        this.dragStartCenterY + worldDy,
      ),
    );

    this.engine.viewport.centerX = newCenterX;
    this.engine.viewport.centerY = newCenterY;
  }

  private onPointerUp(): void {
    if (!this.isDragging) {
      const clickX = this.dragStartX;
      const clickY = this.dragStartY;

      const centerX = (clickX / this.minimapSize) * GRID_WIDTH * TILE_SIZE;
      const centerY = (clickY / this.minimapSize) * GRID_HEIGHT * TILE_SIZE;

      this.engine.viewport.centerX = Math.max(
        0,
        Math.min(GRID_WIDTH * TILE_SIZE, centerX),
      );
      this.engine.viewport.centerY = Math.max(
        0,
        Math.min(GRID_HEIGHT * TILE_SIZE, centerY),
      );
    }
    this.isDragging = false;
  }

  private onPointerOut(): void {
    this.isDragging = false;
  }

  destroy(): void {
    this.mapSprite.destroy();
    this.texture.destroy();
    this.viewportBorder.destroy();
    this.watchtowerPreview.destroy();
    this.container.destroy();
  }
}
