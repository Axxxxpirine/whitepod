import { getBuildingType } from '@/game/data/buildingCatalog';
import type { SelectedTool } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

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

  return (
    <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2 rounded-md border border-accent bg-surface/90 px-3 py-1.5 text-xs text-ink backdrop-blur-md">
      {toolLabel && (
        <span className="font-medium">
          <span className="label text-ink-muted">Mode&nbsp;·&nbsp;</span>
          {toolLabel}
        </span>
      )}
      <span className="tabular-nums text-[10px] text-ink-muted">Esc pour annuler</span>
    </div>
  );
}
