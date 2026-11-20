import { describe, expect, it } from 'vitest';
import { EXTRACTOR_BUILDING_TYPE_ID, getBuildingType } from '@/game/data/buildingCatalog';
import { GameEngine } from '@/game/engine/GameEngine';
import { getPlacementPreviewModel } from '@/game/renderer/placementPreviewModel';
import { Direction, ResourceType, TileType, type SelectedTool } from '@/game/types';

function makeEngine() {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  return engine;
}

describe('getPlacementPreviewModel', () => {
  it('returns null for select tool', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'select' };

    const preview = getPlacementPreviewModel(
      engine,
      selectedTool,
      { x: 10, y: 10 },
      null,
      Direction.North,
    );

    expect(preview).toBeNull();
  });

  it('returns null when hover tile is null', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID };

    const preview = getPlacementPreviewModel(engine, selectedTool, null, null, Direction.North);

    expect(preview).toBeNull();
  });

  it('returns valid model for extractor on resource deposit', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID };
    engine.grid.setResource(8, 8, ResourceType.Hydrogen);

    const preview = getPlacementPreviewModel(
      engine,
      selectedTool,
      { x: 8, y: 8 },
      null,
      Direction.East,
    );

    expect(preview).toEqual({
      kind: 'building',
      origin: { x: 8, y: 8 },
      footprint: { w: 1, h: 1 },
      isValid: true,
      buildingTypeId: EXTRACTOR_BUILDING_TYPE_ID,
      rotation: Direction.East,
    });
  });

  it('returns invalid model for extractor on ground without resource', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID };

    const preview = getPlacementPreviewModel(
      engine,
      selectedTool,
      { x: 8, y: 8 },
      null,
      Direction.North,
    );

    expect(preview).toMatchObject({
      origin: { x: 8, y: 8 },
      isValid: false,
      reason: 'resource_required',
      buildingTypeId: EXTRACTOR_BUILDING_TYPE_ID,
    });
  });

  it('returns invalid model when target tile is occupied', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID };
    engine.grid.setResource(14, 14, ResourceType.Regolith);
    engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 14, y: 14 });

    const preview = getPlacementPreviewModel(
      engine,
      selectedTool,
      { x: 14, y: 14 },
      null,
      Direction.North,
    );

    expect(preview).toMatchObject({
      origin: { x: 14, y: 14 },
      isValid: false,
      reason: 'tile_occupied',
      buildingTypeId: EXTRACTOR_BUILDING_TYPE_ID,
    });
  });

  it('uses footprint dimensions from building catalog', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'building', buildingType: 'placeholder_3x3' };
    const footprint = getBuildingType('placeholder_3x3')!.footprint;

    const preview = getPlacementPreviewModel(
      engine,
      selectedTool,
      { x: 20, y: 20 },
      null,
      Direction.South,
    );

    expect(preview?.kind).toBe('building');
    if (!preview || preview.kind !== 'building') {
      throw new Error('expected building preview');
    }
    expect(preview.footprint).toEqual(footprint);
  });

  it('returns the belt preview as-is when the belt tool is selected', () => {
    const engine = makeEngine();
    const selectedTool: SelectedTool = { kind: 'belt' };
    const beltPreview = {
      kind: 'belt' as const,
      isValid: true,
      tiles: [{ coord: { x: 6, y: 4 }, tint: 0x22c55e }],
      cost: [],
      missing: [],
    };

    const preview = getPlacementPreviewModel(
      engine,
      selectedTool,
      { x: 10, y: 10 },
      beltPreview,
      Direction.North,
    );

    expect(preview).toEqual(beltPreview);
  });
});
