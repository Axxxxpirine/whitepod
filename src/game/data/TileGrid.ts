import { GRID_SIZE, GRID_WIDTH, GRID_HEIGHT } from '../constants';
import type { TileType } from '../types';
import { toIndex, isInBounds } from './coords';

interface DirtyRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class TileGrid {
  readonly tileType: Uint8Array;
  readonly elevation: Uint8Array;
  readonly flags: Uint8Array;
  readonly metadata: Map<number, Record<string, unknown>>;

  private dirtyRegion: DirtyRegion | null = null;

  constructor() {
    this.tileType = new Uint8Array(GRID_SIZE);
    this.elevation = new Uint8Array(GRID_SIZE);
    this.flags = new Uint8Array(GRID_SIZE);
    this.metadata = new Map();
  }

  getType(x: number, y: number): TileType {
    return this.tileType[toIndex(x, y)] as TileType;
  }

  setType(x: number, y: number, type: TileType): void {
    if (!isInBounds(x, y)) return;
    this.tileType[toIndex(x, y)] = type;
    this.markDirty(x, y);
  }

  fill(type: TileType): void {
    this.tileType.fill(type);
    this.markDirty(0, 0);
    this.markDirty(GRID_WIDTH - 1, GRID_HEIGHT - 1);
  }

  fillRect(x0: number, y0: number, w: number, h: number, type: TileType): void {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (isInBounds(x, y)) {
          this.tileType[toIndex(x, y)] = type;
        }
      }
    }
    if (w > 0 && h > 0) {
      this.markDirty(x0, y0);
      this.markDirty(x0 + w - 1, y0 + h - 1);
    }
  }

  markDirty(x: number, y: number): void {
    if (this.dirtyRegion === null) {
      this.dirtyRegion = { x0: x, y0: y, x1: x, y1: y };
    } else {
      if (x < this.dirtyRegion.x0) this.dirtyRegion.x0 = x;
      if (y < this.dirtyRegion.y0) this.dirtyRegion.y0 = y;
      if (x > this.dirtyRegion.x1) this.dirtyRegion.x1 = x;
      if (y > this.dirtyRegion.y1) this.dirtyRegion.y1 = y;
    }
  }

  getDirtyRegion(): DirtyRegion | null {
    return this.dirtyRegion;
  }

  clearDirty(): void {
    this.dirtyRegion = null;
  }

  serialize(): ArrayBuffer {
    const combined = new Uint8Array(GRID_SIZE * 3);
    combined.set(this.tileType, 0);
    combined.set(this.elevation, GRID_SIZE);
    combined.set(this.flags, GRID_SIZE * 2);
    return combined.buffer;
  }

  static deserialize(buffer: ArrayBuffer): TileGrid {
    const grid = new TileGrid();
    const data = new Uint8Array(buffer);
    grid.tileType.set(data.subarray(0, GRID_SIZE));
    grid.elevation.set(data.subarray(GRID_SIZE, GRID_SIZE * 2));
    grid.flags.set(data.subarray(GRID_SIZE * 2, GRID_SIZE * 3));
    return grid;
  }
}
