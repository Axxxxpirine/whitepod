import { getBuildingType } from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type {
  BeltFailure,
  BuildingTypeId,
  Direction,
  Footprint,
  PlacementFailure,
  ResourceCost,
  SelectedTool,
  TileCoord,
} from '../types';

export interface BuildingPlacementPreviewModel {
  readonly kind: 'building';
  readonly origin: TileCoord;
  readonly footprint: Footprint;
  readonly isValid: boolean;
  /** Why the building cannot be placed here, when it cannot. */
  readonly reason?: PlacementFailure;
  readonly buildingTypeId: BuildingTypeId;
  readonly rotation: Direction;
  /** Hovering a building the tool upgrades in place: what the upgrade costs on top of the refund. */
  readonly upgradeCost?: readonly ResourceCost[];
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
  /** Total route cost (empty in sandbox) and what the global stock lacks for it. */
  readonly cost: readonly ResourceCost[];
  readonly missing: readonly ResourceCost[];
  /** An existing route turned into a faster tier: `cost` is what the player pays on top of the refund. */
  readonly upgrade?: boolean;
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

  const upgradable = engine.upgradableBuildingAt(hoverTile, selectedTool.buildingType);
  if (upgradable !== null) {
    const building = engine.getBuildings().get(upgradable)!;
    const quote = engine.quoteBuildingUpgrade(upgradable, selectedTool.buildingType);
    const affordable = quote.ok && quote.missing.length === 0;
    return {
      kind: 'building',
      origin: building.origin,
      footprint: buildingType.footprint,
      isValid: affordable,
      ...(affordable ? {} : { reason: quote.ok ? ('insufficient_resources' as const) : ('locked' as const) }),
      buildingTypeId: selectedTool.buildingType,
      rotation: building.rotation,
      upgradeCost: quote.ok ? quote.net : [],
    };
  }

  const placement = engine.canPlaceBuilding(selectedTool.buildingType, hoverTile, buildingRotation);
  return {
    kind: 'building',
    origin: hoverTile,
    footprint: buildingType.footprint,
    isValid: placement.ok,
    ...(placement.ok ? {} : { reason: placement.reason }),
    buildingTypeId: selectedTool.buildingType,
    rotation: buildingRotation,
  };
}
