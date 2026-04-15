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

export const ResourceType = {
  None: 0,
  Coal: 1,
  IronOre: 2,
  CopperOre: 3,
} as const;
export type ResourceType = (typeof ResourceType)[keyof typeof ResourceType];

export interface TileCoord {
  readonly x: number;
  readonly y: number;
}

export type BuildingId = number;
export type BuildingTypeId = string;

export type SelectedTool =
  | { readonly kind: 'select' }
  | { readonly kind: 'building'; readonly buildingType: BuildingTypeId }
  | { readonly kind: 'energy_link' };

export interface Footprint {
  readonly w: number;
  readonly h: number;
}

export type PortId = string;
export type ConnectionId = number;

export const PortKind = {
  Input: 0,
  Output: 1,
} as const;
export type PortKind = (typeof PortKind)[keyof typeof PortKind];

export interface Port {
  readonly id: PortId;
  readonly kind: PortKind;
  readonly offset: TileCoord;
  readonly side: Direction;
}

export interface BuildingType {
  readonly id: BuildingTypeId;
  readonly name: string;
  readonly footprint: Footprint;
  readonly allowedTiles: readonly TileType[];
  readonly requiresResourceDeposit?: boolean;
  readonly forbidsResourceDeposit?: boolean;
  readonly ports: readonly Port[];
  readonly energy?: {
    readonly production?: number;
    readonly consumption?: number;
  };
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
  | 'resource_required'
  | 'resource_forbidden'
  | 'unknown_type'
  | 'id_overflow';

export type PlacementResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: PlacementFailure };

export interface Connection {
  readonly id: ConnectionId;
  readonly from: { readonly building: BuildingId; readonly port: PortId };
  readonly to: { readonly building: BuildingId; readonly port: PortId };
}

export type ConnectionFailure =
  | 'unknown_building'
  | 'unknown_port'
  | 'port_kind_mismatch'
  | 'port_already_connected'
  | 'ports_not_adjacent'
  | 'self_connection'
  | 'id_overflow';

export type ConnectionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ConnectionFailure };

export interface EnergyNetworkBalance {
  readonly buildingIds: readonly BuildingId[];
  readonly production: number;
  readonly consumption: number;
  readonly remaining: number;
}
