import { getBuildingType } from '@/game/data/buildingCatalog';
import type { SelectedTool } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';
import { Chip } from '../ui';

function describeTool(tool: SelectedTool): string | null {
  switch (tool.kind) {
    case 'select':
      return null;
    case 'building':
      return getBuildingType(tool.buildingType)?.name ?? 'Bâtiment';
    case 'belt':
      return 'Convoyeur';
    case 'energy_link':
      return 'Lien énergie';
  }
}

export function ToolModeIndicator() {
  const selectedTool = useGameStore((s) => s.selectedTool);
  const beltPreview = useGameStore((s) => s.beltPreview);
  const pendingEnergyLinkSource = useGameStore((s) => s.pendingEnergyLinkSource);

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
    <div className="flex items-center gap-2 rounded-md border border-border bg-surface/92 px-2 py-1.5 text-xs text-ink backdrop-blur-md">
      <Chip tone={tone}>{chipLabel}</Chip>
      <span className="tabular-nums text-[10px] text-ink-muted">Esc pour annuler</span>
    </div>
  );
}
