import { Sprite, Texture, TilingSprite, type Application, type Container } from 'pixi.js';
import { createWorldLayer } from './worldLayer';
import type { GameEngine } from '../engine/GameEngine';
import { GRID_HEIGHT, GRID_WIDTH, TILE_SIZE } from '../constants';
import { PIXI } from '@/design/tokens';
import type { TileType } from '../types';
import { getTileColor, getTileTexture } from './TileSprite';

/** 0xRRGGBB to the little-endian RGBA word an ImageData buffer stores. */
function toPixel(color: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * One tile of what lies over the ground colour: the regolith grain, and the
 * one-pixel seam on the right and bottom edges that separates tiles.
 *
 * The grain texture is white with darker speckles and used to tint a sprite
 * per tile (colour × brightness). Black at alpha `1 − brightness` over the
 * colour gives the same result, so a single repeated overlay replaces them.
 */
function createTileOverlay(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext('2d')!;
  const drawn = TILE_SIZE - 1;
  ctx.drawImage(getTileTexture().source.resource as CanvasImageSource, 0, 0, drawn, drawn);

  const image = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE);
  const seam = [(PIXI.bg >> 16) & 0xff, (PIXI.bg >> 8) & 0xff, PIXI.bg & 0xff];
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const offset = (y * TILE_SIZE + x) * 4;
      if (x >= drawn || y >= drawn) {
        image.data.set([...seam, 255], offset);
      } else {
        const brightness = image.data[offset]!;
        image.data.set([0, 0, 0, 255 - brightness], offset);
      }
    }
  }
  ctx.putImageData(image, 0, 0);

  const texture = Texture.from(canvas);
  // Zoomed out, a tile is a few pixels wide: mipmaps average the seam instead of letting it flicker.
  texture.source.autoGenerateMipmaps = true;
  texture.source.addressMode = 'repeat';
  texture.source.update();
  return texture;
}

/**
 * The ground: one texture with a texel per tile (its colour), stretched over
 * the map, under one repeated overlay for the grain and the seams. It used to
 * be a tinted sprite per visible tile, tens of thousands when zoomed out,
 * re-pooled on every tile the camera crossed.
 */
export class GridRenderer {
  private readonly tileContainer: Container;
  private readonly engine: GameEngine;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly pixels: Uint32Array;
  private readonly colors: Texture;
  private readonly overlay: Texture;

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.tileContainer = createWorldLayer();

    this.canvas = document.createElement('canvas');
    this.canvas.width = GRID_WIDTH;
    this.canvas.height = GRID_HEIGHT;
    this.ctx = this.canvas.getContext('2d')!;
    this.image = this.ctx.createImageData(GRID_WIDTH, GRID_HEIGHT);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.paint(0, 0, GRID_WIDTH - 1, GRID_HEIGHT - 1);

    this.colors = Texture.from(this.canvas);
    this.colors.source.scaleMode = 'nearest';
    const ground = new Sprite(this.colors);
    ground.scale.set(TILE_SIZE);
    this.tileContainer.addChild(ground);

    this.overlay = createTileOverlay();
    this.tileContainer.addChild(
      new TilingSprite({ texture: this.overlay, width: GRID_WIDTH * TILE_SIZE, height: GRID_HEIGHT * TILE_SIZE }),
    );

    app.stage.addChild(this.tileContainer);
  }

  render(): void {
    const { viewport, grid } = this.engine;

    // Update container transform to apply camera
    this.tileContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.tileContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.tileContainer.scale.set(viewport.zoom);

    // Repaint the tiles that changed (terrain edits, a reveal)
    const dirty = grid.getDirtyRegion();
    if (dirty) {
      this.paint(
        Math.max(0, dirty.x0),
        Math.max(0, dirty.y0),
        Math.min(GRID_WIDTH - 1, dirty.x1),
        Math.min(GRID_HEIGHT - 1, dirty.y1),
      );
      this.colors.source.update();
    }
  }

  /** Writes the colour of every tile of the rectangle (inclusive) into the ground texture. */
  private paint(x0: number, y0: number, x1: number, y1: number): void {
    if (x1 < x0 || y1 < y0) return;
    const { grid } = this.engine;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const index = ty * GRID_WIDTH + tx;
        this.pixels[index] = toPixel(getTileColor(grid.tileType[index] as TileType, tx, ty));
      }
    }
    this.ctx.putImageData(this.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  }

  destroy(): void {
    this.tileContainer.destroy({ children: true });
    this.colors.destroy(true);
    this.overlay.destroy(true);
  }
}
