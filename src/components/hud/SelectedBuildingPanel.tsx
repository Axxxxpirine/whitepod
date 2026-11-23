import { memo, useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { beltTierOf, getBuildingType, isProcessorTypeId, isStorageTypeId } from '@/game/data/buildingCatalog';
import { deleteSelectedBuilding } from '@/game/input/deleteSelection';
import { beltToolLabel } from '@/game/ui/buildingPresentation';
import { useGameStore } from '@/store/useGameStore';
import { BuildingStatsPanel } from '../BuildingStatsPanel';
import { Panel, PanelHeading, Icon } from '../ui';

function SelectedBuildingPanelView() {
  const engine = useGameStore((s) => s.engine);
  const selectedBuildingId = useGameStore((s) => s.selectedBuildingId);
  const selectedBuildingAnchor = useGameStore((s) => s.selectedBuildingAnchor);
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
  // A belt is one thing to the player, whatever the shape of the piece clicked.
  const beltTier = beltTierOf(building.typeId);
  const title = beltTier ? beltToolLabel(beltTier) : type.name;
  const panelWidthClass = isProcessorTypeId(building.typeId)
    ? 'w-[280px]'
    : isStorageTypeId(building.typeId)
      ? 'w-[240px]'
      : 'w-[200px]';

  const { x: anchorX, y: anchorY } = selectedBuildingAnchor;
  const onScreen =
    anchorX >= 0 &&
    anchorX <= engine.viewport.screenWidth &&
    anchorY >= 0 &&
    anchorY <= engine.viewport.screenHeight;
  if (!onScreen) return null;

  return (
    <div
      className="pointer-events-auto absolute"
      style={{ left: anchorX, top: anchorY + 12, transform: 'translateX(-50%)' }}
    >
      <Panel className={`flex ${panelWidthClass} flex-col gap-1 px-3 py-2 text-ink`}>
        <div className="flex items-center gap-2">
          <PanelHeading className="whitespace-nowrap">{title}</PanelHeading>
          {!type.permanent && (
            <button
              type="button"
              onClick={() => deleteSelectedBuilding(useGameStore)}
              className="ml-auto cursor-pointer rounded-sm border border-transparent p-1 text-error transition-colors hover:border-error hover:bg-error/10"
              aria-label={beltTier ? 'Supprimer le convoyeur' : 'Supprimer le bâtiment'}
              title={beltTier ? 'Supprimer tout le convoyeur (Suppr)' : 'Supprimer le bâtiment (Suppr)'}
            >
              <Icon icon={Trash2} size={16} />
            </button>
          )}
        </div>
        <BuildingStatsPanel building={building} engine={engine} worldTick={worldTick} energyVersion={energyVersion} />
      </Panel>
    </div>
  );
}

/** Renders from its own subscriptions: the HUD around it re-renders several times a second. */
export const SelectedBuildingPanel = memo(SelectedBuildingPanelView);
