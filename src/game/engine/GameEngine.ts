import { TileGrid } from '../data/TileGrid';
import { BuildingRegistry } from '../data/BuildingRegistry';
import {
  ConnectionRegistry,
  oppositeSide,
  unitVector,
  worldSideOf,
  worldTileOf,
} from '../data/ConnectionRegistry';
import { getBuildingType, validateCatalog } from '../data/buildingCatalog';
import { Viewport } from './Viewport';
import type { VisibleTileRange } from './Viewport';
import {
  Direction,
  PortKind,
  ResourceType,
  TileType as TileTypeConst,
  type Building,
  type BuildingId,
  type BuildingTypeId,
  type Connection,
  type ConnectionId,
  type ConnectionResult,
  type PlacementResult,
  type Port,
  type PortId,
  type ResourceType as ResourceTypeT,
  type TileCoord,
  type TileType,
} from '../types';
import { isInBounds } from '../data/coords';
import { screenToGrid } from './CoordinateTransform';
import { generateResources } from '../data/ResourceGenerator';

interface PortEndpoint {
  readonly building: BuildingId;
  readonly port: PortId;
}

interface ResolvedPort {
  readonly building: Building;
  readonly port: Port;
}

export class GameEngine {
  readonly grid: TileGrid;
  readonly viewport: Viewport;
  readonly buildings: BuildingRegistry;
  readonly connections: ConnectionRegistry;

  constructor(screenWidth: number, screenHeight: number) {
    validateCatalog();
    this.grid = new TileGrid();
    this.viewport = new Viewport(screenWidth, screenHeight);
    this.buildings = new BuildingRegistry();
    this.connections = new ConnectionRegistry();
  }

  update(_dt: number): void {
    // Simulation tick — will grow with future features
  }

  placeTile(x: number, y: number, type: TileType): boolean {
    if (!isInBounds(x, y)) return false;
    this.grid.setType(x, y, type);
    return true;
  }

  getTileAt(x: number, y: number): TileType {
    return this.grid.getType(x, y);
  }

  canPlaceBuilding(
    typeId: BuildingTypeId,
    origin: TileCoord,
    // rotation reserved for future directional footprints; currently a no-op
    _rotation: Direction = Direction.North,
  ): PlacementResult {
    const type = getBuildingType(typeId);
    if (!type) return { ok: false, reason: 'unknown_type' };
    if (!this.buildings.hasIdCapacity()) return { ok: false, reason: 'id_overflow' };

    for (const { x, y, inBounds, idx } of this.buildings.footprintTiles(origin, type.footprint)) {
      if (!inBounds) return { ok: false, reason: 'out_of_bounds' };
      if (this.buildings.occupantIdAt(idx) !== 0) {
        return { ok: false, reason: 'tile_occupied' };
      }
      if (!type.allowedTiles.includes(this.grid.getType(x, y))) {
        return { ok: false, reason: 'tile_type_invalid' };
      }
      if (type.requiresResourceDeposit && this.grid.getResource(x, y) === ResourceType.None) {
        return { ok: false, reason: 'resource_required' };
      }
      if (type.forbidsResourceDeposit && this.grid.getResource(x, y) !== ResourceType.None) {
        return { ok: false, reason: 'resource_forbidden' };
      }
    }
    return { ok: true };
  }

  placeBuilding(
    typeId: BuildingTypeId,
    origin: TileCoord,
    rotation: Direction = Direction.North,
  ): BuildingId | null {
    const result = this.canPlaceBuilding(typeId, origin, rotation);
    if (!result.ok) return null;

    const type = getBuildingType(typeId)!;
    return this.buildings.register({ typeId, origin, rotation }, type.footprint);
  }

  removeBuilding(id: BuildingId): boolean {
    const building = this.buildings.get(id);
    if (!building) return false;
    const type = getBuildingType(building.typeId);
    if (!type) return false;
    this.connections.unregisterAllFor(id);
    return this.buildings.unregister(id, type.footprint);
  }

