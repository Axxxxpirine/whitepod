import { useMemo } from 'react';
import { getBuildingType } from '@/game/data/buildingCatalog';
import { getPlacementPreviewModel } from '@/game/renderer/placementPreviewModel';
import { beltToolLabel } from '@/game/ui/buildingPresentation';
import { costLines, placementFailureLabel, type CostLine } from '@/game/ui/costPresentation';
import type { BeltFailure, PlacementFailure, SelectedTool } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';
import { Chip } from '../ui';
import { CostList } from './CostList';

function describeTool(tool: SelectedTool): string | null {
  switch (tool.kind) {
    case 'select':
      return null;
    case 'building':
      return getBuildingType(tool.buildingType)?.name ?? 'Bâtiment';
    case 'belt':
      return beltToolLabel(tool.tier);
    case 'energy_link':
      return 'Lien énergie';
  }
}

interface PlacementReadout {
  readonly costLabel: string;
  /** Segments of the dragged belt route; absent for a building. */
  readonly segments?: number;
  readonly lines: readonly CostLine[];
  readonly reason: PlacementFailure | BeltFailure | null;
}

/**
 * Cost of what the active tool is about to place, and why it cannot be placed
 * at the hovered tile: a building under the cursor, or the belt route being
 * dragged. Null when there is nothing to report.
 */
function usePlacementReadout(): PlacementReadout | null {
  const engine = useGameStore((s) => s.engine);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const hoverTile = useGameStore((s) => s.hoverTile);
  const rotation = useGameStore((s) => s.currentBuildingRotation);
  const beltPreview = useGameStore((s) => s.beltPreview);
  // Affordability follows the stock, which moves on world changes.
  const worldVersion = useGameStore((s) => s.worldVersion);

  return useMemo(() => {
    void worldVersion;
    if (!engine) return null;
    if (selectedTool.kind === 'belt') {
      if (!beltPreview) return null;
      return {
        costLabel: beltPreview.upgrade ? 'Amélioration' : 'Tracé',
        segments: beltPreview.tiles.length,
        lines: costLines(beltPreview.cost, beltPreview.missing),
        reason: beltPreview.reason ?? null,
      };
    }
    if (selectedTool.kind !== 'building') return null;
    const cost = engine.getBuildingCost(selectedTool.buildingType);
    const preview = getPlacementPreviewModel(engine, selectedTool, hoverTile, null, rotation);
    const reason = preview?.kind === 'building' ? (preview.reason ?? null) : null;
    if (cost.length === 0 && reason === null) return null;
    return { costLabel: 'Coût', lines: costLines(cost, engine.getMissingResources(cost)), reason };
  }, [engine, selectedTool, hoverTile, rotation, beltPreview, worldVersion]);
}

export function ToolModeIndicator() {
  const selectedTool = useGameStore((s) => s.selectedTool);
  const beltPreview = useGameStore((s) => s.beltPreview);
  const pendingEnergyLinkSource = useGameStore((s) => s.pendingEnergyLinkSource);
  const readout = usePlacementReadout();

  const toolLabel = describeTool(selectedTool);
  const hasPendingContext =
    pendingEnergyLinkSource !== null || (selectedTool.kind === 'belt' && beltPreview !== null);

  // Stay hidden during pure idle SELECT with nothing pending — avoids chrome.
  if (!toolLabel && !hasPendingContext) return null;

  const tone = selectedTool.kind === 'energy_link' ? 'accent' : selectedTool.kind === 'building' ? 'accent-warm' : 'muted';
  const chipLabel =
    toolLabel !== null
      ? `Mode · ${toolLabel}`
      : pendingEnergyLinkSource !== null
        ? 'Mode · Lien en attente'
        : 'Mode · Tracé en attente';

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface/90 px-2 py-1.5 text-xs text-ink backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-nowrap">
        <Chip tone={tone}>{chipLabel}</Chip>
        <span className="tabular-nums text-[11px] text-ink-muted">Esc pour annuler</span>
      </div>
      {readout && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 whitespace-nowrap" data-testid="placement-readout">
          {readout.lines.length > 0 && (
            <span className="inline-flex items-center gap-2">
              <span className="label text-ink-muted">{readout.costLabel}</span>
              {readout.segments !== undefined && (
                <span className="tabular-nums text-ink-muted">{readout.segments} seg.</span>
              )}
              <CostList lines={readout.lines} label={readout.segments === undefined ? 'Coût' : readout.costLabel === 'Amélioration' ? "Coût de l'amélioration" : 'Coût du tracé'} />
            </span>
          )}
          {readout.reason && (
            <span
              role="status"
              className={readout.reason === 'insufficient_resources' ? 'text-accent-warm' : 'text-ink-muted'}
            >
              {placementFailureLabel(readout.reason)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
