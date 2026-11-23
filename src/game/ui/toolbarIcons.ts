import type { LucideIcon } from 'lucide-react';
import { ChevronsUp, Eye, Factory, Flame, Hammer, Merge, MoveRight, Split, Zap } from 'lucide-react';
import {
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_MK2_BUILDING_TYPE_ID,
  FUEL_CELL_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SPLITTER_BASIC_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
} from '../data/buildingCatalog';
import type { SelectedTool } from '../types';
import type { ToolbarEntry } from './buildingPresentation';
import { BUILDING_SPRITE_PATHS } from './spritePaths';

export type ToolbarIcon =
  | { kind: 'sprite'; src: string }
  | { kind: 'lucide'; Icon: LucideIcon };

/** Fallback lucide icons for building/tool entries without a sprite. */
const LUCIDE_FALLBACKS: ReadonlyMap<string, LucideIcon> = new Map([
  // Virtual tools
  ['belt', MoveRight],
  ['energy_link', Zap],
  // Buildings without a sprite
  [MERGER_BASIC_BUILDING_TYPE_ID, Merge],
  [WATCHTOWER_BUILDING_TYPE_ID, Eye],
  [CONVERTER_BUILDING_TYPE_ID, Hammer],
  [SYNTHESIZER_BUILDING_TYPE_ID, Factory],
]);

/**
 * Resolve the icon to display in the toolbar for a given entry.
 * Building entries with a known sprite path use it; everything else
 * falls back to a lucide-react icon.
 */
export function getToolbarIcon(entry: ToolbarEntry): ToolbarIcon {
  if (entry.kind === 'building') {
    const src = BUILDING_SPRITE_PATHS.get(entry.typeId);
    if (src) return { kind: 'sprite', src: `/${src}` };
    const Icon = LUCIDE_FALLBACKS.get(entry.typeId);
    if (Icon) return { kind: 'lucide', Icon };
  } else {
    const Icon = LUCIDE_FALLBACKS.get(entry.tool);
    if (Icon) return { kind: 'lucide', Icon };
  }
  // Last-resort fallback
  return { kind: 'lucide', Icon: MoveRight };
}

/**
 * Variants that share the art of their toolbar slot: a small mark tells which
 * one is in hand. An upgraded tier (extractor mk2, fast belt) gets the same
 * mark; the others get the icon of what they do.
 */
const VARIANT_MARKS: ReadonlyMap<string, LucideIcon> = new Map([
  [EXTRACTOR_MK2_BUILDING_TYPE_ID, ChevronsUp],
  [FUEL_CELL_BUILDING_TYPE_ID, Flame],
  [SPLITTER_BASIC_BUILDING_TYPE_ID, Split],
]);

/** The mark of the variant the tool holds, null for a slot's first variant and for other tools. */
export function getVariantMark(tool: SelectedTool): LucideIcon | null {
  if (tool.kind === 'building') return VARIANT_MARKS.get(tool.buildingType) ?? null;
  if (tool.kind === 'belt') return tool.tier === 'fast' ? ChevronsUp : null;
  return null;
}
