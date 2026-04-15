import {
  Direction,
  PortKind,
  TileType,
  type BuildingType,
  type BuildingTypeId,
} from '../types';

export const EXTRACTOR_BUILDING_TYPE_ID = 'extractor_basic' as const;

const entries: readonly BuildingType[] = [
  {
    id: EXTRACTOR_BUILDING_TYPE_ID,
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    requiresResourceDeposit: true,
    ports: [],
  },
  {
    id: 'placeholder_1x1',
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    ports: [],
  },
  {
    id: 'placeholder_3x3',
    footprint: { w: 3, h: 3 },
    allowedTiles: [TileType.Ground],
    ports: [],
  },
  {
    id: 'placeholder_node_1x1',
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
    ports: [
      { id: 'in_west', kind: PortKind.Input, offset: { x: 0, y: 0 }, side: Direction.West },
      { id: 'out_east', kind: PortKind.Output, offset: { x: 0, y: 0 }, side: Direction.East },
    ],
  },
  {
    id: 'placeholder_node_3x3',
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
