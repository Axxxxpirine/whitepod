import { Trash2 } from 'lucide-react';
import { getBuildingType, isBeltTypeId } from '@/game/data/buildingCatalog';
import { useGameStore } from '@/store/useGameStore';
import { BuildingStatsPanel } from '../BuildingStatsPanel';

export function SelectedBuildingPanel() {
  const engine = useGameStore((s) => s.engine);
  const selectedBuildingId = useGameStore((s) => s.selectedBuildingId);
  const selectedBuildingAnchor = useGameStore((s) => s.selectedBuildingAnchor);
  const pendingEnergyLinkSource = useGameStore((s) => s.pendingEnergyLinkSource);
  const setSelectedBuilding = useGameStore((s) => s.setSelectedBuilding);
  const setSelectedBuildingAnchor = useGameStore((s) => s.setSelectedBuildingAnchor);
  const setPendingEnergyLinkSource = useGameStore((s) => s.setPendingEnergyLinkSource);
  if (!engine || selectedBuildingId === null || !selectedBuildingAnchor) return null;
  const building = engine.getBuildings().get(selectedBuildingId);
  if (!building) return null;
  const type = getBuildingType(building.typeId);
  if (!type) return null;

  const { x: anchorX, y: anchorY } = selectedBuildingAnchor;
  const onScreen =
    anchorX >= 0 &&
    anchorX <= engine.viewport.screenWidth &&
    anchorY >= 0 &&
    anchorY <= engine.viewport.screenHeight;
  if (!onScreen) return null;

  const handleDelete = () => {
    const removed = isBeltTypeId(building.typeId)
      ? engine.removeBelt(selectedBuildingId)
      : engine.removeBuilding(selectedBuildingId);
    if (!removed) return;
    if (pendingEnergyLinkSource === selectedBuildingId) {
      setPendingEnergyLinkSource(null);
    }
    setSelectedBuilding(null);
    setSelectedBuildingAnchor(null);
  };

  return (
    <div
      className="pointer-events-auto absolute"
      style={{ left: anchorX, top: anchorY + 12, transform: 'translateX(-50%)' }}
    >
      <div className="flex min-w-[160px] flex-col gap-1.5 rounded-xl border border-white/15 bg-black/80 px-3 py-2 text-white shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm font-medium">{type.name}</span>
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto cursor-pointer rounded-lg bg-red-500/15 p-1.5 text-red-300 transition-colors hover:bg-red-500/25 hover:text-red-200"
            aria-label="Supprimer le bâtiment"
            title="Supprimer le bâtiment"
          >
            <Trash2 size={16} />
          </button>
        </div>
        <BuildingStatsPanel building={building} engine={engine} />
      </div>
    </div>
  );
}
