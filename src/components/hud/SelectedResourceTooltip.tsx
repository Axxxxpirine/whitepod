import { memo } from 'react';
import { resourceTypeLabel } from '@/game/data/buildingCatalog';
import { isRichVein } from '@/game/data/depositAmounts';
import type { GameEngine } from '@/game/engine/GameEngine';
import { formatAmount } from '@/game/ui/depositPresentation';
import { ResourceType, type TileCoord } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';
import { TooltipBubble } from '../ui';

/**
 * "Régolithe · 1 520 unités", with "filon riche" for a rich vein. Sandbox
 * deposits never run out, so it shows the resource alone there.
 */
function depositLabel(engine: GameEngine, tile: TileCoord): string {
  const label = resourceTypeLabel(engine.getResourceAt(tile.x, tile.y));
  if (!engine.depletesDeposits) return label;
  const amount = engine.grid.getResourceAmount(tile.x, tile.y);
  if (amount === 0) return `${label} · épuisé`;
  const parts = [label, `${formatAmount(amount)} ${amount < 2 ? 'unité' : 'unités'}`];
  if (isRichVein(tile.x, tile.y, engine.mapSeed)) parts.push('filon riche');
  return parts.join(' · ');
}

function SelectedResourceTooltipView() {
  const engine = useGameStore((s) => s.engine);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const selectedResourceTile = useGameStore((s) => s.selectedResourceTile);
  const selectedResourceAnchor = useGameStore((s) => s.selectedResourceAnchor);
  // The amount left goes down with every unit extracted next door.
  useGameStore((s) => s.worldVersion);

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
      <TooltipBubble content={depositLabel(engine, selectedResourceTile)} className="opacity-100" />
    </div>
  );
}

/** Renders from its own subscriptions: the HUD around it re-renders several times a second. */
export const SelectedResourceTooltip = memo(SelectedResourceTooltipView);
