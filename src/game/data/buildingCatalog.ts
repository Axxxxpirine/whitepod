import {
  Direction,
  PortKind,
  ResourceType,
  TileType,
  type BeltTier,
  type BuildingType,
  type BuildingTypeId,
  type ResourceType as ResourceTypeT,
} from '../types';

export const EXTRACTOR_BUILDING_TYPE_ID = 'extractor_basic' as const;
export const EXTRACTOR_RATE_PER_MIN = 30;
/** Extractor mk2 (chapter 3): twice the rate, twice the power, drains its deposit twice as fast. */
export const EXTRACTOR_MK2_BUILDING_TYPE_ID = 'extractor_mk2' as const;
export const EXTRACTOR_MK2_RATE_PER_MIN = 60;
export const STORAGE_BUILDING_TYPE_ID = 'storage_basic' as const;
export const BELT_STRAIGHT_BUILDING_TYPE_ID = 'belt_straight' as const;
export const BELT_CORNER_CW_BUILDING_TYPE_ID = 'belt_corner_cw' as const;
export const BELT_CORNER_CCW_BUILDING_TYPE_ID = 'belt_corner_ccw' as const;
export const BELT_FAST_STRAIGHT_BUILDING_TYPE_ID = 'belt_fast_straight' as const;
export const BELT_FAST_CORNER_CW_BUILDING_TYPE_ID = 'belt_fast_corner_cw' as const;
export const BELT_FAST_CORNER_CCW_BUILDING_TYPE_ID = 'belt_fast_corner_ccw' as const;
export const SOLAR_PANEL_BUILDING_TYPE_ID = 'solar_panel' as const;
export const BATTERY_BASIC_BUILDING_TYPE_ID = 'battery_basic' as const;
export const MERGER_BASIC_BUILDING_TYPE_ID = 'merger_basic' as const;
export const SPLITTER_BASIC_BUILDING_TYPE_ID = 'splitter_basic' as const;
export const WATCHTOWER_BUILDING_TYPE_ID = 'watchtower' as const;
export const CONVERTER_BUILDING_TYPE_ID = 'converter_basic' as const;
export const SYNTHESIZER_BUILDING_TYPE_ID = 'synthesizer_basic' as const;
export const HUB_BUILDING_TYPE_ID = 'hub_lander' as const;
export const FUEL_CELL_BUILDING_TYPE_ID = 'fuel_cell' as const;

/** True for every extractor tier: driven by the catalog `extractionRatePerMinute` capability. */
export function isExtractorTypeId(typeId: BuildingTypeId): boolean {
  return (catalog.get(typeId)?.extractionRatePerMinute ?? 0) > 0;
}

export function extractorRatePerMinute(typeId: BuildingTypeId): number {
  return catalog.get(typeId)?.extractionRatePerMinute ?? 0;
}

/** Fuel-burning power buildings (catalog `fuel` capability). */
export function isFuelCellTypeId(typeId: BuildingTypeId): boolean {
  return catalog.get(typeId)?.fuel !== undefined;
}

/**
 * Buildings that pull their inputs from the producers upstream (machines and
 * fuel cells): routes end at them, and they reserve one unit per provider.
 */
export function pullsInputs(typeId: BuildingTypeId): boolean {
  return isProcessorTypeId(typeId) || isFuelCellTypeId(typeId);
}

export function isProcessorTypeId(typeId: BuildingTypeId): boolean {
  return typeId === CONVERTER_BUILDING_TYPE_ID || typeId === SYNTHESIZER_BUILDING_TYPE_ID;
}

/**
 * True when the building type accepts and stores resources (storage
 * inventory, belt sink). Driven by the catalog `storage` capability so a new
 * storage-like type only needs its catalog entry.
 */
export function isStorageTypeId(typeId: BuildingTypeId): boolean {
  return catalog.get(typeId)?.storage === true;
}

export type { BeltTier };
/** Belt segment shapes the router places: a straight run or a clockwise / counterclockwise corner. */
export type BeltShape = 'straight' | 'cw' | 'ccw';

