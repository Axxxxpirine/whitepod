import { GRID_SIZE, GRID_WIDTH, GRID_HEIGHT, RESOURCE_DEPOSIT_AMOUNT, REVEALED_FLAG } from '../constants';
import { ResourceType, type TileType, type ResourceType as ResourceTypeT } from '../types';
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
  readonly resourceAmount: Uint16Array;
  readonly metadata: Map<number, Record<string, unknown>>;

  private dirtyRegion: DirtyRegion | null = null;
  private onChange: TileGridChangeListener | null;
  fogVersion = 0;

  constructor(onChange: TileGridChangeListener | null = null) {
    this.tileType = new Uint8Array(GRID_SIZE);
    this.elevation = new Uint8Array(GRID_SIZE);
    this.flags = new Uint8Array(GRID_SIZE);
    this.resourceType = new Uint8Array(GRID_SIZE);
    this.resourceAmount = new Uint16Array(GRID_SIZE);
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

  getResource(x: number, y: number): ResourceTypeT {
    return this.resourceType[toIndex(x, y)] as ResourceTypeT;
  }

  setResource(x: number, y: number, resource: ResourceTypeT, amount: number = RESOURCE_DEPOSIT_AMOUNT): void {
    if (!isInBounds(x, y)) return;
    const idx = toIndex(x, y);
    this.resourceType[idx] = resource;
    this.resourceAmount[idx] = resource === ResourceType.None ? 0 : amount;
    this.markDirty(x, y);
    this.onChange?.();
  }

  getResourceAmount(x: number, y: number): number {
    return this.resourceAmount[toIndex(x, y)];
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

  isRevealed(x: number, y: number): boolean {
    return (this.flags[toIndex(x, y)] & REVEALED_FLAG) !== 0;
  }

  revealCircle(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(GRID_WIDTH - 1, Math.ceil(cx + radius));
    const y1 = Math.min(GRID_HEIGHT - 1, Math.ceil(cy + radius));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          this.flags[toIndex(x, y)] |= REVEALED_FLAG;
        }
      }
    }

    this.markDirty(x0, y0);
    this.markDirty(x1, y1);
    this.fogVersion++;
    this.onChange?.();
  }

  revealAll(): void {
    this.flags.fill(REVEALED_FLAG);
    this.markDirty(0, 0);
    this.markDirty(GRID_WIDTH - 1, GRID_HEIGHT - 1);
    this.fogVersion++;
    this.onChange?.();
  }

  hasAnyRevealed(): boolean {
    for (let i = 0; i < GRID_SIZE; i++) {
      if (this.flags[i] & REVEALED_FLAG) return true;
    }
    return false;
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
    const amountBytes = new Uint8Array(this.resourceAmount.buffer);
    const combined = new Uint8Array(GRID_SIZE * 4 + GRID_SIZE * 2);
    combined.set(this.tileType, 0);
    combined.set(this.elevation, GRID_SIZE);
    combined.set(this.flags, GRID_SIZE * 2);
    combined.set(this.resourceType, GRID_SIZE * 3);
    combined.set(amountBytes, GRID_SIZE * 4);
    return combined.buffer;
  }

  static deserialize(buffer: ArrayBuffer, onChange: TileGridChangeListener | null = null): TileGrid {
    const grid = new TileGrid(onChange);
    const data = new Uint8Array(buffer);
    grid.tileType.set(data.subarray(0, GRID_SIZE));
    grid.elevation.set(data.subarray(GRID_SIZE, GRID_SIZE * 2));
    grid.flags.set(data.subarray(GRID_SIZE * 2, GRID_SIZE * 3));
    // Backward compatibility: old saves have 3 arrays, new ones have 4, newest have 4 + Uint16
    if (buffer.byteLength >= GRID_SIZE * 4) {
      grid.resourceType.set(data.subarray(GRID_SIZE * 3, GRID_SIZE * 4));
    }
    if (buffer.byteLength >= GRID_SIZE * 6) {
      const amountBytes = data.subarray(GRID_SIZE * 4, GRID_SIZE * 6);
      new Uint8Array(grid.resourceAmount.buffer).set(amountBytes);
    } else {
      // Migrate: infer amounts from resource types
      for (let i = 0; i < GRID_SIZE; i++) {
        grid.resourceAmount[i] = grid.resourceType[i] !== ResourceType.None ? RESOURCE_DEPOSIT_AMOUNT : 0;
      }
    }
    return grid;
  }
}
