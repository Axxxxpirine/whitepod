import { Container, Graphics, Sprite, type Application } from 'pixi.js';
import type { GameEngine } from '../engine/GameEngine';
import { TILE_SIZE, GRID_WIDTH } from '../constants';
import type { TileType } from '../types';
import { getTileColor, getTileTexture } from './TileSprite';
import { PIXI } from '@/design/tokens';

const GRID_MIN_VISIBLE_ZOOM = 0.4;
const GRID_FULL_ALPHA_ZOOM = 1;
const GRID_MIN_ALPHA = 0.35;
const AXONOMETRIC_GUIDE_STRIDE_TILES = 1;
const AXONOMETRIC_GUIDE_COLOR = PIXI.inkMuted;

interface Point {
  readonly x: number;
  readonly y: number;
}

export function getGridLineAlpha(zoom: number): number {
  if (zoom < GRID_MIN_VISIBLE_ZOOM) return 0;
  if (zoom >= GRID_FULL_ALPHA_ZOOM) return 1;
  const t = (zoom - GRID_MIN_VISIBLE_ZOOM) / (GRID_FULL_ALPHA_ZOOM - GRID_MIN_VISIBLE_ZOOM);
  return GRID_MIN_ALPHA + t * (1 - GRID_MIN_ALPHA);
}

