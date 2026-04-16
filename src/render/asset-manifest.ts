export type AssetKind = 'tile' | 'icon' | 'card' | 'fallback'
export type AssetFamily = 'resource' | 'station' | 'fallback'

export interface AssetManifestEntry {
  id: string
  kind: AssetKind
  family: AssetFamily
  baseId: string
  src: string
  frameWidth: number
  frameHeight: number
  columns: number
  rows: number
  animation: 'loop' | 'static'
  fallbackId: string
  schemaVersion: number
}

export interface AssetManifest {
  schemaVersion: number
  provider: string
  concurrency: number
  assetCount: number
  assets: AssetManifestEntry[]
}
