import { TileType, type BuildingType, type BuildingTypeId } from '../types';

const entries: readonly BuildingType[] = [
  {
    id: 'placeholder_1x1',
    footprint: { w: 1, h: 1 },
    allowedTiles: [TileType.Ground],
  },
  {
    id: 'placeholder_3x3',
    footprint: { w: 3, h: 3 },
    allowedTiles: [TileType.Ground],
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
  }
}
