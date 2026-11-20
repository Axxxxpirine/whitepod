import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
} from '../data/buildingCatalog';
import { ResourceType, type BuildingTypeId, type ResourceType as ResourceTypeValue } from '../types';

export type SpriteAssetKind = 'generated' | 'legacy' | 'procedural';
export type SpriteAnchor = 'center' | 'bottom-center';

export interface SpriteAssetSpec {
  readonly path: string;
  readonly footprint: { readonly w: number; readonly h: number };
  readonly displayHeightTiles: number;
  readonly anchor: SpriteAnchor;
  readonly kind: SpriteAssetKind;
}

/**
 * RTS hybrid sprite manifest.
 *
 * The gameplay catalog owns placement rules and ports. This manifest only owns
 * visual presentation: generated asset path, bottom anchor, and display height.
 */
export const BUILDING_SPRITE_SPECS: ReadonlyMap<BuildingTypeId, SpriteAssetSpec> = new Map([
  [
    EXTRACTOR_BUILDING_TYPE_ID,
    {
      path: 'sprites/rts/buildings/extractor.png',
      footprint: { w: 1, h: 1 },
      displayHeightTiles: 1.7,
      anchor: 'bottom-center',
      kind: 'generated',
    },
  ],
  [
    STORAGE_BUILDING_TYPE_ID,
    {
      path: 'sprites/rts/buildings/storage.png',
      footprint: { w: 3, h: 3 },
      displayHeightTiles: 3.2,
      anchor: 'bottom-center',
      kind: 'generated',
    },
  ],
  [
    SOLAR_PANEL_BUILDING_TYPE_ID,
    {
      path: 'sprites/rts/buildings/solar_panel.png',
      footprint: { w: 1, h: 1 },
      displayHeightTiles: 1.25,
      anchor: 'bottom-center',
      kind: 'generated',
    },
  ],
  [
    BATTERY_BASIC_BUILDING_TYPE_ID,
    {
      path: 'sprites/rts/buildings/battery.png',
      footprint: { w: 2, h: 2 },
      displayHeightTiles: 2.25,
      anchor: 'bottom-center',
      kind: 'generated',
    },
  ],
  [
    MERGER_BASIC_BUILDING_TYPE_ID,
    {
      path: 'sprites/rts/buildings/merger.png',
      footprint: { w: 1, h: 1 },
      displayHeightTiles: 1.35,
      anchor: 'bottom-center',
      kind: 'generated',
    },
  ],
  [
    WATCHTOWER_BUILDING_TYPE_ID,
    {
      path: 'sprites/rts/buildings/watchtower.png',
      footprint: { w: 2, h: 2 },
      displayHeightTiles: 3.45,
      anchor: 'bottom-center',
      kind: 'generated',
    },
  ],
  [
    CONVERTER_BUILDING_TYPE_ID,
    {
      path: 'sprites/rts/buildings/converter.png',
      footprint: { w: 3, h: 3 },
      displayHeightTiles: 3.35,
      anchor: 'bottom-center',
      kind: 'generated',
    },
  ],
  [
    SYNTHESIZER_BUILDING_TYPE_ID,
    {
      path: 'sprites/rts/buildings/synthesizer.png',
      footprint: { w: 4, h: 4 },
      displayHeightTiles: 4.2,
      anchor: 'bottom-center',
      kind: 'generated',
    },
  ],
]);

export const BUILDING_SPRITE_PATHS: ReadonlyMap<BuildingTypeId, string> = new Map(
  Array.from(BUILDING_SPRITE_SPECS, ([typeId, spec]) => [typeId, spec.path]),
);

export const RESOURCE_SPRITE_SPECS: ReadonlyMap<ResourceTypeValue, SpriteAssetSpec> = new Map([
  [ResourceType.Regolith, resourceSpec('regolith')],
  [ResourceType.Hydrogen, resourceSpec('hydrogen')],
  [ResourceType.Oxygen, resourceSpec('oxygen')],
  [ResourceType.IronOxide, resourceSpec('iron_oxide')],
  [ResourceType.AluminumOxide, resourceSpec('aluminum_oxide')],
  [ResourceType.SiliconDioxide, resourceSpec('silicon_dioxide')],
  [ResourceType.NitrogenGas, resourceSpec('nitrogen_gas')],
  [ResourceType.Water, resourceSpec('water')],
  [ResourceType.Methane, resourceSpec('methane')],
  [ResourceType.CarbonDioxide, resourceSpec('carbon_dioxide')],
  [ResourceType.Ammonia, resourceSpec('ammonia')],
  [ResourceType.CeramicPlates, resourceSpec('ceramic_plates')],
]);

export const RESOURCE_SPRITE_PATHS: ReadonlyMap<ResourceTypeValue, string> = new Map(
  Array.from(RESOURCE_SPRITE_SPECS, ([type, spec]) => [type, spec.path]),
);

export const TERRAIN_DECAL_SPECS = {
  crater: terrainSpec('crater'),
  regolithScatter: terrainSpec('regolith_scatter'),
  rockSeam: terrainSpec('rock_seam'),
  depositOverlay: terrainSpec('deposit_overlay'),
} as const;

export function getBuildingSpriteSpec(typeId: BuildingTypeId): SpriteAssetSpec | null {
  return BUILDING_SPRITE_SPECS.get(typeId) ?? null;
}

export function hasBuildingSpriteStrategy(typeId: BuildingTypeId): boolean {
  return BUILDING_SPRITE_SPECS.has(typeId) || typeId.startsWith('placeholder_');
}

export function getResourceSpriteSpec(type: ResourceTypeValue): SpriteAssetSpec | null {
  return RESOURCE_SPRITE_SPECS.get(type) ?? null;
}

function resourceSpec(name: string): SpriteAssetSpec {
  return {
    path: `sprites/rts/resources/${name}.png`,
    footprint: { w: 1, h: 1 },
    displayHeightTiles: 1,
    anchor: 'center',
    kind: 'generated',
  };
}

function terrainSpec(name: string): SpriteAssetSpec {
  return {
    path: `sprites/rts/terrain/${name}.png`,
    footprint: { w: 2, h: 1 },
    displayHeightTiles: 1,
    anchor: 'center',
    kind: 'generated',
  };
}

export function assetUrl(path: string): string {
  return `/${path}`;
}
