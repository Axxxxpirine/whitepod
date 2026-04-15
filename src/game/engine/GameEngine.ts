import { TileGrid } from '../data/TileGrid';
import { BuildingRegistry } from '../data/BuildingRegistry';
import { getBuildingType, validateCatalog } from '../data/buildingCatalog';
import { Viewport } from './Viewport';
import type { VisibleTileRange } from './Viewport';
import {
  Direction,
  type Building,
  type BuildingId,
  type BuildingTypeId,
  type PlacementResult,
  type TileCoord,
  type TileType,
} from '../types';
import { isInBounds } from '../data/coords';
import { screenToGrid } from './CoordinateTransform';

export class GameEngine {
  readonly grid: TileGrid;
  readonly viewport: Viewport;
  readonly buildings: BuildingRegistry;

  constructor(screenWidth: number, screenHeight: number) {
    validateCatalog();
    this.grid = new TileGrid();
    this.viewport = new Viewport(screenWidth, screenHeight);
    this.buildings = new BuildingRegistry();
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
    return this.buildings.unregister(id, type.footprint);
  }

  getBuildingAt(x: number, y: number): Building | null {
    return this.buildings.getAt(x, y);
  }

  getBuildings(): ReadonlyMap<BuildingId, Building> {
    return this.buildings.getAll();
  }

  getVisibleTiles(): VisibleTileRange {
    return this.viewport.getVisibleTileRange();
  }

  screenToTile(screenX: number, screenY: number): TileCoord {
    return screenToGrid(this.viewport, screenX, screenY);
  }
}