export function getGridLineWorldWidth(zoom: number): number {
  return 1 / Math.max(zoom, 0.001);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function getAxonometricGuideLineAlpha(zoom: number): number {
  if (zoom < GRID_MIN_VISIBLE_ZOOM) return 0;
  if (zoom < 0.7) {
    const t = (zoom - GRID_MIN_VISIBLE_ZOOM) / 0.3;
    return lerp(0.13, 0.2, t);
  }
  if (zoom < 1.2) {
    const t = (zoom - 0.7) / 0.5;
    return lerp(0.2, 0.18, t);
  }
  if (zoom < 2.2) {
    const t = (zoom - 1.2) / 1;
    return lerp(0.18, 0.2, t);
  }
  return 0.22;
}

export function getOrthographicGridLineAlpha(zoom: number): number {
  void zoom;
  return 0;
}

export class GridRenderer {
  private readonly tileContainer: Container;
  private readonly gridLineContainer: Container;
  private readonly gridLines: Graphics;
  private readonly spritePool: Sprite[] = [];
  private readonly activeSprites: Map<number, Sprite> = new Map();
  private readonly engine: GameEngine;
  private lastRange = { x0: -1, y0: -1, x1: -1, y1: -1 };
  private lastGridLineRange = { x0: -1, y0: -1, x1: -1, y1: -1 };
  private lastGridLineZoom = -1;

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.tileContainer = new Container();
    this.gridLineContainer = new Container();
    this.gridLines = new Graphics();
    this.gridLineContainer.eventMode = 'none';
    this.gridLineContainer.addChild(this.gridLines);
    app.stage.addChild(this.tileContainer);
    app.stage.addChild(this.gridLineContainer);
  }

  render(): void {
    const { viewport, grid } = this.engine;
    const range = this.engine.getVisibleTiles();

    // Update container transform to apply camera
    this.tileContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.tileContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.tileContainer.scale.set(viewport.zoom);
    this.gridLineContainer.x = this.tileContainer.x;
    this.gridLineContainer.y = this.tileContainer.y;
    this.gridLineContainer.scale.set(viewport.zoom);

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
            sprite.x = tx * TILE_SIZE;
            sprite.y = ty * TILE_SIZE;
            this.tileContainer.addChild(sprite);
            this.activeSprites.set(index, sprite);
          }
        }
      }

      this.lastRange = { ...range };
    }

    this.drawGridLines(range, viewport.zoom);

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
    sprite.width = TILE_SIZE;
    sprite.height = TILE_SIZE;
    return sprite;
  }

  private drawGridLines(range: { x0: number; y0: number; x1: number; y1: number }, zoom: number): void {
    const zoomChanged = Math.abs(zoom - this.lastGridLineZoom) > 0.001;
    const rangeChanged =
      range.x0 !== this.lastGridLineRange.x0 ||
      range.y0 !== this.lastGridLineRange.y0 ||
      range.x1 !== this.lastGridLineRange.x1 ||
      range.y1 !== this.lastGridLineRange.y1;

    if (!zoomChanged && !rangeChanged) return;

    const alpha = getOrthographicGridLineAlpha(zoom);
    const axonometricAlpha = getAxonometricGuideLineAlpha(zoom);
    this.gridLines.clear();
    if (alpha <= 0 && axonometricAlpha <= 0) {
      this.lastGridLineZoom = zoom;
      this.lastGridLineRange = { ...range };
      return;
    }

    const width = getGridLineWorldWidth(zoom);
    const xStart = range.x0 * TILE_SIZE;
    const xEnd = (range.x1 + 1) * TILE_SIZE;
    const yStart = range.y0 * TILE_SIZE;
    const yEnd = (range.y1 + 1) * TILE_SIZE;

    if (alpha > 0) {
      for (let tx = range.x0; tx <= range.x1 + 1; tx++) {
        const x = tx * TILE_SIZE;
        this.gridLines
          .moveTo(x, yStart)
          .lineTo(x, yEnd)
          .stroke({ color: PIXI.gridLine, width, alpha });
      }

      for (let ty = range.y0; ty <= range.y1 + 1; ty++) {
        const y = ty * TILE_SIZE;
        this.gridLines
          .moveTo(xStart, y)
          .lineTo(xEnd, y)
          .stroke({ color: PIXI.gridLine, width, alpha });
      }
    }

    if (axonometricAlpha > 0) {
      this.drawAxonometricGuideLines(xStart, yStart, xEnd, yEnd, width * 1.6, axonometricAlpha);
    }

    this.lastGridLineZoom = zoom;
    this.lastGridLineRange = { ...range };
  }

  private drawAxonometricGuideLines(
    xStart: number,
    yStart: number,
    xEnd: number,
    yEnd: number,
    width: number,
    alpha: number,
  ): void {
    const stride = TILE_SIZE * AXONOMETRIC_GUIDE_STRIDE_TILES;
    const minSum = xStart + yStart;
    const maxSum = xEnd + yEnd;
    const minDiff = xStart - yEnd;
    const maxDiff = xEnd - yStart;

    for (let sum = Math.floor(minSum / stride) * stride; sum <= maxSum; sum += stride) {
      this.drawClippedPositiveDiagonal(sum, xStart, yStart, xEnd, yEnd, width, alpha);
    }

    for (let diff = Math.floor(minDiff / stride) * stride; diff <= maxDiff; diff += stride) {
      this.drawClippedNegativeDiagonal(diff, xStart, yStart, xEnd, yEnd, width, alpha);
    }
  }

  private drawClippedPositiveDiagonal(
    sum: number,
    xStart: number,
    yStart: number,
    xEnd: number,
    yEnd: number,
    width: number,
    alpha: number,
  ): void {
    const points: Point[] = [];
    addPoint(points, xStart, sum - xStart, xStart, yStart, xEnd, yEnd);
    addPoint(points, xEnd, sum - xEnd, xStart, yStart, xEnd, yEnd);
    addPoint(points, sum - yStart, yStart, xStart, yStart, xEnd, yEnd);
    addPoint(points, sum - yEnd, yEnd, xStart, yStart, xEnd, yEnd);
    this.drawSegment(points, width, alpha);
  }

  private drawClippedNegativeDiagonal(
    diff: number,
    xStart: number,
    yStart: number,
    xEnd: number,
    yEnd: number,
    width: number,
    alpha: number,
  ): void {
    const points: Point[] = [];
    addPoint(points, xStart, xStart - diff, xStart, yStart, xEnd, yEnd);
    addPoint(points, xEnd, xEnd - diff, xStart, yStart, xEnd, yEnd);
    addPoint(points, yStart + diff, yStart, xStart, yStart, xEnd, yEnd);
    addPoint(points, yEnd + diff, yEnd, xStart, yStart, xEnd, yEnd);
    this.drawSegment(points, width, alpha);
  }

  private drawSegment(points: Point[], width: number, alpha: number): void {
    if (points.length < 2) return;
    const [start, end] = points;
    this.gridLines
      .moveTo(start.x, start.y)
      .lineTo(end.x, end.y)
      .stroke({ color: AXONOMETRIC_GUIDE_COLOR, width, alpha });
  }

  destroy(): void {
    this.tileContainer.destroy({ children: true });
    this.gridLineContainer.destroy({ children: true });
    this.spritePool.length = 0;
    this.activeSprites.clear();
  }
}

function addPoint(
  points: Point[],
  x: number,
  y: number,
  xStart: number,
  yStart: number,
  xEnd: number,
  yEnd: number,
): void {
  if (x < xStart || x > xEnd || y < yStart || y > yEnd) return;
  if (points.some((point) => Math.abs(point.x - x) < 0.001 && Math.abs(point.y - y) < 0.001)) return;
  points.push({ x, y });
}
