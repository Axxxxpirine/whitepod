import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
} from '../data/buildingCatalog';
import { ResourceType, type BuildingTypeId } from '../types';

/**
 * Shared mapping of building type IDs to their sprite asset paths.
 * Used by both the PixiJS renderer (TileSprite) and the React HUD (toolbar).
 * Adding a sprite here propagates to both automatically.
 */
export const BUILDING_SPRITE_PATHS: ReadonlyMap<BuildingTypeId, string> = new Map([
  [EXTRACTOR_BUILDING_TYPE_ID, 'sprites/extractor.svg'],
  [STORAGE_BUILDING_TYPE_ID, 'sprites/warehouse.svg'],
  [SOLAR_PANEL_BUILDING_TYPE_ID, 'sprites/solar_panel.svg'],
  [BATTERY_BASIC_BUILDING_TYPE_ID, 'sprites/battery.svg'],
  [WATCHTOWER_BUILDING_TYPE_ID, 'sprites/watchtower.svg'],
]);

export const RESOURCE_SPRITE_PATHS: ReadonlyMap<ResourceType, string> = new Map([
  [ResourceType.Coal, 'sprites/coal.png'],
  [ResourceType.IronOre, 'sprites/iron-ore.png'],
  [ResourceType.CopperOre, 'sprites/copper-ore.png'],
]);

export function assetUrl(path: string): string {
  return `/${path}`;
}
