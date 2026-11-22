import type { RecipeId } from './recipeCatalog';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  BELT_CORNER_CCW_BUILDING_TYPE_ID,
  BELT_CORNER_CW_BUILDING_TYPE_ID,
  BELT_STRAIGHT_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  SPLITTER_BASIC_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
} from './buildingCatalog';
import { ResourceType, type BuildingTypeId, type ResourceCost } from '../types';

export type MilestoneId = string;

export interface MilestoneUnlocks {
  readonly buildings: readonly BuildingTypeId[];
  readonly recipes: readonly RecipeId[];
}

export interface Milestone {
  readonly id: MilestoneId;
  /** Campaign chapter (1 = Landing, 2 = Refining, ... see ROADMAP.md). */
  readonly chapter: number;
  readonly title: string;
  /** Resources the hub must hold; consumed when the player completes the milestone. */
  readonly requirements: readonly ResourceCost[];
  /** Content made available by completing it (see campaign/unlocks.ts). */
  readonly unlocks: MilestoneUnlocks;
}

/**
 * Content available from the first minute of a campaign: enough to extract,
 * store, belt and power a first line. Everything else comes from milestones;
 * content no milestone unlocks stays locked in campaign (later chapters).
 */
export const STARTING_UNLOCKS: MilestoneUnlocks = {
  buildings: [
    EXTRACTOR_BUILDING_TYPE_ID,
    STORAGE_BUILDING_TYPE_ID,
    BELT_STRAIGHT_BUILDING_TYPE_ID,
    BELT_CORNER_CW_BUILDING_TYPE_ID,
    BELT_CORNER_CCW_BUILDING_TYPE_ID,
    SOLAR_PANEL_BUILDING_TYPE_ID,
  ],
  recipes: [],
};

/**
 * Campaign milestones in play order: the active milestone is always the first
 * one not completed yet. Gameplay numbers live here, never in systems.
 *
 * Pacing (#71), checked by tests/balance/campaignPacing.test.ts: first
 * milestone within 3 minutes, chapter 1 in ~15, chapter 2 done around 40.
 * Each unlock arrives with the milestone whose next step needs it: the
 * merger with aluminium (2 regolith per cycle), the splitter alongside it to
 * share a line between machines, the synthesizer with ceramic.
 */
export const MILESTONES: readonly Milestone[] = [
  // Chapter 1 · Landing
  {
    id: 'landing_first_extraction',
    chapter: 1,
    title: 'Premières extractions',
    // Oxygen, never in the starting kit: the first line must actually deliver.
    requirements: [{ resourceType: ResourceType.Oxygen, amount: 20 }],
    unlocks: { buildings: [BATTERY_BASIC_BUILDING_TYPE_ID], recipes: [] },
  },
  {
    id: 'landing_breathable_air',
    chapter: 1,
    title: 'Air respirable',
    requirements: [
      { resourceType: ResourceType.Regolith, amount: 120 },
      { resourceType: ResourceType.Oxygen, amount: 60 },
    ],
    unlocks: { buildings: [WATCHTOWER_BUILDING_TYPE_ID], recipes: [] },
  },
  {
    id: 'landing_refinery',
    chapter: 1,
    title: 'Raffinerie',
    requirements: [
      { resourceType: ResourceType.Regolith, amount: 200 },
      { resourceType: ResourceType.Oxygen, amount: 120 },
    ],
    unlocks: { buildings: [CONVERTER_BUILDING_TYPE_ID], recipes: ['iron_oxide'] },
  },
  // Chapter 2 · Refining
  {
    id: 'refining_iron',
    chapter: 2,
    title: 'Oxyde de fer',
    requirements: [{ resourceType: ResourceType.IronOxide, amount: 60 }],
    unlocks: { buildings: [MERGER_BASIC_BUILDING_TYPE_ID, SPLITTER_BASIC_BUILDING_TYPE_ID], recipes: ['aluminum_oxide'] },
  },
  {
    id: 'refining_light_alloys',
    chapter: 2,
    title: 'Alliages légers',
    requirements: [
      { resourceType: ResourceType.IronOxide, amount: 80 },
      { resourceType: ResourceType.AluminumOxide, amount: 40 },
    ],
    unlocks: { buildings: [SYNTHESIZER_BUILDING_TYPE_ID], recipes: ['ceramic_plates', 'silicon_dioxide'] },
  },
  {
    id: 'refining_silicon',
    chapter: 2,
    title: 'Silicium',
    requirements: [
      { resourceType: ResourceType.SiliconDioxide, amount: 30 },
      { resourceType: ResourceType.CeramicPlates, amount: 15 },
    ],
    unlocks: { buildings: [], recipes: ['nitrogen_gas', 'water'] },
  },
];

/** Campaign chapter names (ROADMAP.md, campaign structure). */
const CHAPTER_TITLES: Readonly<Record<number, string>> = {
  1: 'Atterrissage',
  2: 'Raffinage',
  3: 'Chimie',
  4: 'Industrie',
  5: 'Colonie',
};

export function getChapterTitle(chapter: number): string | undefined {
  return CHAPTER_TITLES[chapter];
}

const milestoneMap = new Map<MilestoneId, Milestone>(MILESTONES.map((milestone) => [milestone.id, milestone]));

export function getMilestone(id: MilestoneId): Milestone | undefined {
  return milestoneMap.get(id);
}