const BELT_TYPE_IDS: Readonly<Record<BeltTier, Readonly<Record<BeltShape, BuildingTypeId>>>> = {
  basic: { straight: BELT_STRAIGHT_BUILDING_TYPE_ID, cw: BELT_CORNER_CW_BUILDING_TYPE_ID, ccw: BELT_CORNER_CCW_BUILDING_TYPE_ID },
  fast: { straight: BELT_FAST_STRAIGHT_BUILDING_TYPE_ID, cw: BELT_FAST_CORNER_CW_BUILDING_TYPE_ID, ccw: BELT_FAST_CORNER_CCW_BUILDING_TYPE_ID },
};

export function beltTypeId(tier: BeltTier, shape: BeltShape): BuildingTypeId {
  return BELT_TYPE_IDS[tier][shape];
}

/** Every belt type of a tier, e.g. to highlight a family or check an unlock. */
export function beltTypeIds(tier: BeltTier): readonly BuildingTypeId[] {
  return Object.values(BELT_TYPE_IDS[tier]);
}

function beltSlot(typeId: BuildingTypeId): { tier: BeltTier; shape: BeltShape } | null {
  for (const tier of Object.keys(BELT_TYPE_IDS) as BeltTier[]) {
    for (const shape of Object.keys(BELT_TYPE_IDS[tier]) as BeltShape[]) {
      if (BELT_TYPE_IDS[tier][shape] === typeId) return { tier, shape };
    }
  }
  return null;
}

export function beltTierOf(typeId: BuildingTypeId): BeltTier | null {
  return beltSlot(typeId)?.tier ?? null;
}

/** The same segment shape in another tier (upgrade in place), or null for a non-belt. */
export function beltTypeIdInTier(typeId: BuildingTypeId, tier: BeltTier): BuildingTypeId | null {
  const slot = beltSlot(typeId);
  return slot ? BELT_TYPE_IDS[tier][slot.shape] : null;
}

export function isBeltTypeId(typeId: BuildingTypeId): boolean {
  return beltSlot(typeId) !== null;
}

/**
 * Nodes a unit travels through on its way from a producer to a storage or a
 * machine: belts, mergers (many in, one out) and splitters (one in, many out).
 */
export function carriesFlowThrough(typeId: BuildingTypeId): boolean {
  return isBeltTypeId(typeId) || typeId === MERGER_BASIC_BUILDING_TYPE_ID || typeId === SPLITTER_BASIC_BUILDING_TYPE_ID;
}

// First-pass construction costs (campaign only); tuned with the chapter 1-2
// content (#71). Gameplay numbers stay in this catalog, never in systems.
const BELT_SEGMENT_COST = [{ resourceType: ResourceType.Regolith, amount: 1 }] as const;
/** Items per minute a basic belt run carries: two extractors (see flow/beltThroughput.ts). */
export const BELT_CAPACITY_PER_MIN = 60;
/** Fast belt (chapter 3): twice the basic belt, iron oxide in its cost. */
export const BELT_FAST_CAPACITY_PER_MIN = 120;
const BELT_FAST_SEGMENT_COST = [
  { resourceType: ResourceType.Regolith, amount: 1 },
  { resourceType: ResourceType.IronOxide, amount: 1 },
] as const;

