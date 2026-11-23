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
  private revisionValue = 0;

  /** Changes whenever a building is added, removed or changes type: what the map layers redraw on. */
  get revision(): number {
    return this.revisionValue;
  }

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

  /**
   * The next free id, counting up from the last one handed out. Ids are not
   * reused until every one has been used once; from then on the count wraps
   * and skips the ids still on the map, so a long game never runs out while
   * fewer than `MAX_BUILDING_ID` buildings stand.
   */
  private allocateId(): BuildingId | null {
    if (!this.hasIdCapacity()) return null;
    for (;;) {
      const id = this.nextId > MAX_BUILDING_ID ? 1 : this.nextId;
      this.nextId = id + 1;
      if (!this.instances.has(id)) return id;
    }
  }

  register(building: Omit<Building, 'id'>, footprint: Footprint): BuildingId | null {
    if (!this.isFree(building.origin, footprint)) return null;
    const id = this.allocateId();
    if (id === null) return null;

    const stored: Building = { ...building, id };
    this.instances.set(id, stored);
    for (const { idx } of this.footprintTiles(building.origin, footprint)) {
      this.occupancy[idx] = id;
    }
    this.revisionValue += 1;
    return id;
  }

  unregister(id: BuildingId, footprint: Footprint): boolean {
    const building = this.instances.get(id);
    if (!building) return false;
    for (const { idx, inBounds } of this.footprintTiles(building.origin, footprint)) {
      if (inBounds) this.occupancy[idx] = 0;
    }
    this.instances.delete(id);
    this.revisionValue += 1;
    return true;
  }

  /** Swaps a building's type in place (same footprint, e.g. a belt upgrade): id and tiles stay. */
  retype(id: BuildingId, typeId: Building['typeId']): boolean {
    const building = this.instances.get(id);
    if (!building) return false;
    this.instances.set(id, { ...building, typeId });
    this.revisionValue += 1;
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

  /** False only when `MAX_BUILDING_ID` buildings stand at once (occupancy stores ids as Uint16). */
  hasIdCapacity(): boolean {
    return this.instances.size < MAX_BUILDING_ID;
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
