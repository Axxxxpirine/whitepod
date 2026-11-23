import { Container, Sprite, type Application } from 'pixi.js';
import { createWorldLayer } from './worldLayer';
import { GRID_WIDTH, TILE_SIZE } from '../constants';
import type { GameEngine } from '../engine/GameEngine';
import { TileType } from '../types';
import { getTerrainDecalTexture } from './TileSprite';
import { TERRAIN_DECAL_SPECS } from '../ui/spritePaths';

type TerrainDecalKey = keyof typeof TERRAIN_DECAL_SPECS;

const DECAL_WIDTH = TILE_SIZE * 2.2;
const DECAL_HEIGHT = TILE_SIZE * 1.45;
const DECAL_ALPHA = 0.48;
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

export class TerrainDecalRenderer {
  private readonly container: Container;
  private readonly spritePool: Sprite[] = [];
  private readonly activeSprites: Map<number, Sprite> = new Map();
  private readonly engine: GameEngine;
  private lastRange = { x0: -1, y0: -1, x1: -1, y1: -1 };

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.container = createWorldLayer();
    app.stage.addChild(this.container);
  }

  render(): void {
    const { viewport, grid } = this.engine;
    const range = this.engine.getVisibleTiles();

    this.container.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.container.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.container.scale.set(viewport.zoom);

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
        sprite.x = tx * TILE_SIZE + TILE_SIZE / 2;
        sprite.y = ty * TILE_SIZE + TILE_SIZE / 2;
        sprite.rotation = (hashTile(tx, ty, 41) - 0.5) * 0.18;
        sprite.alpha = DECAL_ALPHA;
        this.container.addChild(sprite);
        this.activeSprites.set(index, sprite);
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

  destroy(): void {
    this.container.destroy({ children: true });
    this.spritePool.length = 0;
    this.activeSprites.clear();
  }
}
