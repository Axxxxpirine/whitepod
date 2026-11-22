import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  beltTypeId,
  beltTypeIds,
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
  getBuildingType,
} from '../data/buildingCatalog';
import type { BeltTier, BuildingId, BuildingTypeId, SelectedTool } from '../types';
import type { GameEngine } from '../engine/GameEngine';
import { PIXI } from '@/design/tokens';

/**
 * Toolbar entries. Each entry is either a placeable building (kind: 'building',
 * by type id) or a virtual tool (kind: 'tool', e.g. belt routing, energy link).
 * The user-facing toolbar is generated from this array — adding a new building
 * to the game = catalog entry + one row here.
 */
export interface BuildingToolbarEntry {
  readonly kind: 'building';
  readonly typeId: BuildingTypeId;
  /** Short label shown on the button. Falls back to catalog name if omitted. */
  readonly label?: string;
  /** Single-character keyboard shortcut (lowercase). */
  readonly shortcut: string;
  /** Tailwind bg color class for the active state. */
  readonly activeClass: string;
  /**
   * Existing buildings to pulse-highlight when this entry is active. For a
   * single-type entry (extractor, storage, solar) it's just [typeId]; for
   * grouped entries (belt) it lists every family member.
   */
  readonly highlightFamily: readonly BuildingTypeId[];
  /** Pulse color (hex), matches the visual accent of activeClass. */
  readonly highlightColor: number;
}

export interface VirtualToolbarEntry {
  readonly kind: 'tool';
  readonly tool: Exclude<SelectedTool['kind'], 'select' | 'building'>;
  readonly label: string;
  readonly shortcut: string;
  readonly activeClass: string;
  readonly highlightFamily: readonly BuildingTypeId[];
  readonly highlightColor: number;
  /**
   * Opt-in override: when set, highlight targets are computed differently
   * (e.g. 'energy-network' pulses every energy-bearing building, not a fixed
   * type list). Leave undefined for standard family pulsing.
   */
  readonly highlightMode?: 'energy-network';
}

export type ToolbarEntry = BuildingToolbarEntry | VirtualToolbarEntry;

// Toolbar palette mapped to the Architect's Drawing Board design system.
// Functional families share tokens (extractor & battery = warm; storage &
// energy_link = cyan; merger & watchtower = muted neutral) — overlap is
// acceptable since icons + hotkey badges carry identity alongside color.
export const toolbarEntries: readonly ToolbarEntry[] = [
  {
    kind: 'building',
    typeId: EXTRACTOR_BUILDING_TYPE_ID,
    shortcut: '1',
    activeClass: 'bg-accent-warm',
    highlightFamily: [EXTRACTOR_BUILDING_TYPE_ID],
    highlightColor: PIXI.accentWarm,
  },
  {
    kind: 'building',
    typeId: STORAGE_BUILDING_TYPE_ID,
    shortcut: '2',
    activeClass: 'bg-accent',
    highlightFamily: [STORAGE_BUILDING_TYPE_ID],
    highlightColor: PIXI.accent,
  },
  {
    kind: 'tool',
    tool: 'belt',
    label: 'Convoyeur',
    shortcut: '3',
    activeClass: 'bg-ink',
    highlightFamily: [...beltTypeIds('basic'), ...beltTypeIds('fast')],
    highlightColor: PIXI.ink,
  },
  {
    kind: 'building',
    typeId: SOLAR_PANEL_BUILDING_TYPE_ID,
    shortcut: '4',
    activeClass: 'bg-ok',
    highlightFamily: [SOLAR_PANEL_BUILDING_TYPE_ID],
    highlightColor: PIXI.ok,
  },
  {
    kind: 'building',
    typeId: BATTERY_BASIC_BUILDING_TYPE_ID,
    shortcut: '5',
    activeClass: 'bg-accent-warm',
    highlightFamily: [BATTERY_BASIC_BUILDING_TYPE_ID],
    highlightColor: PIXI.accentWarm,
  },
  {
    kind: 'building',
    typeId: MERGER_BASIC_BUILDING_TYPE_ID,
    shortcut: '6',
    activeClass: 'bg-ink-muted',
    highlightFamily: [MERGER_BASIC_BUILDING_TYPE_ID],
    highlightColor: PIXI.inkMuted,
  },
  {
    kind: 'tool',
    tool: 'energy_link',
    label: 'Lien énergie',
    shortcut: '7',
    activeClass: 'bg-accent',
    highlightFamily: [],
    highlightColor: PIXI.accent,
    highlightMode: 'energy-network',
  },
  {
    kind: 'building',
    typeId: WATCHTOWER_BUILDING_TYPE_ID,
    shortcut: '8',
    activeClass: 'bg-ink-muted',
    highlightFamily: [WATCHTOWER_BUILDING_TYPE_ID],
    highlightColor: PIXI.inkMuted,
  },
  {
    kind: 'building',
    typeId: CONVERTER_BUILDING_TYPE_ID,
    shortcut: '9',
    activeClass: 'bg-accent-warm',
    highlightFamily: [CONVERTER_BUILDING_TYPE_ID],
    highlightColor: PIXI.accentWarm,
  },
  {
    kind: 'building',
    typeId: SYNTHESIZER_BUILDING_TYPE_ID,
    shortcut: '0',
    activeClass: 'bg-accent-warm',
    highlightFamily: [SYNTHESIZER_BUILDING_TYPE_ID],
    highlightColor: PIXI.accentWarm,
  },
];

