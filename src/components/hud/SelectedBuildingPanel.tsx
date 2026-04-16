import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { getBuildingType, isBeltTypeId } from '@/game/data/buildingCatalog';
import { useGameStore } from '@/store/useGameStore';
import { BuildingStatsPanel } from '../BuildingStatsPanel';
import { Panel, PanelHeading, Icon } from '../ui';

export function SelectedBuildingPanel() {
  const engine = useGameStore((s) => s.engine);
  const selectedBuildingId = useGameStore((s) => s.selectedBuildingId);
  const selectedBuildingAnchor = useGameStore((s) => s.selectedBuildingAnchor);
  const pendingEnergyLinkSource = useGameStore((s) => s.pendingEnergyLinkSource);
  const setSelectedBuilding = useGameStore((s) => s.setSelectedBuilding);
  const setSelectedBuildingAnchor = useGameStore((s) => s.setSelectedBuildingAnchor);
  const setPendingEnergyLinkSource = useGameStore((s) => s.setPendingEnergyLinkSource);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const energyVersion = useGameStore((s) => s.engine?.energyNetwork.version ?? 0);

  const [worldTick, setWorldTick] = useState(0);
  useEffect(() => {
    if (!engine) return;
    return engine.subscribe((kind) => {
      if (kind === 'world') setWorldTick((t) => t + 1);
    });
  }, [engine]);
  if (!engine || selectedBuildingId === null || !selectedBuildingAnchor || selectedTool.kind === 'energy_link') return null;
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
      <Panel className="flex w-[200px] flex-col gap-1.5 px-3 py-2 text-ink">
        <div className="flex items-center gap-2">
          <PanelHeading className="whitespace-nowrap">{type.name}</PanelHeading>
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto cursor-pointer rounded-sm border border-transparent p-1.5 text-error transition-colors hover:border-error hover:bg-error/10"
            aria-label="Supprimer le bâtiment"
            title="Supprimer le bâtiment"
          >
            <Icon icon={Trash2} size={16} />
          </button>
        </div>
        <BuildingStatsPanel building={building} engine={engine} worldTick={worldTick} energyVersion={energyVersion} />
      </Panel>
    </div>
  );
}
