import { GRID_SIZE, GRID_WIDTH, GRID_HEIGHT } from '../constants';
import type { TileType, ResourceType } from '../types';
import { toIndex, isInBounds } from './coords';

interface DirtyRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

type TileGridChangeListener = () => void;

export class TileGrid {
  readonly tileType: Uint8Array;
  readonly elevation: Uint8Array;
  readonly flags: Uint8Array;
  readonly resourceType: Uint8Array;
  readonly metadata: Map<number, Record<string, unknown>>;

  private dirtyRegion: DirtyRegion | null = null;
  private onChange: TileGridChangeListener | null;

  constructor(onChange: TileGridChangeListener | null = null) {
    this.tileType = new Uint8Array(GRID_SIZE);
    this.elevation = new Uint8Array(GRID_SIZE);
    this.flags = new Uint8Array(GRID_SIZE);
    this.resourceType = new Uint8Array(GRID_SIZE);
    this.metadata = new Map();
    this.onChange = onChange;
  }

  setOnChange(onChange: TileGridChangeListener | null): void {
    this.onChange = onChange;
  }

  getType(x: number, y: number): TileType {
    return this.tileType[toIndex(x, y)] as TileType;
  }

  setType(x: number, y: number, type: TileType): void {
    if (!isInBounds(x, y)) return;
    this.tileType[toIndex(x, y)] = type;
    this.markDirty(x, y);
    this.onChange?.();
  }

  getResource(x: number, y: number): ResourceType {
    return this.resourceType[toIndex(x, y)] as ResourceType;
  }

  setResource(x: number, y: number, resource: ResourceType): void {
    if (!isInBounds(x, y)) return;
    this.resourceType[toIndex(x, y)] = resource;
    this.markDirty(x, y);
    this.onChange?.();
  }

  fill(type: TileType): void {
    this.tileType.fill(type);
    this.markDirty(0, 0);
    this.markDirty(GRID_WIDTH - 1, GRID_HEIGHT - 1);
    this.onChange?.();
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
      this.onChange?.();
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
    const combined = new Uint8Array(GRID_SIZE * 4);
    combined.set(this.tileType, 0);
    combined.set(this.elevation, GRID_SIZE);
    combined.set(this.flags, GRID_SIZE * 2);
    combined.set(this.resourceType, GRID_SIZE * 3);
    return combined.buffer;
  }

  static deserialize(buffer: ArrayBuffer, onChange: TileGridChangeListener | null = null): TileGrid {
    const grid = new TileGrid(onChange);
    const data = new Uint8Array(buffer);
    grid.tileType.set(data.subarray(0, GRID_SIZE));
    grid.elevation.set(data.subarray(GRID_SIZE, GRID_SIZE * 2));
    grid.flags.set(data.subarray(GRID_SIZE * 2, GRID_SIZE * 3));
    // Backward compatibility: old saves have 3 arrays, new ones have 4
    if (buffer.byteLength >= GRID_SIZE * 4) {
      grid.resourceType.set(data.subarray(GRID_SIZE * 3, GRID_SIZE * 4));
    }
    return grid;
  }
}
