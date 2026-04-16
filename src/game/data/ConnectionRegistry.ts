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
const SERIALIZE_VERSION = 1;

export interface SerializedConnectionRegistry {
  readonly version: number;
  readonly nextId: number;
  readonly connections: readonly Connection[];
}

// Rotation rotates each port's local side CW by `rotation` (N=0, E=1, S=2, W=3).
// worldTileOf rotates the port's local offset around the footprint bounding box
// center (screen-y-down convention: 90° CW = top-right goes to bottom-right).
// Non-square footprints are supported; the bounding box dimensions swap for
// Direction.East / West.
export function worldSideOf(port: Port, rotation: Direction): Direction {
  return ((port.side + rotation) % 4) as Direction;
}

export function worldTileOf(
  port: Port,
  origin: TileCoord,
  rotation: Direction,
  footprint: Footprint,
): TileCoord {
  const { x, y } = port.offset;
  const { w, h } = footprint;
  let localX: number;
  let localY: number;
  switch (rotation) {
    case Direction.North:
      localX = x;
      localY = y;
      break;
    case Direction.East:
      // 90° CW (screen y-down): (x, y) → (h-1-y, x), bounding box becomes (h, w)
      localX = h - 1 - y;
      localY = x;
      break;
    case Direction.South:
      localX = w - 1 - x;
      localY = h - 1 - y;
      break;
    case Direction.West:
      // 270° CW = 90° CCW: (x, y) → (y, w-1-x), bounding box becomes (h, w)
      localX = y;
      localY = w - 1 - x;
      break;
  }
  return { x: origin.x + localX, y: origin.y + localY };
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

export class ConnectionRegistry {
  private readonly instances: Map<ConnectionId, Connection>;
  private readonly byBuilding: Map<BuildingId, ConnectionId[]>;
  private readonly byEndpoint: Map<BuildingId, Map<string, ConnectionId>>;
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
    return this.byEndpoint.get(buildingId)?.has(portId) ?? false;
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
    this.setEndpoint(from.building, from.port, id);
    this.setEndpoint(to.building, to.port, id);
    this.addToBuilding(from.building, id);
    this.addToBuilding(to.building, id);
    return id;
  }

  unregister(id: ConnectionId): boolean {
    const conn = this.instances.get(id);
    if (!conn) return false;
    this.removeEndpoint(conn.from.building, conn.from.port);
    this.removeEndpoint(conn.to.building, conn.to.port);
    this.removeFromBuilding(conn.from.building, id);
    this.removeFromBuilding(conn.to.building, id);
    this.instances.delete(id);
    return true;
  }

  unregisterAllFor(buildingId: BuildingId): number {
    const ids = this.byBuilding.get(buildingId);
    if (!ids || ids.length === 0) return 0;
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

  serialize(): SerializedConnectionRegistry {
    return {
      version: SERIALIZE_VERSION,
      nextId: this.nextId,
      connections: Array.from(this.instances.values()),
    };
  }

  static deserialize(data: SerializedConnectionRegistry): ConnectionRegistry {
    if (data.version !== SERIALIZE_VERSION) {
      throw new Error(`Unsupported ConnectionRegistry version: ${data.version}`);
    }

    const registry = new ConnectionRegistry();
    registry.nextId = data.nextId;
    for (const connection of data.connections) {
      registry.instances.set(connection.id, connection);
      registry.setEndpoint(connection.from.building, connection.from.port, connection.id);
      registry.setEndpoint(connection.to.building, connection.to.port, connection.id);
      registry.addToBuilding(connection.from.building, connection.id);
      registry.addToBuilding(connection.to.building, connection.id);
    }
    return registry;
  }

  private setEndpoint(buildingId: BuildingId, portId: string, id: ConnectionId): void {
    let ports = this.byEndpoint.get(buildingId);
    if (!ports) {
      ports = new Map();
      this.byEndpoint.set(buildingId, ports);
    }
    ports.set(portId, id);
  }

  private removeEndpoint(buildingId: BuildingId, portId: string): void {
    const ports = this.byEndpoint.get(buildingId);
    if (!ports) return;
    ports.delete(portId);
    if (ports.size === 0) {
      this.byEndpoint.delete(buildingId);
    }
  }

  private addToBuilding(buildingId: BuildingId, id: ConnectionId): void {
    let set = this.byBuilding.get(buildingId);
    if (!set) {
      set = [];
      this.byBuilding.set(buildingId, set);
    }
    set.push(id);
  }

  private removeFromBuilding(buildingId: BuildingId, id: ConnectionId): void {
    const set = this.byBuilding.get(buildingId);
    if (!set) return;
    const index = set.indexOf(id);
    if (index >= 0) {
      set.splice(index, 1);
    }
    if (set.length === 0) this.byBuilding.delete(buildingId);
  }
}
