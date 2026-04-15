// Using const objects instead of enums for compatibility with erasableSyntaxOnly

export const TileType = {
  Empty: 0,
  Ground: 1,
  Rock: 2,
  Water: 3,
} as const;
export type TileType = (typeof TileType)[keyof typeof TileType];

export const Direction = {
  North: 0,
  East: 1,
  South: 2,
  West: 3,
} as const;
export type Direction = (typeof Direction)[keyof typeof Direction];

export interface TileCoord {
  readonly x: number;
  readonly y: number;
}

export type BuildingId = number;
export type BuildingTypeId = string;

export interface Footprint {
  readonly w: number;
  readonly h: number;
}

export interface BuildingType {
  readonly id: BuildingTypeId;
  readonly footprint: Footprint;
  readonly allowedTiles: readonly TileType[];
}

export interface Building {
  readonly id: BuildingId;
  readonly typeId: BuildingTypeId;
  readonly origin: TileCoord;
  readonly rotation: Direction;
}

export type PlacementFailure =
  | 'out_of_bounds'
  | 'tile_occupied'
  | 'tile_type_invalid'
  | 'unknown_type'
  | 'id_overflow';

export type PlacementResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: PlacementFailure };
