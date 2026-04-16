import { Assets, Texture } from 'pixi.js'
import type { ResourceId } from '@/core/grid/manager'

export interface WhitepodAssetManifest {
  version: number
  sourceSheet: string
  generatedAt: string
  resources: Array<{
    id: ResourceId
    tier: number
    nameFr: string
    tile: string
    icon: string
    card: string
  }>
  ui: Array<{
    id: string
    label: string
    kind: string
    file: string
  }>
}

export interface WhitepodAssetCatalog {
  manifest: WhitepodAssetManifest
  resourceTiles: Map<ResourceId, Texture>
  resourceIcons: Map<ResourceId, Texture>
  resourceCards: Map<ResourceId, Texture>
  ui: Map<string, Texture>
}

const MANIFEST_URL = '/assets/manifest.json'

async function loadTexture(url: string): Promise<Texture> {
  return Assets.load(url) as Promise<Texture>
}

export async function loadWhitepodAssetCatalog(): Promise<WhitepodAssetCatalog> {
  const response = await fetch(MANIFEST_URL)
  if (!response.ok) {
    throw new Error(`Failed to load asset manifest: ${response.status}`)
  }

  const manifest = (await response.json()) as WhitepodAssetManifest
  const resourceTiles = new Map<ResourceId, Texture>()
  const resourceIcons = new Map<ResourceId, Texture>()
  const resourceCards = new Map<ResourceId, Texture>()
  const ui = new Map<string, Texture>()

  await Promise.all(
    manifest.resources.flatMap(resource => [
      loadTexture(`/assets/${resource.tile}`).then(texture => resourceTiles.set(resource.id, texture)),
      loadTexture(`/assets/${resource.icon}`).then(texture => resourceIcons.set(resource.id, texture)),
      loadTexture(`/assets/${resource.card}`).then(texture => resourceCards.set(resource.id, texture)),
    ]),
  )

  await Promise.all(
    manifest.ui.map(entry => loadTexture(`/assets/${entry.file}`).then(texture => ui.set(entry.id, texture))),
  )

  return { manifest, resourceTiles, resourceIcons, resourceCards, ui }
}
