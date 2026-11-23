import { Container, Sprite, type Application } from 'pixi.js';
import { createWorldLayer } from './worldLayer';
import type { GameEngine } from '../engine/GameEngine';
import { TILE_SIZE, GRID_WIDTH } from '../constants';
import { ResourceType } from '../types';
import type { ResourceType as ResourceTypeT } from '../types';
import { getResourceTexture } from './TileSprite';
import { isRichVein } from '../data/depositAmounts';
import { forEachTileEntering } from './visibleTiles';

const RESOURCE_SPRITE_SIZE = TILE_SIZE - 2;
/** Rich veins read a size larger than ordinary deposits, so exploring finds them. */
const RICH_VEIN_SPRITE_SIZE = Math.round(TILE_SIZE * 1.25);

export class ResourceRenderer {
  private readonly resourceContainer: Container;
  private readonly spritePool: Sprite[] = [];
  private readonly activeSprites: Map<number, Sprite> = new Map();
  private readonly engine: GameEngine;
  private lastRange = { x0: -1, y0: -1, x1: -1, y1: -1 };

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.resourceContainer = createWorldLayer();
    app.stage.addChild(this.resourceContainer);
  }

  render(): void {
    const { viewport, grid } = this.engine;
    const range = this.engine.getVisibleTiles();

    // Sync container transform with camera
    this.resourceContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.resourceContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.resourceContainer.scale.set(viewport.zoom);

    const rangeChanged =
      range.x0 !== this.lastRange.x0 ||
      range.y0 !== this.lastRange.y0 ||
      range.x1 !== this.lastRange.x1 ||
      range.y1 !== this.lastRange.y1;

    if (rangeChanged) {
      // Return sprites that left the view
      for (const [index, sprite] of this.activeSprites) {
        const tx = index % GRID_WIDTH;
        const ty = Math.floor(index / GRID_WIDTH);
        if (tx < range.x0 || tx > range.x1 || ty < range.y0 || ty > range.y1) {
          this.resourceContainer.removeChild(sprite);
          sprite.visible = false;
          this.spritePool.push(sprite);
          this.activeSprites.delete(index);
        }
      }

      // Create sprites for the deposits on the tiles that came into view
      forEachTileEntering(this.lastRange, range, (tx, ty) => {
        const index = ty * GRID_WIDTH + tx;
        if (this.activeSprites.has(index)) return;

        const resourceType = this.visibleResource(index);
        if (resourceType === ResourceType.None) return;

        const texture = getResourceTexture(resourceType);
        if (!texture) return;

        const sprite = this.acquireSprite(resourceType);
        this.placeSprite(sprite, tx, ty);
        this.resourceContainer.addChild(sprite);
        this.activeSprites.set(index, sprite);
      });

      this.lastRange = { ...range };
    }

    // Handle dirty region updates
    const dirty = grid.getDirtyRegion();
    if (dirty) {
      const dx0 = Math.max(dirty.x0, range.x0);
      const dy0 = Math.max(dirty.y0, range.y0);
      const dx1 = Math.min(dirty.x1, range.x1);
      const dy1 = Math.min(dirty.y1, range.y1);

      for (let ty = dy0; ty <= dy1; ty++) {
        for (let tx = dx0; tx <= dx1; tx++) {
          const index = ty * GRID_WIDTH + tx;
          const resourceType = this.visibleResource(index);
          const existing = this.activeSprites.get(index);

          if (resourceType === ResourceType.None) {
            // Remove sprite if resource was cleared
            if (existing) {
              this.resourceContainer.removeChild(existing);
              existing.visible = false;
              this.spritePool.push(existing);
              this.activeSprites.delete(index);
            }
          } else {
            const texture = getResourceTexture(resourceType);
            if (!texture) continue;

            if (existing) {
              // Update texture if resource type changed
              existing.texture = texture;
            } else {
              // Add new sprite
              const sprite = this.acquireSprite(resourceType);
              this.placeSprite(sprite, tx, ty);
              this.resourceContainer.addChild(sprite);
              this.activeSprites.set(index, sprite);
            }
          }
        }
      }
    }
  }

  /** The deposit drawn on a tile: none once it is exhausted. */
  private visibleResource(index: number): ResourceTypeT {
    const { grid } = this.engine;
    return grid.resourceAmount[index] === 0 ? ResourceType.None : (grid.resourceType[index] as ResourceTypeT);
  }

  private placeSprite(sprite: Sprite, tx: number, ty: number): void {
    // Amounts only matter where deposits run out (campaign).
    const rich = this.engine.depletesDeposits && isRichVein(tx, ty, this.engine.mapSeed);
    const size = rich ? RICH_VEIN_SPRITE_SIZE : RESOURCE_SPRITE_SIZE;
    sprite.width = size;
    sprite.height = size;
    sprite.x = tx * TILE_SIZE + (TILE_SIZE - size) / 2;
    sprite.y = ty * TILE_SIZE + (TILE_SIZE - size) / 2;
  }

  private acquireSprite(resourceType: ResourceTypeT): Sprite {
    const sprite = this.spritePool.pop() ?? new Sprite();
    const texture = getResourceTexture(resourceType);
    if (texture) sprite.texture = texture;
    sprite.visible = true;
    return sprite;
  }

  destroy(): void {
    this.resourceContainer.destroy({ children: true });
    this.spritePool.length = 0;
    this.activeSprites.clear();
  }
}
