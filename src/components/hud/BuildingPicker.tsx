import { memo, useCallback, useEffect } from 'react';
import { Lock } from 'lucide-react';
import { beltTypeId, getBuildingType } from '@/game/data/buildingCatalog';
import type { GameEngine } from '@/game/engine/GameEngine';
import {
  beltToolLabel,
  entryVariants,
  nextBeltTool,
  nextBuildingTool,
  toolbarEntries,
  type BuildingToolbarEntry,
  type ToolbarEntry,
} from '@/game/ui/buildingPresentation';
import { costLines, type CostLine } from '@/game/ui/costPresentation';
import { lockedHint } from '@/game/ui/unlockPresentation';
import { getToolbarIcon } from '@/game/ui/toolbarIcons';
import type { BeltTier, SelectedTool } from '@/game/types';
import { digitOf } from '@/game/input/keyboardShortcuts';
import { useGameStore } from '@/store/useGameStore';
import { HoverTooltip, Icon } from '@/components/ui';
import { CostList } from './CostList';

function isEntryActive(entry: ToolbarEntry, tool: SelectedTool): boolean {
  if (entry.kind === 'building') {
    return tool.kind === 'building' && entryVariants(entry).includes(tool.buildingType);
  }
  return tool.kind === entry.tool;
}

/** The building an entry stands for right now: the active variant, its own type otherwise. */
function entryTypeId(entry: BuildingToolbarEntry, tool: SelectedTool): string {
  return isEntryActive(entry, tool) && tool.kind === 'building' ? tool.buildingType : entry.typeId;
}

function toolForEntry(entry: ToolbarEntry, current: SelectedTool, engine: GameEngine | null): SelectedTool {
  if (entry.kind === 'tool' && entry.tool === 'belt') return nextBeltTool(current, engine);
  if (entry.kind === 'building') return nextBuildingTool(entry, current, engine);
  if (isEntryActive(entry, current)) return { kind: 'select' };
  return { kind: entry.tool };
}

/** Belt tier the entry stands for right now: the active tool's, basic otherwise. */
function beltTierFor(entry: ToolbarEntry, tool: SelectedTool): BeltTier | null {
  if (entry.kind !== 'tool' || entry.tool !== 'belt') return null;
  return tool.kind === 'belt' ? (tool.tier ?? 'basic') : 'basic';
}

function entryLabel(entry: ToolbarEntry, tool: SelectedTool): string {
  const tier = beltTierFor(entry, tool);
  if (tier !== null) return beltToolLabel(tier);
  if (entry.kind === 'tool') return entry.label;
  const typeId = entryTypeId(entry, tool);
  return (typeId === entry.typeId ? entry.label : undefined) ?? getBuildingType(typeId)?.name ?? typeId;
}

/** Lock hint of a building entry; tools (belt, energy link) are always available. */
function entryLockedHint(entry: ToolbarEntry, engine: GameEngine | null): string | null {
  return entry.kind === 'building' ? lockedHint(engine, 'buildings', entry.typeId) : null;
}

interface EntryCost {
  readonly lines: readonly CostLine[];
  /** The belt tool is priced per segment: the route total shows while dragging. */
  readonly perSegment: boolean;
}

/** What one use of an entry costs from the global stock (empty in sandbox). */
function entryCost(entry: ToolbarEntry, tool: SelectedTool, engine: GameEngine | null): EntryCost {
  if (!engine) return { lines: [], perSegment: false };
  const tier = beltTierFor(entry, tool);
  const typeId = entry.kind === 'building' ? entryTypeId(entry, tool) : tier !== null ? beltTypeId(tier, 'straight') : null;
  if (typeId === null) return { lines: [], perSegment: false };
  const cost = engine.getBuildingCost(typeId);
  return { lines: costLines(cost, engine.getMissingResources(cost)), perSegment: entry.kind === 'tool' };
}

function hexColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

function ringStyle(color: number): React.CSSProperties {
  // 1px architectural hairline ring matching the family token — replaces the
  // old 2px glow boxShadow per DESIGN.md (no drop shadows, hairlines only).
  return { boxShadow: `0 0 0 1px ${hexColor(color)}` };
}

