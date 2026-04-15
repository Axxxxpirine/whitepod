import {
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '../data/buildingCatalog';
import type { BuildingTypeId, SelectedTool } from '../types';

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
}

export interface VirtualToolbarEntry {
  readonly kind: 'tool';
  readonly tool: Exclude<SelectedTool['kind'], 'select' | 'building'>;
  readonly label: string;
  readonly shortcut: string;
  readonly activeClass: string;
}

export type ToolbarEntry = BuildingToolbarEntry | VirtualToolbarEntry;

export const toolbarEntries: readonly ToolbarEntry[] = [
  {
    kind: 'building',
    typeId: EXTRACTOR_BUILDING_TYPE_ID,
    shortcut: '1',
    activeClass: 'bg-amber-400',
  },
  {
    kind: 'building',
    typeId: STORAGE_BUILDING_TYPE_ID,
    shortcut: '2',
    activeClass: 'bg-sky-400',
  },
  {
    kind: 'tool',
    tool: 'belt',
    label: 'Convoyeur',
    shortcut: '3',
    activeClass: 'bg-lime-300',
  },
  {
    kind: 'building',
    typeId: SOLAR_PANEL_BUILDING_TYPE_ID,
    shortcut: '4',
    activeClass: 'bg-lime-400',
  },
  {
    kind: 'tool',
    tool: 'energy_link',
    label: 'Lien énergie',
    shortcut: '5',
    activeClass: 'bg-violet-300',
  },
];
