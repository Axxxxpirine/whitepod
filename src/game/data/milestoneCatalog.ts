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
 * one not completed yet. First-pass numbers, tuned with the chapter 1-2
 * content (#71). Gameplay numbers live here, never in systems.
 */
export const MILESTONES: readonly Milestone[] = [
  // Chapter 1 · Landing
  {
    id: 'landing_first_extraction',
    chapter: 1,
    title: 'Premières extractions',
    requirements: [{ resourceType: ResourceType.Regolith, amount: 50 }],
    unlocks: { buildings: [BATTERY_BASIC_BUILDING_TYPE_ID], recipes: [] },
  },
  {
    id: 'landing_breathable_air',
    chapter: 1,
    title: 'Air respirable',
    requirements: [
      { resourceType: ResourceType.Regolith, amount: 100 },
      { resourceType: ResourceType.Oxygen, amount: 50 },
    ],
    unlocks: { buildings: [WATCHTOWER_BUILDING_TYPE_ID], recipes: [] },
  },
  {
    id: 'landing_refinery',
    chapter: 1,
    title: 'Raffinerie',
    requirements: [
      { resourceType: ResourceType.Regolith, amount: 150 },
      { resourceType: ResourceType.Oxygen, amount: 100 },
    ],
    unlocks: { buildings: [CONVERTER_BUILDING_TYPE_ID], recipes: ['iron_oxide', 'aluminum_oxide'] },
  },
  // Chapter 2 · Refining
  {
    id: 'refining_iron',
    chapter: 2,
    title: 'Oxyde de fer',
    requirements: [{ resourceType: ResourceType.IronOxide, amount: 40 }],
    unlocks: { buildings: [MERGER_BASIC_BUILDING_TYPE_ID], recipes: ['silicon_dioxide'] },
  },
  {
    id: 'refining_light_alloys',
    chapter: 2,
    title: 'Alliages légers',
    requirements: [
      { resourceType: ResourceType.IronOxide, amount: 60 },
      { resourceType: ResourceType.AluminumOxide, amount: 30 },
    ],
    unlocks: { buildings: [SYNTHESIZER_BUILDING_TYPE_ID], recipes: ['ceramic_plates'] },
  },
  {
    id: 'refining_silicon',
    chapter: 2,
    title: 'Silicium',
    requirements: [
      { resourceType: ResourceType.SiliconDioxide, amount: 30 },
      { resourceType: ResourceType.CeramicPlates, amount: 10 },
    ],
    unlocks: { buildings: [], recipes: ['nitrogen_gas', 'water'] },
  },
];

const milestoneMap = new Map<MilestoneId, Milestone>(MILESTONES.map((milestone) => [milestone.id, milestone]));

export function getMilestone(id: MilestoneId): Milestone | undefined {
  return milestoneMap.get(id);
}
