import {
  Direction,
  PortKind,
  ResourceType,
  TileType,
  type BuildingType,
  type BuildingTypeId,
  type ResourceType as ResourceTypeT,
} from '../types';

export const EXTRACTOR_BUILDING_TYPE_ID = 'extractor_basic' as const;
export const EXTRACTOR_RATE_PER_MIN = 30;
export const STORAGE_BUILDING_TYPE_ID = 'storage_basic' as const;
export const BELT_STRAIGHT_BUILDING_TYPE_ID = 'belt_straight' as const;
export const BELT_CORNER_CW_BUILDING_TYPE_ID = 'belt_corner_cw' as const;
export const BELT_CORNER_CCW_BUILDING_TYPE_ID = 'belt_corner_ccw' as const;
export const SOLAR_PANEL_BUILDING_TYPE_ID = 'solar_panel' as const;
export const BATTERY_BASIC_BUILDING_TYPE_ID = 'battery_basic' as const;
export const MERGER_BASIC_BUILDING_TYPE_ID = 'merger_basic' as const;
export const WATCHTOWER_BUILDING_TYPE_ID = 'watchtower' as const;
export const CONVERTER_BUILDING_TYPE_ID = 'converter_basic' as const;
export const SYNTHESIZER_BUILDING_TYPE_ID = 'synthesizer_basic' as const;

export function isProcessorTypeId(typeId: BuildingTypeId): boolean {
  return typeId === CONVERTER_BUILDING_TYPE_ID || typeId === SYNTHESIZER_BUILDING_TYPE_ID;
}

export function isBeltTypeId(typeId: BuildingTypeId): boolean {
  return (
    typeId === BELT_STRAIGHT_BUILDING_TYPE_ID ||
    typeId === BELT_CORNER_CW_BUILDING_TYPE_ID ||
    typeId === BELT_CORNER_CCW_BUILDING_TYPE_ID
  );
}

const entries: readonly BuildingType[] = [
  {
    id: EXTRACTOR_BUILDING_TYPE_ID,
    name: 'Extracteur',
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
    id: STORAGE_BUILDING_TYPE_ID,
    name: 'Stockage',
    footprint: { w: 3, h: 3 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
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
  {
    id: WATCHTOWER_BUILDING_TYPE_ID,
    name: "Tour d'observation",
    footprint: { w: 2, h: 2 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    ports: [],
  },
  {
    id: CONVERTER_BUILDING_TYPE_ID,
    name: 'Convertisseur',
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
