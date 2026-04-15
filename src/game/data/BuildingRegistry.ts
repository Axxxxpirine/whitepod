import { GRID_SIZE } from '../constants';
import type { Building, BuildingId, Footprint, TileCoord } from '../types';
import { toIndex, isInBounds } from './coords';

const MAX_BUILDING_ID = 65535;
const SERIALIZE_VERSION = 1;

interface SerializedRegistry {
  readonly version: number;
  readonly nextId: number;
  readonly buildings: readonly Building[];
}

export class BuildingRegistry {
  private readonly occupancy: Uint16Array;
  private readonly instances: Map<BuildingId, Building>;
  private nextId: BuildingId;

  constructor() {
    this.occupancy = new Uint16Array(GRID_SIZE);
    this.instances = new Map();
    this.nextId = 1;
  }

  *footprintTiles(
    origin: TileCoord,
    footprint: Footprint,
  ): Generator<{ x: number; y: number; idx: number; inBounds: boolean }> {
    for (let dy = 0; dy < footprint.h; dy++) {
      for (let dx = 0; dx < footprint.w; dx++) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        const inBounds = isInBounds(x, y);
        yield { x, y, idx: inBounds ? toIndex(x, y) : -1, inBounds };
      }
    }
  }

  isFree(origin: TileCoord, footprint: Footprint): boolean {
    for (const { inBounds, idx } of this.footprintTiles(origin, footprint)) {
      if (!inBounds) return false;
      if (this.occupancy[idx] !== 0) return false;
    }
    return true;
  }

  register(building: Omit<Building, 'id'>, footprint: Footprint): BuildingId | null {
    if (this.nextId > MAX_BUILDING_ID) return null;
    if (!this.isFree(building.origin, footprint)) return null;

    const id = this.nextId++;
    const stored: Building = { ...building, id };
    this.instances.set(id, stored);
    for (const { idx } of this.footprintTiles(building.origin, footprint)) {
      this.occupancy[idx] = id;
    }
    return id;
  }

  unregister(id: BuildingId, footprint: Footprint): boolean {
    const building = this.instances.get(id);
    if (!building) return false;
    for (const { idx, inBounds } of this.footprintTiles(building.origin, footprint)) {
      if (inBounds) this.occupancy[idx] = 0;
    }
    this.instances.delete(id);
    return true;
  }

  getAt(x: number, y: number): Building | null {
    if (!isInBounds(x, y)) return null;
    const id = this.occupancy[toIndex(x, y)];
    if (id === 0) return null;
    return this.instances.get(id) ?? null;
  }

  occupantIdAt(idx: number): BuildingId {
    return this.occupancy[idx];
  }

  hasIdCapacity(): boolean {
    return this.nextId <= MAX_BUILDING_ID;
  }

  get(id: BuildingId): Building | null {
    return this.instances.get(id) ?? null;
  }

  getAll(): ReadonlyMap<BuildingId, Building> {
    return this.instances;
  }

  serialize(): SerializedRegistry {
    return {
      version: SERIALIZE_VERSION,
      nextId: this.nextId,
      buildings: Array.from(this.instances.values()),
    };
  }

  static deserialize(
    data: SerializedRegistry,
    footprintOf: (typeId: string) => Footprint | undefined,
  ): BuildingRegistry {
    if (data.version !== SERIALIZE_VERSION) {
      throw new Error(`Unsupported BuildingRegistry version: ${data.version}`);
    }
    const reg = new BuildingRegistry();
    reg.nextId = data.nextId;
    for (const b of data.buildings) {
      const fp = footprintOf(b.typeId);
      if (!fp) {
        throw new Error(`Unknown building typeId during deserialize: ${b.typeId}`);
      }
      reg.instances.set(b.id, b);
      for (const { idx, inBounds } of reg.footprintTiles(b.origin, fp)) {
        if (inBounds) reg.occupancy[idx] = b.id;
      }
    }
    return reg;
  }
}
