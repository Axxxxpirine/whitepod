import {
  BELT_CORNER_CCW_BUILDING_TYPE_ID,
  BELT_CORNER_CW_BUILDING_TYPE_ID,
  BELT_STRAIGHT_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
} from '../data/buildingCatalog';
import type { BuildingId, BuildingTypeId, SelectedTool } from '../types';
import type { GameEngine } from '../engine/GameEngine';

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

export const toolbarEntries: readonly ToolbarEntry[] = [
  {
    kind: 'building',
    typeId: EXTRACTOR_BUILDING_TYPE_ID,
    shortcut: '1',
    activeClass: 'bg-amber-400',
    highlightFamily: [EXTRACTOR_BUILDING_TYPE_ID],
    highlightColor: 0xfbbf24,
  },
  {
    kind: 'building',
    typeId: STORAGE_BUILDING_TYPE_ID,
    shortcut: '2',
    activeClass: 'bg-sky-400',
    highlightFamily: [STORAGE_BUILDING_TYPE_ID],
    highlightColor: 0x38bdf8,
  },
  {
    kind: 'tool',
    tool: 'belt',
    label: 'Convoyeur',
    shortcut: '3',
    activeClass: 'bg-lime-300',
    highlightFamily: [
      BELT_STRAIGHT_BUILDING_TYPE_ID,
      BELT_CORNER_CW_BUILDING_TYPE_ID,
      BELT_CORNER_CCW_BUILDING_TYPE_ID,
    ],
    highlightColor: 0xa3e635,
  },
  {
    kind: 'building',
    typeId: SOLAR_PANEL_BUILDING_TYPE_ID,
    shortcut: '4',
    activeClass: 'bg-lime-400',
    highlightFamily: [SOLAR_PANEL_BUILDING_TYPE_ID],
    highlightColor: 0x84cc16,
  },
  {
    kind: 'tool',
    tool: 'energy_link',
    label: 'Lien énergie',
    shortcut: '5',
    activeClass: 'bg-violet-300',
    highlightFamily: [],
    highlightColor: 0xc4b5fd,
    highlightMode: 'energy-network',
  },
];

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
