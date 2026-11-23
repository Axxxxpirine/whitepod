import { isBeltTypeId } from '../data/buildingCatalog';
import type { useGameStore } from '@/store/useGameStore';

type GameStore = typeof useGameStore;

/**
 * Removes the selected building: the trash button of its panel and the Delete
 * key. A belt goes as a whole, whatever piece of it is selected. Returns false
 * when nothing was removed (no selection, or a building the engine keeps).
 */
export function deleteSelectedBuilding(store: GameStore): boolean {
  const state = store.getState();
  const { engine, selectedBuildingId } = state;
  if (!engine || selectedBuildingId === null) return false;
  const building = engine.getBuildings().get(selectedBuildingId);
  if (!building) return false;

  const removed = isBeltTypeId(building.typeId)
    ? engine.removeBelt(selectedBuildingId)
    : engine.removeBuilding(selectedBuildingId);
  if (!removed) return false;

  if (state.pendingEnergyLinkSource === selectedBuildingId) state.setPendingEnergyLinkSource(null);
  state.setSelectedBuilding(null);
  state.setSelectedBuildingAnchor(null);
  return true;
}
