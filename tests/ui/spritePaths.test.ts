import { describe, expect, it } from 'vitest';
import {
  BUILDING_SPRITE_SPECS,
  RESOURCE_SPRITE_SPECS,
  hasBuildingSpriteStrategy,
} from '@/game/ui/spritePaths';
import { getAllBuildingTypes, isBeltTypeId } from '@/game/data/buildingCatalog';
import { ResourceType } from '@/game/types';

describe('RTS sprite manifest', () => {
  it('defines a visual strategy for every non-belt building type', () => {
    const missing = getAllBuildingTypes()
      .filter((type) => !isBeltTypeId(type.id))
      .filter((type) => !hasBuildingSpriteStrategy(type.id))
      .map((type) => type.id);

    expect(missing).toEqual([]);
  });

  it('keeps generated building sprites bottom-anchored and footprint-scoped', () => {
    for (const [typeId, spec] of BUILDING_SPRITE_SPECS) {
      const type = getAllBuildingTypes().find((entry) => entry.id === typeId);
      expect(type, `Unknown building sprite type ${typeId}`).toBeDefined();
      expect(spec.footprint).toEqual(type!.footprint);
      expect(spec.anchor).toBe('bottom-center');
      expect(spec.displayHeightTiles).toBeGreaterThanOrEqual(type!.footprint.h);
      expect(spec.path).toMatch(/^sprites\/rts\/buildings\/.+\.png$/);
    }
  });

  it('covers every concrete resource with a generated RTS sprite', () => {
    const concreteResources = Object.values(ResourceType).filter((type) => type !== ResourceType.None);
    const missing = concreteResources.filter((type) => !RESOURCE_SPRITE_SPECS.has(type));
    expect(missing).toEqual([]);
  });
});
