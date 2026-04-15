import { getBuildingType } from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type {
  BeltFailure,
  BuildingTypeId,
  Direction,
  Footprint,
  SelectedTool,
  TileCoord,
} from '../types';

export interface BuildingPlacementPreviewModel {
  readonly kind: 'building';
  readonly origin: TileCoord;
  readonly footprint: Footprint;
  readonly isValid: boolean;
  readonly buildingTypeId: BuildingTypeId;
  readonly rotation: Direction;
}

export interface BeltPreviewTile {
  readonly coord: TileCoord;
  readonly tint: number;
}

export interface BeltPlacementPreviewModel {
  readonly kind: 'belt';
  readonly tiles: readonly BeltPreviewTile[];
  readonly isValid: boolean;
  readonly reason?: BeltFailure;
}

export type PlacementPreviewModel = BuildingPlacementPreviewModel | BeltPlacementPreviewModel;

export function getPlacementPreviewModel(
  engine: GameEngine,
  selectedTool: SelectedTool,
  hoverTile: TileCoord | null,
  beltPreview: BeltPlacementPreviewModel | null,
  buildingRotation: Direction,
): PlacementPreviewModel | null {
  if (selectedTool.kind === 'belt') return beltPreview;
  if (selectedTool.kind !== 'building' || !hoverTile) return null;

  const buildingType = getBuildingType(selectedTool.buildingType);
  if (!buildingType) return null;

  return {
    kind: 'building',
    origin: hoverTile,
    footprint: buildingType.footprint,
    isValid: engine.canPlaceBuilding(selectedTool.buildingType, hoverTile, buildingRotation).ok,
    buildingTypeId: selectedTool.buildingType,
    rotation: buildingRotation,
  };
}
