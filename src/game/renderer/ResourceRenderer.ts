import { Container, Sprite, type Application } from 'pixi.js';
import type { GameEngine } from '../engine/GameEngine';
import { GRID_WIDTH, ISO_TILE_H, ISO_TILE_W } from '../constants';
import { tileCenterToIso } from '../engine/IsoTransform';
import { ResourceType } from '../types';
import type { ResourceType as ResourceTypeT } from '../types';
import { getResourceTexture } from './TileSprite';

// Resource sprites sit slightly inside the diamond — fit them inside the
// inscribed rectangle of the iso diamond rather than the diamond's bbox.
const RESOURCE_SPRITE_WIDTH = Math.round(ISO_TILE_W * 0.7);
const RESOURCE_SPRITE_HEIGHT = Math.round(ISO_TILE_H * 0.7);

export class ResourceRenderer {
  private readonly resourceContainer: Container;
  private readonly spritePool: Sprite[] = [];
  private readonly activeSprites: Map<number, Sprite> = new Map();
  private readonly engine: GameEngine;
  private lastRange = { x0: -1, y0: -1, x1: -1, y1: -1 };

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.resourceContainer = new Container();
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

      // Create sprites for newly visible tiles with resources
      for (let ty = range.y0; ty <= range.y1; ty++) {
        for (let tx = range.x0; tx <= range.x1; tx++) {
          const index = ty * GRID_WIDTH + tx;
          if (this.activeSprites.has(index)) continue;

          const resourceType = grid.resourceType[index] as ResourceTypeT;
          if (resourceType === ResourceType.None) continue;

          const texture = getResourceTexture(resourceType);
          if (!texture) continue;

          const sprite = this.acquireSprite(resourceType);
          const iso = tileCenterToIso(tx, ty);
          sprite.x = iso.wx;
          sprite.y = iso.wy;
          this.resourceContainer.addChild(sprite);
          this.activeSprites.set(index, sprite);
        }
      }

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
          const resourceType = grid.resourceType[index] as ResourceTypeT;
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
              const iso = tileCenterToIso(tx, ty);
              sprite.x = iso.wx;
              sprite.y = iso.wy;
              this.resourceContainer.addChild(sprite);
              this.activeSprites.set(index, sprite);
            }
          }
        }
      }
    }
  }

  private acquireSprite(resourceType: ResourceTypeT): Sprite {
    const sprite = this.spritePool.pop() ?? new Sprite();
    const texture = getResourceTexture(resourceType);
    if (texture) sprite.texture = texture;
    sprite.anchor.set(0.5, 0.5);
    sprite.width = RESOURCE_SPRITE_WIDTH;
    sprite.height = RESOURCE_SPRITE_HEIGHT;
    sprite.visible = true;
    return sprite;
  }

  destroy(): void {
    this.resourceContainer.destroy({ children: true });
    this.spritePool.length = 0;
    this.activeSprites.clear();
  }
}
