import { describe, expect, it } from 'vitest';
import {
  HUB_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getAllBuildingTypes,
  isStorageTypeId,
} from '@/game/data/buildingCatalog';

describe('isStorageTypeId', () => {
  it('is true for storage_basic', () => {
    expect(isStorageTypeId(STORAGE_BUILDING_TYPE_ID)).toBe(true);
  });

  it('is true for the campaign hub', () => {
    expect(isStorageTypeId(HUB_BUILDING_TYPE_ID)).toBe(true);
  });

  it('is false for every other catalog entry', () => {
    const storageIds = new Set<string>([STORAGE_BUILDING_TYPE_ID, HUB_BUILDING_TYPE_ID]);
    const others = getAllBuildingTypes().filter((type) => !storageIds.has(type.id));
    expect(others.length).toBeGreaterThan(0);
    for (const type of others) {
      expect(isStorageTypeId(type.id), type.id).toBe(false);
    }
  });

  it('is false for an unknown type id', () => {
    expect(isStorageTypeId('does_not_exist')).toBe(false);
  });

  it('follows the catalog storage capability', () => {
    for (const type of getAllBuildingTypes()) {
      expect(isStorageTypeId(type.id), type.id).toBe(type.storage === true);
    }
  });
});
