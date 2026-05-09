import { Container, Sprite, type Application } from 'pixi.js';
import { GRID_WIDTH, ISO_TILE_H, ISO_TILE_W } from '../constants';
import type { GameEngine } from '../engine/GameEngine';
import { tileCenterToIso } from '../engine/IsoTransform';
import { TileType } from '../types';
import { getTerrainDecalTexture } from './TileSprite';
import { TERRAIN_DECAL_SPECS } from '../ui/spritePaths';
import { PIXI } from '@/design/tokens';

type TerrainDecalKey = keyof typeof TERRAIN_DECAL_SPECS;

// Decal sizes are expressed in iso-world pixels. The 2.2/1.45 ratio (over a
// single iso tile) preserves the proportions used by the source PNGs while
// staying within roughly two diamonds of footprint for the larger crater
// and rock seam decals.
const DECAL_WIDTH = ISO_TILE_W * 1.1;
const DECAL_HEIGHT = ISO_TILE_H * 1.45;
const DECAL_ALPHA = 0.48;
const DECAL_SHADOW_ALPHA = 0.18;
const DECAL_SHADOW_OFFSET_X = -4;
const DECAL_SHADOW_OFFSET_Y = -3;
const CULL_STRIDE = 4;

function hashTile(x: number, y: number, salt: number): number {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function chooseDecal(tileType: TileType, x: number, y: number): TerrainDecalKey | null {
  if (tileType === TileType.Water || tileType === TileType.Empty) return null;
  if ((x + y * GRID_WIDTH) % CULL_STRIDE !== 0) return null;

  const roll = hashTile(x, y, 17);
  if (tileType === TileType.Rock) {
    if (roll < 0.16) return 'rockSeam';
    if (roll < 0.24) return 'regolithScatter';
    return null;
  }

  if (roll < 0.035) return 'crater';
  if (roll < 0.08) return 'regolithScatter';
  if (roll < 0.105) return 'depositOverlay';
  return null;
}

function hasDecalShadow(decalKey: TerrainDecalKey): boolean {
  return decalKey === 'crater' || decalKey === 'rockSeam';
}

export class TerrainDecalRenderer {
  private readonly container: Container;
  private readonly shadowContainer: Container;
  private readonly spritePool: Sprite[] = [];
  private readonly shadowPool: Sprite[] = [];
  private readonly activeSprites: Map<number, Sprite> = new Map();
  private readonly activeShadows: Map<number, Sprite> = new Map();
  private readonly engine: GameEngine;
  private lastRange = { x0: -1, y0: -1, x1: -1, y1: -1 };

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.container = new Container();
    this.shadowContainer = new Container();
    app.stage.addChild(this.shadowContainer);
    app.stage.addChild(this.container);
  }

  render(): void {
    const { viewport, grid } = this.engine;
    const range = this.engine.getVisibleTiles();

    this.container.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.container.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.container.scale.set(viewport.zoom);
    this.shadowContainer.x = this.container.x;
    this.shadowContainer.y = this.container.y;
    this.shadowContainer.scale.set(viewport.zoom);

    const rangeChanged =
      range.x0 !== this.lastRange.x0 ||
      range.y0 !== this.lastRange.y0 ||
      range.x1 !== this.lastRange.x1 ||
      range.y1 !== this.lastRange.y1;

    if (!rangeChanged) return;

    for (const [index, sprite] of this.activeSprites) {
      const tx = index % GRID_WIDTH;
      const ty = Math.floor(index / GRID_WIDTH);
      if (tx < range.x0 || tx > range.x1 || ty < range.y0 || ty > range.y1) {
        this.container.removeChild(sprite);
        sprite.visible = false;
        this.spritePool.push(sprite);
        this.activeSprites.delete(index);
        this.releaseShadow(index);
      }
    }

    for (let ty = range.y0; ty <= range.y1; ty++) {
      for (let tx = range.x0; tx <= range.x1; tx++) {
        const index = ty * GRID_WIDTH + tx;
        if (this.activeSprites.has(index)) continue;

        const decalKey = chooseDecal(grid.tileType[index] as TileType, tx, ty);
        if (!decalKey) continue;

        const texture = getTerrainDecalTexture(decalKey);
        if (!texture) continue;

        const sprite = this.acquireSprite();
        sprite.texture = texture;
        const iso = tileCenterToIso(tx, ty);
        sprite.x = iso.wx;
        sprite.y = iso.wy;
        sprite.rotation = (hashTile(tx, ty, 41) - 0.5) * 0.18;
        sprite.alpha = DECAL_ALPHA;
        this.container.addChild(sprite);
        this.activeSprites.set(index, sprite);

        if (hasDecalShadow(decalKey)) {
          const shadow = this.acquireShadow();
          shadow.texture = texture;
          shadow.x = sprite.x + DECAL_SHADOW_OFFSET_X;
          shadow.y = sprite.y + DECAL_SHADOW_OFFSET_Y;
          shadow.rotation = sprite.rotation;
          this.shadowContainer.addChild(shadow);
          this.activeShadows.set(index, shadow);
        }
      }
    }

    this.lastRange = { ...range };
  }

  private acquireSprite(): Sprite {
    const sprite = this.spritePool.pop() ?? new Sprite();
    sprite.anchor.set(0.5, 0.5);
    sprite.width = DECAL_WIDTH;
    sprite.height = DECAL_HEIGHT;
    sprite.visible = true;
    return sprite;
  }

  private acquireShadow(): Sprite {
    const shadow = this.shadowPool.pop() ?? new Sprite();
    shadow.anchor.set(0.5, 0.5);
    shadow.width = DECAL_WIDTH;
    shadow.height = DECAL_HEIGHT;
    shadow.tint = PIXI.bg;
    shadow.alpha = DECAL_SHADOW_ALPHA;
    shadow.visible = true;
    return shadow;
  }

  private releaseShadow(index: number): void {
    const shadow = this.activeShadows.get(index);
    if (!shadow) return;
    this.shadowContainer.removeChild(shadow);
    shadow.visible = false;
    this.shadowPool.push(shadow);
    this.activeShadows.delete(index);
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.shadowContainer.destroy({ children: true });
    this.spritePool.length = 0;
    this.shadowPool.length = 0;
    this.activeSprites.clear();
    this.activeShadows.clear();
  }
}
