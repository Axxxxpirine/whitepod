import { SOLAR_PANEL_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { BuildingId, SelectedTool } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

type GameStoreState = ReturnType<typeof useGameStore.getState>;

export function selectedToolsEqual(left: SelectedTool, right: SelectedTool): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'select' && right.kind === 'select') return true;
  if (left.kind === 'building' && right.kind === 'building') {
    return left.buildingType === right.buildingType;
  }
  return left.kind === 'energy_link' && right.kind === 'energy_link';
}

export interface EnergyLinkClickState {
  readonly pendingEnergyLinkSource: GameStoreState['pendingEnergyLinkSource'];
  setPendingEnergyLinkSource: GameStoreState['setPendingEnergyLinkSource'];
  setSelectedBuilding: GameStoreState['setSelectedBuilding'];
  setSelectedTool: GameStoreState['setSelectedTool'];
}

export interface BuildingPlacedState {
  readonly selectedTool: GameStoreState['selectedTool'];
  readonly linkSolarOnPlacement: GameStoreState['linkSolarOnPlacement'];
  setPendingEnergyLinkSource: GameStoreState['setPendingEnergyLinkSource'];
  setSelectedBuilding: GameStoreState['setSelectedBuilding'];
  setSelectedBuildingAnchor: GameStoreState['setSelectedBuildingAnchor'];
  setSelectedTool: GameStoreState['setSelectedTool'];
}

export function handleEnergyLinkClick(
  engine: GameEngine,
  state: EnergyLinkClickState,
  clickedBuildingId: BuildingId,
): void {
  const sourceId = state.pendingEnergyLinkSource;

  if (sourceId !== null && !engine.getBuildings().has(sourceId)) {
    state.setPendingEnergyLinkSource(null);
    state.setSelectedBuilding(clickedBuildingId);
    state.setPendingEnergyLinkSource(clickedBuildingId);
    return;
  }

  if (sourceId === null) {
    state.setPendingEnergyLinkSource(clickedBuildingId);
    state.setSelectedBuilding(clickedBuildingId);
    return;
  }

  if (sourceId === clickedBuildingId) return;

  const linkChanged = engine.areBuildingsEnergyLinked(sourceId, clickedBuildingId)
    ? engine.disconnectBuildings(sourceId, clickedBuildingId)
    : engine.connectBuildings(sourceId, clickedBuildingId);

  if (!linkChanged) {
    state.setPendingEnergyLinkSource(null);
    return;
  }

  state.setPendingEnergyLinkSource(null);
  state.setSelectedBuilding(sourceId);
}

export function handleBuildingPlaced(state: BuildingPlacedState, buildingId: BuildingId): void {
  state.setSelectedBuilding(null);
  state.setSelectedBuildingAnchor(null);

  if (
    state.selectedTool.kind === 'building' &&
    state.selectedTool.buildingType === SOLAR_PANEL_BUILDING_TYPE_ID &&
    state.linkSolarOnPlacement
  ) {
    state.setPendingEnergyLinkSource(buildingId);
    state.setSelectedTool({ kind: 'energy_link' });
    return;
  }

  state.setPendingEnergyLinkSource(null);
  state.setSelectedTool({ kind: 'select' });
}