export function beltToolLabel(tier: BeltTier = 'basic'): string {
  return tier === 'fast' ? 'Convoyeur rapide' : 'Convoyeur';
}

/**
 * Selecting the belt entry again moves to the fast belt once it is unlocked,
 * then back to selection: one toolbar slot for both tiers.
 */
export function nextBeltTool(current: SelectedTool, engine: GameEngine | null): SelectedTool {
  if (current.kind !== 'belt') return { kind: 'belt' };
  const fastUnlocked = engine?.isBuildingUnlocked(beltTypeId('fast', 'straight')) ?? false;
  return current.tier !== 'fast' && fastUnlocked ? { kind: 'belt', tier: 'fast' } : { kind: 'select' };
}

function findEntryForTool(tool: SelectedTool): ToolbarEntry | null {
  if (tool.kind === 'select') return null;
  if (tool.kind === 'building') {
    return (
      toolbarEntries.find(
        (e) => e.kind === 'building' && e.typeId === tool.buildingType,
      ) ?? null
    );
  }
  return toolbarEntries.find((e) => e.kind === 'tool' && e.tool === tool.kind) ?? null;
}

export interface HighlightSpec {
  readonly buildingIds: readonly BuildingId[];
  readonly color: number;
}

/**
 * Resolve which existing buildings should pulse for the currently active tool.
 * Encapsulates the 'energy-network' special case so the renderer stays dumb.
 */
export function getHighlightTargets(
  tool: SelectedTool,
  engine: GameEngine,
): HighlightSpec | null {
  const entry = findEntryForTool(tool);
  if (!entry) return null;

  if (entry.kind === 'tool' && entry.highlightMode === 'energy-network') {
    const ids: BuildingId[] = [];
    for (const [id, building] of engine.getBuildings()) {
      const type = getBuildingType(building.typeId);
      if (type?.energy) ids.push(id);
    }
    return { buildingIds: ids, color: entry.highlightColor };
  }

  if (entry.highlightFamily.length === 0) return null;
  const familySet = new Set<BuildingTypeId>(entry.highlightFamily);
  const ids: BuildingId[] = [];
  for (const [id, building] of engine.getBuildings()) {
    if (familySet.has(building.typeId)) ids.push(id);
  }
  return { buildingIds: ids, color: entry.highlightColor };
}
