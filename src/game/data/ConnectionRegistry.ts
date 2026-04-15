import {
  Direction,
  type BuildingId,
  type Connection,
  type ConnectionId,
  type Footprint,
  type Port,
  type TileCoord,
} from '../types';

const MAX_CONNECTION_ID = 65535;

// Rotation is a no-op in v1. Helpers exist as a seam so that when rotation
// becomes effective, every call site already goes through the transform.
export function worldSideOf(port: Port, _rotation: Direction): Direction {
  return port.side;
}

export function worldTileOf(
  port: Port,
  origin: TileCoord,
  _rotation: Direction,
  _footprint: Footprint,
): TileCoord {
  return { x: origin.x + port.offset.x, y: origin.y + port.offset.y };
}

export function oppositeSide(side: Direction): Direction {
  return ((side + 2) % 4) as Direction;
}

export function unitVector(side: Direction): TileCoord {
  switch (side) {
    case Direction.North:
      return { x: 0, y: -1 };
    case Direction.East:
      return { x: 1, y: 0 };
    case Direction.South:
      return { x: 0, y: 1 };
    case Direction.West:
      return { x: -1, y: 0 };
  }
}

function endpointKey(buildingId: BuildingId, portId: string): string {
  return `${buildingId}:${portId}`;
}

export class ConnectionRegistry {
  private readonly instances: Map<ConnectionId, Connection>;
  private readonly byBuilding: Map<BuildingId, Set<ConnectionId>>;
  private readonly byEndpoint: Map<string, ConnectionId>;
  private nextId: ConnectionId;

  constructor() {
    this.instances = new Map();
    this.byBuilding = new Map();
    this.byEndpoint = new Map();
    this.nextId = 1;
  }

  hasIdCapacity(): boolean {
    return this.nextId <= MAX_CONNECTION_ID;
  }

  isPortConnected(buildingId: BuildingId, portId: string): boolean {
    return this.byEndpoint.has(endpointKey(buildingId, portId));
  }

  register(
    from: { building: BuildingId; port: string },
    to: { building: BuildingId; port: string },
  ): ConnectionId | null {
    if (this.nextId > MAX_CONNECTION_ID) return null;

    const id = this.nextId++;
    const connection: Connection = {
      id,
      from: { building: from.building, port: from.port },
      to: { building: to.building, port: to.port },
    };
    this.instances.set(id, connection);
    this.byEndpoint.set(endpointKey(from.building, from.port), id);
    this.byEndpoint.set(endpointKey(to.building, to.port), id);
    this.addToBuilding(from.building, id);
    this.addToBuilding(to.building, id);
    return id;
  }

  unregister(id: ConnectionId): boolean {
    const conn = this.instances.get(id);
    if (!conn) return false;
    this.byEndpoint.delete(endpointKey(conn.from.building, conn.from.port));
    this.byEndpoint.delete(endpointKey(conn.to.building, conn.to.port));
    this.removeFromBuilding(conn.from.building, id);
    this.removeFromBuilding(conn.to.building, id);
    this.instances.delete(id);
    return true;
  }

  unregisterAllFor(buildingId: BuildingId): number {
    const ids = this.byBuilding.get(buildingId);
    if (!ids || ids.size === 0) return 0;
    // Copy first so we can mutate during iteration.
    const toRemove = Array.from(ids);
    for (const id of toRemove) this.unregister(id);
    return toRemove.length;
  }

  get(id: ConnectionId): Connection | null {
    return this.instances.get(id) ?? null;
  }

  getAll(): ReadonlyMap<ConnectionId, Connection> {
    return this.instances;
  }

  getConnectionsOf(buildingId: BuildingId): readonly Connection[] {
    const ids = this.byBuilding.get(buildingId);
    if (!ids) return [];
    const out: Connection[] = [];
    for (const id of ids) {
      const c = this.instances.get(id);
      if (c) out.push(c);
    }
    return out;
  }

  private addToBuilding(buildingId: BuildingId, id: ConnectionId): void {
    let set = this.byBuilding.get(buildingId);
    if (!set) {
      set = new Set();
      this.byBuilding.set(buildingId, set);
    }
    set.add(id);
  }

  private removeFromBuilding(buildingId: BuildingId, id: ConnectionId): void {
    const set = this.byBuilding.get(buildingId);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) this.byBuilding.delete(buildingId);
  }
}
