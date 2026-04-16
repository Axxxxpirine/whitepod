import type { AssetManifest } from './asset-manifest'

export async function loadAssetManifest(): Promise<AssetManifest> {
  const response = await fetch('/assets/manifest.json')
  if (!response.ok) throw new Error(`Failed to load asset manifest: ${response.status} ${response.statusText}`)
  return response.json() as Promise<AssetManifest>
}