const entries: readonly BuildingType[] = [
  {
    id: EXTRACTOR_BUILDING_TYPE_ID,
    name: 'Extracteur',
    cost: [{ resourceType: ResourceType.Regolith, amount: 10 }],
    extractionRatePerMinute: EXTRACTOR_RATE_PER_MIN,
    upgradesTo: EXTRACTOR_MK2_BUILDING_TYPE_ID,
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    requiresResourceDeposit: true,
    ports: [
      { id: 'out_east', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.East },
    ],
    energy: {
      consumption: 4,
    },
  },
  {
    id: EXTRACTOR_MK2_BUILDING_TYPE_ID,
    name: 'Extracteur mk2',
    cost: [
      { resourceType: ResourceType.Regolith, amount: 20 },
      { resourceType: ResourceType.IronOxide, amount: 10 },
    ],
    extractionRatePerMinute: EXTRACTOR_MK2_RATE_PER_MIN,
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    requiresResourceDeposit: true,
    ports: [
      { id: 'out_east', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.East },
    ],
    energy: {
      consumption: 8,
    },
  },
  {
    id: STORAGE_BUILDING_TYPE_ID,
    name: 'Stockage',
    cost: [{ resourceType: ResourceType.Regolith, amount: 20 }],
    footprint: { w: 3, h: 3 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    storage: true,
    ports: [
      { id: 'in_west', kind: PortKind.Input, offset: { x: 0, y: 1 }, side: Direction.West },
      { id: 'in_north', kind: PortKind.Input, offset: { x: 1, y: 0 }, side: Direction.North },
      { id: 'in_east', kind: PortKind.Input, offset: { x: 2, y: 1 }, side: Direction.East },
      { id: 'in_south', kind: PortKind.Input, offset: { x: 1, y: 2 }, side: Direction.South },
    ],
  },
  {
    id: SOLAR_PANEL_BUILDING_TYPE_ID,
    name: 'Panneau solaire',
    cost: [{ resourceType: ResourceType.Regolith, amount: 10 }],
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    ports: [],
    energy: {
      production: 10,
    },
  },
  {
    id: BATTERY_BASIC_BUILDING_TYPE_ID,
    name: 'Batterie',
    cost: [
      { resourceType: ResourceType.Regolith, amount: 15 },
      { resourceType: ResourceType.Oxygen, amount: 5 },
    ],
    footprint: { w: 2, h: 2 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    ports: [],
    energy: {
      battery: {
        capacity: 10,
        chargeRate: 20,
        dischargeRate: 20,
      },
    },
  },
  // Merger — 3 inputs (West, North, South) + 1 output (East), 1×1.
  // Rotation reuses the existing system: at rotation=North the ports are as
  // declared here; each 90° step rotates all sides accordingly, so all four
  // orientations produce a valid 3-in/1-out topology.
  {
    id: MERGER_BASIC_BUILDING_TYPE_ID,
    name: 'Fusionneur',
    cost: [{ resourceType: ResourceType.Regolith, amount: 5 }],
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    ports: [
      { id: 'in_west', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.West },
      { id: 'in_north', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.North },
      { id: 'in_south', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.South },
      { id: 'out_east', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.East },
    ],
  },
  // Splitter — 1 input (West) + 3 outputs (East, North, South), 1×1: the
  // mirror of the merger. Hands units to its outputs in turn, skipping an
  // output that cannot take one (flow/routing.ts).
  {
    id: SPLITTER_BASIC_BUILDING_TYPE_ID,
    name: 'Répartiteur',
    cost: [{ resourceType: ResourceType.Regolith, amount: 5 }],
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    ports: [
      { id: 'in_west', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.West },
      { id: 'out_east', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.East },
      { id: 'out_north', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.North },
      { id: 'out_south', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.South },
    ],
  },
  {
    id: WATCHTOWER_BUILDING_TYPE_ID,
    name: "Tour d'observation",
    cost: [{ resourceType: ResourceType.Regolith, amount: 25 }],
    footprint: { w: 2, h: 2 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    ports: [],
  },
  {
    id: CONVERTER_BUILDING_TYPE_ID,
    name: 'Convertisseur',
    cost: [
      { resourceType: ResourceType.Regolith, amount: 30 },
      { resourceType: ResourceType.Oxygen, amount: 10 },
    ],
    footprint: { w: 3, h: 3 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    ports: [
      { id: 'in', kind: PortKind.Input, offset: { x: 0, y: 1 }, side: Direction.West },
      { id: 'out', kind: PortKind.Output, offset: { x: 2, y: 1 }, side: Direction.East },
    ],
    energy: { consumption: 6 },
  },
  {
    id: SYNTHESIZER_BUILDING_TYPE_ID,
    name: 'Synthétiseur',
    cost: [
      { resourceType: ResourceType.Regolith, amount: 40 },
      { resourceType: ResourceType.IronOxide, amount: 10 },
    ],
    footprint: { w: 4, h: 4 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    ports: [
      { id: 'in_1', kind: PortKind.Input, offset: { x: 0, y: 1 }, side: Direction.West },
      { id: 'in_2', kind: PortKind.Input, offset: { x: 0, y: 2 }, side: Direction.West },
      { id: 'out', kind: PortKind.Output, offset: { x: 3, y: 2 }, side: Direction.East },
    ],
    energy: { consumption: 10 },
  },
  // Fuel cell (chapter 3): night power from hydrogen and oxygen belted in.
  {
    id: FUEL_CELL_BUILDING_TYPE_ID,
    name: 'Pile à combustible',
    cost: [
      { resourceType: ResourceType.Regolith, amount: 30 },
      { resourceType: ResourceType.IronOxide, amount: 10 },
    ],
    footprint: { w: 2, h: 2 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    fuel: {
      inputs: [
        { resourceType: ResourceType.Hydrogen, amount: 1 },
        { resourceType: ResourceType.Oxygen, amount: 1 },
      ],
      burnSeconds: 6,
      powerKw: 20,
    },
    ports: [
      { id: 'in_1', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.West },
      { id: 'in_2', kind: PortKind.Input, offset: { x: 0, y: 1 }, side: Direction.West },
    ],
  },
  // Campaign hub (lander): placed once by the engine at campaign start,
  // receives deliveries on two inputs per side and stores them like a storage.
  {
    id: HUB_BUILDING_TYPE_ID,
    name: "Module d'atterrissage",
    footprint: { w: 5, h: 5 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    storage: true,
    systemPlaced: true,
    permanent: true,
    ports: [
      { id: 'in_west_1', kind: PortKind.Input, offset: { x: 0, y: 1 }, side: Direction.West },
      { id: 'in_west_2', kind: PortKind.Input, offset: { x: 0, y: 3 }, side: Direction.West },
      { id: 'in_north_1', kind: PortKind.Input, offset: { x: 1, y: 0 }, side: Direction.North },
      { id: 'in_north_2', kind: PortKind.Input, offset: { x: 3, y: 0 }, side: Direction.North },
      { id: 'in_east_1', kind: PortKind.Input, offset: { x: 4, y: 1 }, side: Direction.East },
      { id: 'in_east_2', kind: PortKind.Input, offset: { x: 4, y: 3 }, side: Direction.East },
      { id: 'in_south_1', kind: PortKind.Input, offset: { x: 1, y: 4 }, side: Direction.South },
      { id: 'in_south_2', kind: PortKind.Input, offset: { x: 3, y: 4 }, side: Direction.South },
    ],
  },
  {
    id: 'placeholder_1x1',
    name: 'Placeholder 1x1',
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    ports: [],
  },
  {
    id: 'placeholder_3x3',
    name: 'Placeholder 3x3',
    footprint: { w: 3, h: 3 },
    allowedTiles: [TileType.Ground],
    ports: [],
  },
  {
    id: 'placeholder_node_1x1',
    name: 'Placeholder noeud 1x1',
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    ports: [
      { id: 'in_west', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.West },
      { id: 'out_east', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.East },
    ],
  },
  // Belts — all 1x1, 2 ports, Ground only. Rotation picks the flow direction.
  {
    id: BELT_STRAIGHT_BUILDING_TYPE_ID,
    name: 'Convoyeur droit',
    cost: BELT_SEGMENT_COST,
    beltCapacityPerMinute: BELT_CAPACITY_PER_MIN,
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    ports: [
      { id: 'in', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.West },
      { id: 'out', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.East },
    ],
  },
  // Clockwise corner at rotation=North: flow enters West, exits South.
  // 4 rotations cover NE/SE/SW/NW clockwise turns.
  {
    id: BELT_CORNER_CW_BUILDING_TYPE_ID,
    name: 'Coin droite',
    cost: BELT_SEGMENT_COST,
    beltCapacityPerMinute: BELT_CAPACITY_PER_MIN,
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    ports: [
      { id: 'in', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.West },
      { id: 'out', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.South },
    ],
  },
  // Counterclockwise corner at rotation=North: flow enters West, exits North.
  // Mirror of belt_corner_cw. Together they cover all 8 corner shapes.
  {
    id: BELT_CORNER_CCW_BUILDING_TYPE_ID,
    name: 'Coin gauche',
    cost: BELT_SEGMENT_COST,
    beltCapacityPerMinute: BELT_CAPACITY_PER_MIN,
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    ports: [
      { id: 'in', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.West },
      { id: 'out', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.North },
    ],
  },
  // Fast belts: same shapes and ports as the basic ones, so a route can be
  // upgraded in place without touching its connections.
  {
    id: BELT_FAST_STRAIGHT_BUILDING_TYPE_ID,
    name: 'Convoyeur rapide',
    cost: BELT_FAST_SEGMENT_COST,
    beltCapacityPerMinute: BELT_FAST_CAPACITY_PER_MIN,
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    ports: [
      { id: 'in', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.West },
      { id: 'out', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.East },
    ],
  },
  {
    id: BELT_FAST_CORNER_CW_BUILDING_TYPE_ID,
    name: 'Coin droite rapide',
    cost: BELT_FAST_SEGMENT_COST,
    beltCapacityPerMinute: BELT_FAST_CAPACITY_PER_MIN,
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    ports: [
      { id: 'in', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.West },
      { id: 'out', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.South },
    ],
  },
  {
    id: BELT_FAST_CORNER_CCW_BUILDING_TYPE_ID,
    name: 'Coin gauche rapide',
    cost: BELT_FAST_SEGMENT_COST,
    beltCapacityPerMinute: BELT_FAST_CAPACITY_PER_MIN,
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    ports: [
      { id: 'in', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.West },
      { id: 'out', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.North },
    ],
  },
  {
    id: 'placeholder_node_3x3',
    name: 'Placeholder noeud 3x3',
    footprint: { w: 3, h: 3 },
    allowedTiles: [TileType.Ground],
    ports: [
      { id: 'in_north', kind: PortKind.Input, offset: { x: 1, y: 0 }, side: Direction.North },
      { id: 'out_south', kind: PortKind.Output, offset: { x: 1, y: 2 }, side: Direction.South },
    ],
  },
];

const catalog = new Map<BuildingTypeId, BuildingType>(entries.map((t) => [t.id, t]));

export function getBuildingType(id: BuildingTypeId): BuildingType | undefined {
  return catalog.get(id);
}

export function getAllBuildingTypes(): readonly BuildingType[] {
  return entries;
}

export function resourceTypeLabel(type: ResourceTypeT): string {
  switch (type) {
    case ResourceType.Regolith:
      return 'Régolithe';
    case ResourceType.Hydrogen:
      return 'Hydrogène';
    case ResourceType.Oxygen:
      return 'Oxygène';
    case ResourceType.IronOxide:
      return 'Oxyde de fer';
    case ResourceType.AluminumOxide:
      return "Oxyde d'aluminium";
    case ResourceType.SiliconDioxide:
      return 'Dioxyde de silicium';
    case ResourceType.NitrogenGas:
      return 'Azote';
    case ResourceType.Carbon:
      return 'Carbone';
    case ResourceType.Water:
      return 'Eau';
    case ResourceType.Methane:
      return 'Méthane';
    case ResourceType.CarbonDioxide:
      return 'Dioxyde de carbone';
    case ResourceType.Ammonia:
      return 'Ammoniac';
    case ResourceType.CeramicPlates:
      return 'Plaques céramiques';
    default:
      return 'Aucune';
  }
}

export function validateCatalog(): void {
  for (const t of catalog.values()) {
    if (t.upgradesTo !== undefined) {
      // An upgrade swaps the type in place: tiles, ids and connections must stay valid.
      const target = catalog.get(t.upgradesTo);
      const samePorts = (port: BuildingType['ports'][number]) =>
        target?.ports.some((p) => p.id === port.id && p.kind === port.kind && p.side === port.side && p.offset.x === port.offset.x && p.offset.y === port.offset.y);
      if (!target || target.footprint.w !== t.footprint.w || target.footprint.h !== t.footprint.h ||
          target.ports.length !== t.ports.length || !t.ports.every(samePorts)) {
        throw new Error(`Invalid catalog entry '${t.id}': upgrade '${t.upgradesTo}' must share its footprint and ports`);
      }
    }
    if (t.footprint.w <= 0 || t.footprint.h <= 0) {
      throw new Error(
        `Invalid catalog entry '${t.id}': footprint must be > 0 (got ${t.footprint.w}x${t.footprint.h})`,
      );
    }
    if (t.allowedTiles.length === 0) {
      throw new Error(`Invalid catalog entry '${t.id}': allowedTiles must not be empty`);
    }
    const seen = new Set<string>();
    for (const p of t.ports) {
      if (seen.has(p.id)) {
        throw new Error(`Invalid catalog entry '${t.id}': duplicate port id '${p.id}'`);
      }
      seen.add(p.id);
      const { x, y } = p.offset;
      if (x < 0 || y < 0 || x >= t.footprint.w || y >= t.footprint.h) {
        throw new Error(
          `Invalid catalog entry '${t.id}': port '${p.id}' offset out of footprint`,
        );
      }
    }
  }
}
