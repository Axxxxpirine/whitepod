import { getBuildingType } from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type { BuildingTypeId, Footprint, SelectedTool, TileCoord } from '../types';

export interface PlacementPreviewModel {
  readonly origin: TileCoord;
  readonly footprint: Footprint;
  readonly isValid: boolean;
  readonly buildingTypeId: BuildingTypeId;
}

export function getPlacementPreviewModel(
  engine: GameEngine,
  selectedTool: SelectedTool,
  hoverTile: TileCoord | null,
): PlacementPreviewModel | null {
  if (selectedTool.kind !== 'building' || !hoverTile) return null;

  const buildingType = getBuildingType(selectedTool.buildingType);
  if (!buildingType) return null;

  return {
    origin: hoverTile,
    footprint: buildingType.footprint,
    isValid: engine.canPlaceBuilding(selectedTool.buildingType, hoverTile).ok,
    buildingTypeId: selectedTool.buildingType,
  };
}
