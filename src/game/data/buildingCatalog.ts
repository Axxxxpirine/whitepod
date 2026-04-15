import {
  Direction,
  PortKind,
  TileType,
  type BuildingType,
  type BuildingTypeId,
} from '../types';

export const EXTRACTOR_BUILDING_TYPE_ID = 'extractor_basic' as const;
export const STORAGE_BUILDING_TYPE_ID = 'storage_basic' as const;
export const SOLAR_PANEL_BUILDING_TYPE_ID = 'solar_panel' as const;

const entries: readonly BuildingType[] = [
  {
    id: EXTRACTOR_BUILDING_TYPE_ID,
    name: 'Extracteur',
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    requiresResourceDeposit: true,
    ports: [],
    energy: {
      consumption: 5,
    },
  },
  {
    id: STORAGE_BUILDING_TYPE_ID,
    name: 'Stockage',
    footprint: { w: 3, h: 3 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    ports: [],
  },
  {
    id: SOLAR_PANEL_BUILDING_TYPE_ID,
    name: 'Panneau solaire',
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    forbidsResourceDeposit: true,
    ports: [],
    energy: {
      production: 8,
    },
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
