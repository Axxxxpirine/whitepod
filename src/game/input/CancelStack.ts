import type { BeltToolController } from '../engine/BeltToolController';
import type { useGameStore } from '@/store/useGameStore';

type GameStore = typeof useGameStore;

/**
 * Pop one cancellation layer. Each Escape press or out-of-grid click
 * cancels exactly one active context, in priority order:
 *
 *   1. belt tool has a pending source port      → clear it
 *   2. pending energy link source is set        → clear it
 *   3. current tool is not SELECT               → return to SELECT
 *   4. a building is selected                   → deselect it
 *   5. nothing active                           → no-op
 */
export function popCancelStack(
  store: GameStore,
  beltController: BeltToolController,
): boolean {
  if (beltController.hasPending()) {
    beltController.clearPendingPlacement();
    return true;
  }

  const state = store.getState();

  if (state.pendingEnergyLinkSource !== null) {
    state.setPendingEnergyLinkSource(null);
    return true;
  }

  if (state.selectedTool.kind !== 'select') {
    state.setSelectedTool({ kind: 'select' });
    return true;
  }

  if (state.selectedBuildingId !== null) {
    state.setSelectedBuilding(null);
    return true;
  }

  return false;
}
