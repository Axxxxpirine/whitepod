import type { LucideIcon } from 'lucide-react';
import { Eye, Factory, Hammer, Merge, MoveRight, Zap } from 'lucide-react';
import {
  CONVERTER_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
} from '../data/buildingCatalog';
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
