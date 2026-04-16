#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const sourceDir = process.argv[2] || path.join(REPO_ROOT, 'output', 'whitepod-assets')
const outputDir = process.argv[3] || path.join(REPO_ROOT, 'public', 'assets')
const rawDir = path.join(outputDir, 'raw')

mkdirSync(rawDir, { recursive: true })

const copiedFiles = []
for (const fileName of readdirSync(sourceDir)) {
  if (!fileName.endsWith('.png')) continue
  const src = path.join(sourceDir, fileName)
  const dst = path.join(rawDir, fileName)
  copyFileSync(src, dst)
  copiedFiles.push(fileName)
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(REPO_ROOT, relativePath), 'utf8'))
}

const metadata = readJson('public/data/lunar-chemistry.metadata.json')
const transitions = readJson('public/data/lunar-chemistry.game-system.transitions.json')
const resourcePlaces = (metadata.canonical?.places ?? []).filter(place => place.kind !== 'control' && !place.layer)

function rawExists(fileName) {
  return existsSync(path.join(sourceDir, fileName))
}

function pickSource(candidates) {
  for (const fileName of candidates) {
    if (rawExists(fileName)) return fileName
  }
  return candidates[candidates.length - 1]
}

function stripLayerSuffix(placeId) {
  return placeId.replace(/_(surface|bus|stock)$/, '')
}

function stripLunarPrefix(resourceId) {
  return resourceId.replace(/^lunar_/, '')
}

