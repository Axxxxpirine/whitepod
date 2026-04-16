import { useCallback, useEffect } from 'react';
import { getBuildingType } from '@/game/data/buildingCatalog';
import { toolbarEntries, type ToolbarEntry } from '@/game/ui/buildingPresentation';
import type { SelectedTool } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

const INACTIVE_CLASS =
  'cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/20';
const ACTIVE_BASE =
  'cursor-pointer rounded-xl px-4 py-2 text-sm font-semibold text-black shadow-lg transition-colors';

function isEntryActive(entry: ToolbarEntry, tool: SelectedTool): boolean {
  if (entry.kind === 'building') {
    return tool.kind === 'building' && tool.buildingType === entry.typeId;
  }
  return tool.kind === entry.tool;
}

function toolForEntry(entry: ToolbarEntry, active: boolean): SelectedTool {
  if (active) return { kind: 'select' };
  if (entry.kind === 'building') return { kind: 'building', buildingType: entry.typeId };
  return { kind: entry.tool };
}

function entryLabel(entry: ToolbarEntry): string {
  if (entry.kind === 'tool') return entry.label;
  return entry.label ?? getBuildingType(entry.typeId)?.name ?? entry.typeId;
}

export function BuildingPicker() {
  const selectedTool = useGameStore((s) => s.selectedTool);
  const setSelectedTool = useGameStore((s) => s.setSelectedTool);
  const setSelectedBuilding = useGameStore((s) => s.setSelectedBuilding);
  const setSelectedBuildingAnchor = useGameStore((s) => s.setSelectedBuildingAnchor);
  const setPendingEnergyLinkSource = useGameStore((s) => s.setPendingEnergyLinkSource);

  const selectEntry = useCallback(
    (entry: ToolbarEntry) => {
      setSelectedBuilding(null);
      setSelectedBuildingAnchor(null);
      setPendingEnergyLinkSource(null);
      const active = isEntryActive(entry, useGameStore.getState().selectedTool);
      const nextTool = toolForEntry(entry, active);
      setSelectedTool(nextTool);
      useGameStore.getState().engine?.emitSfx({ type: 'tool_select', tool: nextTool.kind });
    },
    [setSelectedTool, setSelectedBuilding, setSelectedBuildingAnchor, setPendingEnergyLinkSource],
  );

  // Keyboard shortcuts — bound at window level. Guarded against inputs so that
  // future text fields (naming, search, chat) don't steal keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const entry = toolbarEntries.find((t) => t.shortcut === e.key.toLowerCase());
      if (!entry) return;
      e.preventDefault();
      selectEntry(entry);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectEntry]);

  return (
    <>
      {toolbarEntries.map((entry) => {
        const active = isEntryActive(entry, selectedTool);
        const key = entry.kind === 'building' ? `building:${entry.typeId}` : `tool:${entry.tool}`;
        return (
          <button
            key={key}
            type="button"
            onClick={() => selectEntry(entry)}
            aria-pressed={active}
            aria-label={entryLabel(entry)}
            title={`${entryLabel(entry)} (${entry.shortcut.toUpperCase()})`}
            className={active ? `${ACTIVE_BASE} ${entry.activeClass}` : INACTIVE_CLASS}
          >
            {entryLabel(entry)}
            <span className="ml-1.5 font-mono text-[10px] opacity-60">
              {entry.shortcut.toUpperCase()}
            </span>
          </button>
        );
      })}
    </>
  );
}
