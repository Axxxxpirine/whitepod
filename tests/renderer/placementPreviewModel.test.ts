import { describe, expect, it } from 'vitest';
import { EXTRACTOR_BUILDING_TYPE_ID, getBuildingType } from '@/game/data/buildingCatalog';
import { GameEngine } from '@/game/engine/GameEngine';
import { getPlacementPreviewModel } from '@/game/renderer/placementPreviewModel';
import { ResourceType, TileType, type SelectedTool } from '@/game/types';

function makeEngine() {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  return engine;
}

describe('getPlacementPreviewModel', () => {
  it('returns null for select tool', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'select' };

    const preview = getPlacementPreviewModel(engine, selectedTool, { x: 10, y: 10 });

    expect(preview).toBeNull();
  });

  it('returns null when hover tile is null', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID };

    const preview = getPlacementPreviewModel(engine, selectedTool, null);

    expect(preview).toBeNull();
  });

  it('returns valid model for extractor on resource deposit', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID };
    engine.grid.setResource(8, 8, ResourceType.IronOre);

    const preview = getPlacementPreviewModel(engine, selectedTool, { x: 8, y: 8 });

    expect(preview).toEqual({
      origin: { x: 8, y: 8 },
      footprint: { w: 1, h: 1 },
      isValid: true,
      buildingTypeId: EXTRACTOR_BUILDING_TYPE_ID,
    });
  });

  it('returns invalid model for extractor on ground without resource', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID };

    const preview = getPlacementPreviewModel(engine, selectedTool, { x: 8, y: 8 });

    expect(preview).toMatchObject({
      origin: { x: 8, y: 8 },
      isValid: false,
      buildingTypeId: EXTRACTOR_BUILDING_TYPE_ID,
    });
  });

  it('returns invalid model when target tile is occupied', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID };
    engine.grid.setResource(14, 14, ResourceType.Coal);
    engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 14, y: 14 });

    const preview = getPlacementPreviewModel(engine, selectedTool, { x: 14, y: 14 });

    expect(preview).toMatchObject({
      origin: { x: 14, y: 14 },
      isValid: false,
      buildingTypeId: EXTRACTOR_BUILDING_TYPE_ID,
    });
  });

  it('uses footprint dimensions from building catalog', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'building', buildingType: 'placeholder_3x3' };
    const footprint = getBuildingType('placeholder_3x3')!.footprint;

    const preview = getPlacementPreviewModel(engine, selectedTool, { x: 20, y: 20 });

    expect(preview?.footprint).toEqual(footprint);
  });
});