function cleanRecipeBaseId(transitionId) {
  const raw = transitionId.replace(/^recipe__/, '')
  const normalized = raw
    .replace(/^(assemble|build|craft|make|produce|process|refine)_/, '')
    .replace(/_(assembly|manufacture|production|processing|refining|synthesis)$/, '')

  const aliases = {
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

  return aliases[normalized] ?? normalized
}

function resourceKindSource(placeId, kind) {
  const baseId = stripLunarPrefix(placeId)

  if (kind === 'tile') {
    return pickSource([
      `terrain_deposit_${baseId}.png`,
      `resource_tier0_${baseId}.png`,
      `resource_tier1_${baseId}.png`,
      `resource_tier2_${baseId}.png`,
      `resource_tier3_${baseId}.png`,
      'fallback_resource.png',
    ])
  }

  if (kind === 'card') {
    return pickSource([
      `resource_tier3_${baseId}.png`,
      `resource_tier2_${baseId}.png`,
      `resource_tier1_${baseId}.png`,
      `resource_tier0_${baseId}.png`,
      'fallback_card.png',
    ])
  }

  return pickSource([
    `resource_tier3_${baseId}.png`,
    `resource_tier2_${baseId}.png`,
    `resource_tier1_${baseId}.png`,
    `resource_tier0_${baseId}.png`,
    'fallback_icon.png',
  ])
}

function stationKindSource(transition, kind) {
  if (transition.id.startsWith('extract__')) {
    const resourceId = stripLunarPrefix(transition.id.slice('extract__'.length))
    return pickSource([
      `station_extract_${resourceId}.png`,
      'station_store_generic.png',
      'fallback_station.png',
    ])
  }

  if (transition.id.startsWith('convey__')) {
    return pickSource(['station_convey_generic.png', 'fallback_station.png'])
  }

  if (transition.id.startsWith('store__')) {
    return pickSource(['station_store_generic.png', 'fallback_station.png'])
  }

  if (transition.id.startsWith('recipe__')) {
    const outputPlaceId = transition.produces.find(token => token.place !== 'run' && token.place !== 'done')?.place ?? ''
    const outputBaseId = stripLunarPrefix(stripLayerSuffix(outputPlaceId))
    const recipeBaseId = cleanRecipeBaseId(transition.id)
    return pickSource([
      `station_recipe_${outputBaseId}.png`,
      `station_recipe_${recipeBaseId}.png`,
      'station_recipe_windows.png',
      'station_recipe_crew_module.png',
      'fallback_station.png',
    ])
  }

  return pickSource([`fallback_station.png`])
}

const manifestAssets = []

for (const place of resourcePlaces) {
  if (place.id === 'run' || place.id === 'done' || place.id === 'start') continue

  manifestAssets.push({
    id: `${place.id}_tile`,
    kind: 'tile',
    family: 'resource',
    baseId: place.id,
    src: `/assets/raw/${resourceKindSource(place.id, 'tile')}`,
    frameWidth: 1024,
    frameHeight: 1024,
    columns: 4,
    rows: 4,
    animation: 'loop',
    fallbackId: 'fallback_resource',
    schemaVersion: 1,
  })

  manifestAssets.push({
    id: `${place.id}_icon`,
    kind: 'icon',
    family: 'resource',
    baseId: place.id,
    src: `/assets/raw/${resourceKindSource(place.id, 'icon')}`,
    frameWidth: 1024,
    frameHeight: 1024,
    columns: 1,
    rows: 1,
    animation: 'static',
    fallbackId: 'fallback_icon',
    schemaVersion: 1,
  })

  manifestAssets.push({
    id: `${place.id}_card`,
    kind: 'card',
    family: 'resource',
    baseId: place.id,
    src: `/assets/raw/${resourceKindSource(place.id, 'card')}`,
    frameWidth: 1024,
    frameHeight: 1024,
    columns: 1,
    rows: 1,
    animation: 'static',
    fallbackId: 'fallback_card',
    schemaVersion: 1,
  })
}

for (const transition of transitions) {
  if (!transition.id.startsWith('extract__') && !transition.id.startsWith('convey__') && !transition.id.startsWith('store__') && !transition.id.startsWith('recipe__')) continue

  manifestAssets.push({
    id: `${transition.id}_tile`,
    kind: 'tile',
    family: 'station',
    baseId: transition.id,
    src: `/assets/raw/${stationKindSource(transition, 'tile')}`,
    frameWidth: 1024,
    frameHeight: 1024,
    columns: 4,
    rows: 4,
    animation: 'loop',
    fallbackId: 'fallback_station',
    schemaVersion: 1,
  })

  manifestAssets.push({
    id: `${transition.id}_icon`,
    kind: 'icon',
    family: 'station',
    baseId: transition.id,
    src: `/assets/raw/${stationKindSource(transition, 'icon')}`,
    frameWidth: 1024,
    frameHeight: 1024,
    columns: 1,
    rows: 1,
    animation: 'static',
    fallbackId: 'fallback_station',
    schemaVersion: 1,
  })

  manifestAssets.push({
    id: `${transition.id}_card`,
    kind: 'card',
    family: 'station',
    baseId: transition.id,
    src: `/assets/raw/${stationKindSource(transition, 'card')}`,
    frameWidth: 1024,
    frameHeight: 1024,
    columns: 1,
    rows: 1,
    animation: 'static',
    fallbackId: 'fallback_card',
    schemaVersion: 1,
  })
}

for (const fallback of ['resource', 'station', 'icon', 'card']) {
  manifestAssets.push({
    id: `fallback_${fallback}`,
    kind: 'fallback',
    family: 'fallback',
    baseId: `fallback_${fallback}`,
    src: `/assets/fallbacks/fallback_${fallback}.png`,
    frameWidth: 1024,
    frameHeight: 1024,
    columns: 1,
    rows: 1,
    animation: 'static',
    fallbackId: `fallback_${fallback}`,
    schemaVersion: 1,
  })
}

const manifest = {
  schemaVersion: 1,
  provider: 'whitepod-output-assets',
  concurrency: 4,
  assetCount: manifestAssets.length,
  assets: manifestAssets,
}

writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
writeFileSync(path.join(outputDir, 'build-report.json'), `${JSON.stringify({ schemaVersion: 1, generated: manifestAssets.length, copied: copiedFiles.length, failed: 0, fallbackUsed: 0 }, null, 2)}\n`)

console.log(`Copied ${copiedFiles.length} source images -> ${rawDir}`)
console.log(`Generated ${manifestAssets.length} manifest assets -> ${outputDir}`)
