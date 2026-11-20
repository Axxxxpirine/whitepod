import { describe, expect, it } from 'vitest';
import {
  STORAGE_BUILDING_TYPE_ID,
  getAllBuildingTypes,
  isStorageTypeId,
} from '@/game/data/buildingCatalog';

describe('isStorageTypeId', () => {
  it('is true for storage_basic', () => {
    expect(isStorageTypeId(STORAGE_BUILDING_TYPE_ID)).toBe(true);
  });

  it('is false for every other catalog entry', () => {
    const others = getAllBuildingTypes().filter((type) => type.id !== STORAGE_BUILDING_TYPE_ID);
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
