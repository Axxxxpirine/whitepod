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
  // --- Tier 0 : Raw (Extractors) ---
  Regolith: 1,
  Hydrogen: 2,
  Oxygen: 3,
  // --- Tier 1 : Converter (1→1) ---
  IronOxide: 10,
  AluminumOxide: 11,
  SiliconDioxide: 12,
  NitrogenGas: 13,
  // --- Tier 1 : Synthesizer (2→1, from tier 0) ---
  Water: 14,
  Methane: 15,
  CarbonDioxide: 16,
  Ammonia: 17,
  // --- Tier 2 : Synthesizer (from tier 1) ---
  CeramicPlates: 20,
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
  | { readonly kind: 'belt' }
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

/** An amount of one resource, e.g. one line of a construction cost. */
export interface ResourceCost {
  readonly resourceType: ResourceType;
  readonly amount: number;
}

export interface BuildingType {
  readonly id: BuildingTypeId;
  readonly name: string;
  readonly footprint: Footprint;
  readonly allowedTiles: readonly TileType[];
  readonly requiresResourceDeposit?: boolean;
  readonly forbidsResourceDeposit?: boolean;
  /**
   * Storage-like building: accepts resources on its input ports and keeps
   * them in a per-building inventory. Read through `isStorageTypeId`.
   */
  readonly storage?: boolean;
  /**
   * Placed by the engine only (e.g. the campaign hub): `canPlaceBuilding`
   * refuses it with `system_placed`, so players and tools cannot build it.
   */
  readonly systemPlaced?: boolean;
  /** Cannot be removed once placed. */
  readonly permanent?: boolean;
  /**
   * Construction cost, paid in campaign mode from the global stock (hub +
   * storages) and fully refunded on removal. Belts: cost per segment.
   */
  readonly cost?: readonly ResourceCost[];
  /** Belts only: items per minute a run of this belt carries (a mixed run takes its slowest segment). */
  readonly beltCapacityPerMinute?: number;
  readonly ports: readonly Port[];
  readonly energy?: {
    readonly production?: number;
    readonly consumption?: number;
    readonly battery?: {
      readonly capacity: number;
      readonly chargeRate: number;
      readonly dischargeRate: number;
    };
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
  | 'id_overflow'
  | 'tile_fogged'
  | 'system_placed'
  | 'locked'
  | 'insufficient_resources';

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

// ─── Belts ────────────────────────────────────────────────────────────────
// A belt segment is a 1x1 Building of type 'belt_straight' or 'belt_corner'.
// A conveyor is the connected component of belt-typed buildings in the
// ConnectionRegistry graph — it has no dedicated entity or registry.

export interface BeltSegment {
  readonly coord: TileCoord;
  readonly typeId: BuildingTypeId;
  readonly rotation: Direction;
}

// An endpoint in a PendingConnection can reference either an existing building
// (when connecting to the extractor/storage at the ends of the conveyor) or a
// not-yet-committed segment by its index within the BeltPlan.segments array.
export type PendingEndpoint =
  | { readonly kind: 'building'; readonly building: BuildingId; readonly port: PortId }
  | { readonly kind: 'segment'; readonly segmentIndex: number; readonly port: PortId };

export interface PendingConnection {
  readonly from: PendingEndpoint;
  readonly to: PendingEndpoint;
}

export interface BeltPlan {
  readonly segments: readonly BeltSegment[];
  readonly connections: readonly PendingConnection[];
}

export type BeltFailure =
  | 'no_path'
  | 'source_port_taken'
  | 'target_port_taken'
  | 'port_kind_mismatch'
  | 'unknown_building'
  | 'unknown_port'
  | 'self_connection'
  | 'id_overflow'
  | 'tiles_blocked'
  | 'insufficient_resources';

export type BeltResult =
  | { readonly ok: true; readonly plan: BeltPlan }
  | { readonly ok: false; readonly reason: BeltFailure };

/**
 * A planned belt route with its price, before affordability is checked: what
 * previews show while the player drags. `missing` is empty when affordable.
 */
export type BeltRouteQuote =
  | {
      readonly ok: true;
      readonly plan: BeltPlan;
      readonly cost: readonly ResourceCost[];
      readonly missing: readonly ResourceCost[];
    }
  | { readonly ok: false; readonly reason: BeltFailure };

export type PlaceBeltResult =
  | {
      readonly ok: true;
      readonly segmentIds: readonly BuildingId[];
      readonly plan: BeltPlan;
    }
  | {
      readonly ok: false;
      readonly reason: BeltFailure;
    };

export interface EnergyNetworkBalance {
  readonly buildingIds: readonly BuildingId[];
  readonly production: number;
  readonly consumption: number;
  readonly remaining: number;
}

export type PowerState = 'neutral' | 'powered' | 'unpowered';

export interface EnergyDisplayStats {
  readonly production: number;
  readonly servedConsumption: number;
  readonly demandedConsumption: number;
  readonly surplusPower: number;
  readonly demandBalance: number;
  readonly unservedLoad: number;
}

export interface EnergyNetworkStats extends EnergyDisplayStats {
  readonly buildingIds: readonly BuildingId[];
  readonly isPowered: boolean;
}

export interface EnergyGlobalStats extends EnergyDisplayStats {
  readonly onlineConsumers: number;
  readonly offlineConsumers: number;
}