function BuildingPickerView() {
  const selectedTool = useGameStore((s) => s.selectedTool);
  const setSelectedTool = useGameStore((s) => s.setSelectedTool);
  const setSelectedBuilding = useGameStore((s) => s.setSelectedBuilding);
  const setSelectedBuildingAnchor = useGameStore((s) => s.setSelectedBuildingAnchor);
  const setPendingEnergyLinkSource = useGameStore((s) => s.setPendingEnergyLinkSource);
  const engine = useGameStore((s) => s.engine);
  // Re-render on world changes: milestones unlock entries, deliveries and
  // spending change what is affordable.
  useGameStore((s) => s.worldVersion);

  const selectEntry = useCallback(
    (entry: ToolbarEntry) => {
      if (entryLockedHint(entry, useGameStore.getState().engine) !== null) return;
      setSelectedBuilding(null);
      setSelectedBuildingAnchor(null);
      setPendingEnergyLinkSource(null);
      const state = useGameStore.getState();
      const nextTool = toolForEntry(entry, state.selectedTool, state.engine);
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
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const shortcut = digitOf(e) ?? e.key.toLowerCase();
      const entry = toolbarEntries.find((t) => t.shortcut === shortcut);
      if (!entry) return;
      e.preventDefault();
      selectEntry(entry);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectEntry]);

  return (
    <div role="toolbar" aria-label="Sélection de bâtiment" className="flex items-start gap-1">
      {toolbarEntries.map((entry) => {
        const active = isEntryActive(entry, selectedTool);
        const key = entry.kind === 'building' ? `building:${entry.typeId}` : `tool:${entry.tool}`;
        const label = entryLabel(entry, selectedTool);
        const lockHint = entryLockedHint(entry, engine);
        const locked = lockHint !== null;
        const cost = locked ? null : entryCost(entry, selectedTool, engine);
        const short = cost?.lines.some((line) => line.missing > 0) ?? false;
        const tooltip = [
          `${label} (${entry.shortcut.toUpperCase()})`,
          locked ? lockHint : null,
          short ? 'Ressources insuffisantes' : null,
        ].filter(Boolean).join(' · ');
        const tooltipId = `${key.replace(/[^a-z0-9_-]/gi, '-')}-tooltip`;
        const icon = getToolbarIcon(entry);
        const IconComponent = icon.kind === 'lucide' ? icon.Icon : null;

        return (
          <HoverTooltip key={key} content={tooltip} id={tooltipId}>
            <div className="flex flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => selectEntry(entry)}
                aria-pressed={active}
                aria-disabled={locked || undefined}
                aria-label={locked ? `${label}, verrouillé` : label}
                aria-describedby={tooltipId}
                className={[
                  'relative flex h-14 w-14 cursor-pointer flex-col items-center justify-center',
                  'overflow-hidden rounded-md border border-border transition-all',
                  'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                  locked
                    ? 'cursor-not-allowed bg-surface'
                    : active
                      ? 'bg-surface-2'
                      : 'bg-surface hover:bg-surface-2',
                ].join(' ')}
                style={active ? ringStyle(entry.highlightColor) : undefined}
              >
                {/* Sprite or lucide icon */}
                <div
                  className={`flex h-8 w-8 items-center justify-center ${locked ? 'opacity-30 grayscale' : short ? 'opacity-50' : ''}`}
                >
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
                        className={`h-5 w-5 transition-colors ${active ? 'text-ink' : 'text-ink-muted'}`}
                        strokeWidth={1.5}
                      />
                    )
                  )}
                </div>

                {locked && (
                  <Icon icon={Lock} size={11} className="absolute left-1 top-1 text-ink-muted" aria-hidden="true" />
                )}

                {/* Shortcut badge — top-right corner */}
                <span className="absolute right-1 top-0.5 tabular-nums text-[11px] text-ink-muted">
                  {entry.shortcut.toUpperCase()}
                </span>

                {/* Family color strip — bottom edge, always visible */}
                <div
                  className={`absolute inset-x-0 bottom-0 h-0.5 transition-opacity ${entry.activeClass} ${active ? 'opacity-100' : locked ? 'opacity-0' : 'opacity-35'}`}
                />
              </button>
              {cost && cost.lines.length > 0 && (
                <span className="inline-flex items-baseline gap-0.5">
                  <CostList
                    lines={cost.lines}
                    size="compact"
                    label={cost.perSegment ? `Coût par segment de ${label}` : `Coût de ${label}`}
                  />
                  {cost.perSegment && (
                    <span aria-hidden="true" className="text-[10px] leading-none text-ink-muted">
                      /seg
                    </span>
                  )}
                </span>
              )}
            </div>
          </HoverTooltip>
        );
      })}
    </div>
  );
}

/** Renders from its own subscriptions: the HUD around it re-renders several times a second. */
export const BuildingPicker = memo(BuildingPickerView);
