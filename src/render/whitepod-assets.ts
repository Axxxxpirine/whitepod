import type { AssetKind } from './asset-manifest'

export const WHITEPOD_ASSET_ROOT = '/assets/raw'

const RESOURCE_FALLBACKS = ['fallback_resource.png']
const STATION_FALLBACKS = ['fallback_station.png']
const CARD_FALLBACKS = ['fallback_card.png']
const ICON_FALLBACKS = ['fallback_icon.png']

const RECIPE_ALIASES: Record<string, string> = {
  assemble_rocket: 'rocket_ready',
  ammonia_synthesis: 'ammonia',
  escape_rocket: 'escape_rocket',
  fuel_injector: 'fuel_injector',
  fuel_pump: 'fuel_pump',
  fuel_tank: 'fuel_tank',
  hatch_doors: 'hatch_doors',
  heat_shield: 'heat_shield',
  life_support_gas: 'life_support_gas',
  life_support_tank: 'life_support_tank',
  launch_adapter: 'launch_adapter',
  navigation_system: 'navigation_system',
  rocket_fuel: 'rocket_fuel',
  synthetic_methane: 'synthetic_methane',
  water_recycler: 'water_recycler',
}

export function assetSrc(fileName: string): string {
  return `${WHITEPOD_ASSET_ROOT}/${fileName}`
}

export function stripLayerSuffix(placeId: string): string {
  return placeId.replace(/_(surface|bus|stock)$/, '')
}

export function stripLunarPrefix(resourceId: string): string {
  return resourceId.replace(/^lunar_/, '')
}

export function cleanRecipeBaseId(transitionId: string): string {
  const raw = transitionId.replace(/^recipe__/, '')
  const normalized = raw
    .replace(/^(assemble|build|craft|make|produce|process|refine)_/, '')
    .replace(/_(assembly|manufacture|production|processing|refining|synthesis)$/,
      '')
  return RECIPE_ALIASES[normalized] ?? normalized
}

export function stationAssetBaseId(transitionId: string): string {
  if (transitionId.startsWith('extract__')) {
    return `extract_${stripLunarPrefix(transitionId.slice('extract__'.length))}`
  }

  if (transitionId.startsWith('convey__')) return 'convey_generic'
  if (transitionId.startsWith('store__')) return 'store_generic'
  if (transitionId.startsWith('recipe__')) return `recipe_${cleanRecipeBaseId(transitionId)}`
  return transitionId
}

export function resourceAssetBaseId(resourceId: string): string {
  return stripLunarPrefix(resourceId)
}

export function resourceCandidates(resourceId: string, kind: AssetKind): string[] {
  const baseId = resourceAssetBaseId(resourceId)

  if (kind === 'tile') {
    return [
      `terrain_deposit_${baseId}.png`,
      `resource_tier0_${baseId}.png`,
      `resource_tier1_${baseId}.png`,
      `resource_tier2_${baseId}.png`,
      `resource_tier3_${baseId}.png`,
      ...RESOURCE_FALLBACKS,
    ]
  }

  if (kind === 'card') {
    return [
      `resource_tier3_${baseId}.png`,
      `resource_tier2_${baseId}.png`,
      `resource_tier1_${baseId}.png`,
      `resource_tier0_${baseId}.png`,
      ...CARD_FALLBACKS,
    ]
  }

  return [
    `resource_tier3_${baseId}.png`,
    `resource_tier2_${baseId}.png`,
    `resource_tier1_${baseId}.png`,
    `resource_tier0_${baseId}.png`,
    ...ICON_FALLBACKS,
  ]
}

export function stationCandidates(transitionId: string, kind: AssetKind): string[] {
  const baseId = stationAssetBaseId(transitionId)

  if (transitionId.startsWith('extract__')) {
    return [`station_${baseId}.png`, ...STATION_FALLBACKS]
  }

  if (transitionId.startsWith('convey__')) {
    return ['station_convey_generic.png', ...STATION_FALLBACKS]
  }

  if (transitionId.startsWith('store__')) {
    return ['station_store_generic.png', ...STATION_FALLBACKS]
  }

  if (transitionId.startsWith('recipe__')) {
    const recipeId = baseId.replace(/^recipe_/, '')
    return [
      `station_recipe_${recipeId}.png`,
      'station_recipe_windows.png',
      'station_recipe_crew_module.png',
      'station_recipe_cargo_container.png',
      ...STATION_FALLBACKS,
    ]
  }

  return [`${baseId}_${kind}.png`, ...STATION_FALLBACKS]
}

export function uiIconCandidates(name: string): string[] {
  return [`ui_icon_${name}.png`, 'ui_icon_info.png', 'ui_icon_settings.png', ...ICON_FALLBACKS]
}

export function terrainCandidates(name: string): string[] {
  return [`terrain_${name}.png`, 'fallback_resource.png']
}
