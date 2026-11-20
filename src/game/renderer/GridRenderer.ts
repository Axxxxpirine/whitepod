import { Container, Sprite, type Application } from 'pixi.js';
import type { GameEngine } from '../engine/GameEngine';
import { GRID_WIDTH, ISO_TILE_H, ISO_TILE_W } from '../constants';
import { tileCenterToIso } from '../engine/IsoTransform';
import type { TileType } from '../types';
import { getTileColor, getTileTexture } from './TileSprite';

/**
 * Iso terrain layer. Each logical tile (tx, ty) renders as a 2:1 diamond
 * sprite anchored at its iso center; coloring still flows through getTileColor
 * (regolith / rock / water). Sprite pool + dirty-region updates mirror the
 * top-down version — only positions are now iso-projected.
 *
 * Grid lines are intentionally absent. The diamond tile shapes themselves
 * provide the "drawing-board" cellular reading; placement preview adds a
 * cyan diamond on hover (see PlacementPreviewRenderer).
 */
export class GridRenderer {
  private readonly tileContainer: Container;
  private readonly spritePool: Sprite[] = [];
  private readonly activeSprites: Map<number, Sprite> = new Map();
  private readonly engine: GameEngine;
  private lastRange = { x0: -1, y0: -1, x1: -1, y1: -1 };

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.tileContainer = new Container();
    app.stage.addChild(this.tileContainer);
  }

  render(): void {
    const { viewport, grid } = this.engine;
    const range = this.engine.getVisibleTiles();

    this.tileContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.tileContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.tileContainer.scale.set(viewport.zoom);

    const rangeChanged =
      range.x0 !== this.lastRange.x0 ||
      range.y0 !== this.lastRange.y0 ||
      range.x1 !== this.lastRange.x1 ||
      range.y1 !== this.lastRange.y1;

    if (rangeChanged) {
      // Return sprites that left the view back to the pool
      for (const [index, sprite] of this.activeSprites) {
        const tx = index % GRID_WIDTH;
        const ty = Math.floor(index / GRID_WIDTH);
        if (tx < range.x0 || tx > range.x1 || ty < range.y0 || ty > range.y1) {
          this.tileContainer.removeChild(sprite);
          this.spritePool.push(sprite);
          this.activeSprites.delete(index);
        }
      }

      // Activate sprites for newly visible tiles
      for (let ty = range.y0; ty <= range.y1; ty++) {
        for (let tx = range.x0; tx <= range.x1; tx++) {
          const index = ty * GRID_WIDTH + tx;
          if (!this.activeSprites.has(index)) {
            const sprite = this.acquireSprite();
            sprite.tint = getTileColor(grid.tileType[index] as TileType, tx, ty);
            const iso = tileCenterToIso(tx, ty);
            sprite.x = iso.wx;
            sprite.y = iso.wy;
            this.tileContainer.addChild(sprite);
            this.activeSprites.set(index, sprite);
          }
        }
      }

      this.lastRange = { ...range };
    }

    // Refresh visually changed tiles from dirty region
    const dirty = grid.getDirtyRegion();
    if (dirty) {
      const dx0 = Math.max(dirty.x0, range.x0);
      const dy0 = Math.max(dirty.y0, range.y0);
      const dx1 = Math.min(dirty.x1, range.x1);
      const dy1 = Math.min(dirty.y1, range.y1);
      for (let ty = dy0; ty <= dy1; ty++) {
        for (let tx = dx0; tx <= dx1; tx++) {
          const index = ty * GRID_WIDTH + tx;
          const sprite = this.activeSprites.get(index);
          if (sprite) {
            sprite.tint = getTileColor(grid.tileType[index] as TileType, tx, ty);
          }
        }
      }
    }
  }

  private acquireSprite(): Sprite {
    const sprite = this.spritePool.pop() ?? new Sprite(getTileTexture());
    sprite.anchor.set(0.5, 0.5);
    sprite.width = ISO_TILE_W;
    sprite.height = ISO_TILE_H;
    return sprite;
  }

  destroy(): void {
    this.tileContainer.destroy({ children: true });
    this.spritePool.length = 0;
    this.activeSprites.clear();
  }
}
