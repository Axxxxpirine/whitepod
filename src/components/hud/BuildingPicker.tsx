import { useCallback, useEffect } from 'react';
import { getBuildingType } from '@/game/data/buildingCatalog';
import { toolbarEntries, type ToolbarEntry } from '@/game/ui/buildingPresentation';
import { getToolbarIcon } from '@/game/ui/toolbarIcons';
import type { SelectedTool } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

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

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
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
      setSelectedTool(toolForEntry(entry, active));
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
    <div role="toolbar" aria-label="Sélection de bâtiment" className="flex items-center gap-1">
      {toolbarEntries.map((entry) => {
        const active = isEntryActive(entry, selectedTool);
        const key = entry.kind === 'building' ? `building:${entry.typeId}` : `tool:${entry.tool}`;
        const label = entryLabel(entry);
        const tooltip = `${label} (${entry.shortcut.toUpperCase()})`;
        const tooltipId = `${key.replace(/[^a-z0-9_-]/gi, '-')}-tooltip`;
        const icon = getToolbarIcon(entry);
        const IconComponent = icon.kind === 'lucide' ? icon.Icon : null;

        return (
          <div key={key} className="group relative">
            <button
              type="button"
              onClick={() => selectEntry(entry)}
              aria-pressed={active}
              aria-label={label}
              aria-describedby={tooltipId}
              className={[
                'relative flex h-14 w-14 cursor-pointer flex-col items-center justify-center',
                'overflow-hidden rounded-xl border border-white/10 transition-all',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60',
                active ? 'bg-white/15' : 'bg-white/10 hover:bg-white/20',
              ].join(' ')}
              style={
                active
                  ? { boxShadow: `0 0 0 2px ${hexColor(entry.highlightColor)}` }
                  : undefined
              }
            >
              {/* Sprite or lucide icon */}
              <div className="flex h-8 w-8 items-center justify-center">
                {icon.kind === 'sprite' ? (
                  <img
                    src={icon.src}
                    alt=""
                    className="h-8 w-8 object-contain"
                    draggable={false}
                  />
                ) : (
                  IconComponent && (
                    <IconComponent
                      className={`h-5 w-5 transition-colors ${active ? 'text-white' : 'text-white/70'}`}
                    />
                  )
                )}
              </div>

              {/* Shortcut badge — top-right corner */}
              <span className="absolute right-1 top-0.5 font-mono text-[9px] text-white/50">
                {entry.shortcut.toUpperCase()}
              </span>

              {/* Family color strip — bottom edge, always visible */}
              <div
                className={`absolute inset-x-0 bottom-0 h-0.5 transition-opacity ${entry.activeClass} ${active ? 'opacity-100' : 'opacity-35'}`}
              />
            </button>

            <div
              id={tooltipId}
              role="tooltip"
              className={[
                'pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2',
                'rounded-md border border-white/10 bg-black/90 px-2 py-1 text-[10px] text-white/80 shadow-xl backdrop-blur-sm',
                'whitespace-nowrap opacity-0 transition-opacity duration-150',
                'group-hover:opacity-100 group-focus-within:opacity-100',
              ].join(' ')}
            >
              {tooltip}
            </div>
          </div>
        );
      })}
    </div>
  );
}
