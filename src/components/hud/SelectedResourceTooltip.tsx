import { resourceTypeLabel } from '@/game/data/buildingCatalog';
import { ResourceType } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';
import { TooltipBubble } from '../ui';

export function SelectedResourceTooltip() {
  const engine = useGameStore((s) => s.engine);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const selectedResourceTile = useGameStore((s) => s.selectedResourceTile);
  const selectedResourceAnchor = useGameStore((s) => s.selectedResourceAnchor);

  if (!engine || selectedTool.kind !== 'select' || !selectedResourceTile || !selectedResourceAnchor) return null;

  const resource = engine.getResourceAt(selectedResourceTile.x, selectedResourceTile.y);
  const building = engine.getBuildingAt(selectedResourceTile.x, selectedResourceTile.y);
  if (resource === ResourceType.None || building !== null) return null;

  const { x: anchorX, y: anchorY } = selectedResourceAnchor;
  const onScreen =
    anchorX >= 0 &&
    anchorX <= engine.viewport.screenWidth &&
    anchorY >= 0 &&
    anchorY <= engine.viewport.screenHeight;
  if (!onScreen) return null;

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: anchorX,
        top: anchorY,
        transform: 'translate(-50%, calc(-100% - 8px))',
      }}
    >
      <TooltipBubble content={resourceTypeLabel(resource)} className="opacity-100" />
    </div>
  );
}