  canConnect(from: PortEndpoint, to: PortEndpoint): ConnectionResult {
    if (from.building === to.building) return { ok: false, reason: 'self_connection' };
    if (!this.connections.hasIdCapacity()) return { ok: false, reason: 'id_overflow' };

    const fromResolved = this.resolvePort(from);
    if (!fromResolved) return { ok: false, reason: this.endpointFailure(from) };
    const toResolved = this.resolvePort(to);
    if (!toResolved) return { ok: false, reason: this.endpointFailure(to) };

    if (fromResolved.port.kind !== PortKind.Output || toResolved.port.kind !== PortKind.Input) {
      return { ok: false, reason: 'port_kind_mismatch' };
    }
    if (this.connections.isPortConnected(from.building, from.port)) {
      return { ok: false, reason: 'port_already_connected' };
    }
    if (this.connections.isPortConnected(to.building, to.port)) {
      return { ok: false, reason: 'port_already_connected' };
    }
    if (!this.portsAdjacent(fromResolved, toResolved)) {
      return { ok: false, reason: 'ports_not_adjacent' };
    }
    return { ok: true };
  }

  connect(from: PortEndpoint, to: PortEndpoint): ConnectionId | null {
    const result = this.canConnect(from, to);
    if (!result.ok) return null;
    return this.connections.register(from, to);
  }

  disconnect(id: ConnectionId): boolean {
    return this.connections.unregister(id);
  }

  getConnectionsOf(buildingId: BuildingId): readonly Connection[] {
    return this.connections.getConnectionsOf(buildingId);
  }

  getConnections(): ReadonlyMap<ConnectionId, Connection> {
    return this.connections.getAll();
  }

  private resolvePort(endpoint: PortEndpoint): ResolvedPort | null {
    const building = this.buildings.get(endpoint.building);
    if (!building) return null;
    const type = getBuildingType(building.typeId);
    if (!type) return null;
    const port = type.ports.find((p) => p.id === endpoint.port);
    if (!port) return null;
    return { building, port };
  }

  private endpointFailure(endpoint: PortEndpoint): 'unknown_building' | 'unknown_port' {
    const building = this.buildings.get(endpoint.building);
    if (!building) return 'unknown_building';
    const type = getBuildingType(building.typeId);
    if (!type) return 'unknown_building';
    if (!type.ports.find((p) => p.id === endpoint.port)) return 'unknown_port';
    // Should not reach here — resolvePort only returns null via these paths.
    return 'unknown_building';
  }

  private portsAdjacent(a: ResolvedPort, b: ResolvedPort): boolean {
    const typeA = getBuildingType(a.building.typeId)!;
    const typeB = getBuildingType(b.building.typeId)!;
    const tileA = worldTileOf(a.port, a.building.origin, a.building.rotation, typeA.footprint);
    const tileB = worldTileOf(b.port, b.building.origin, b.building.rotation, typeB.footprint);
    const sideA = worldSideOf(a.port, a.building.rotation);
    const sideB = worldSideOf(b.port, b.building.rotation);
    const step = unitVector(sideA);
    const expectedTileB: TileCoord = { x: tileA.x + step.x, y: tileA.y + step.y };
    if (expectedTileB.x !== tileB.x || expectedTileB.y !== tileB.y) return false;
    return sideA === oppositeSide(sideB);
  }

  getBuildingAt(x: number, y: number): Building | null {
    return this.buildings.getAt(x, y);
  }

  getBuildings(): ReadonlyMap<BuildingId, Building> {
    return this.buildings.getAll();
  }

  placeResource(x: number, y: number, resource: ResourceTypeT): boolean {
    if (!isInBounds(x, y)) return false;
    const tile = this.grid.getType(x, y);
    if (tile === TileTypeConst.Water || tile === TileTypeConst.Empty) return false;
    this.grid.setResource(x, y, resource);
    return true;
  }

  removeResource(x: number, y: number): boolean {
    if (!isInBounds(x, y)) return false;
    this.grid.setResource(x, y, ResourceType.None);
    return true;
  }

  getResourceAt(x: number, y: number): ResourceTypeT {
    return this.grid.getResource(x, y);
  }

  generateMap(seed: number): void {
    generateResources(this.grid, seed);
  }

  getVisibleTiles(): VisibleTileRange {
    return this.viewport.getVisibleTileRange();
  }

  screenToTile(screenX: number, screenY: number): TileCoord {
    return screenToGrid(this.viewport, screenX, screenY);
  }
}
