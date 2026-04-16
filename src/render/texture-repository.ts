import { Assets, Texture } from 'pixi.js'
import type { AssetManifestEntry } from './asset-manifest'

export class TextureRepository {
  private textures = new Map<string, Texture>()
  private fallbackTextures = new Map<string, Texture>()

  async preload(entries: readonly AssetManifestEntry[]): Promise<void> {
    await Promise.all(entries.map(async entry => {
      try {
        const texture = await Assets.load(entry.src)
        this.textures.set(entry.id, texture)
        if (entry.id.startsWith('fallback_')) this.fallbackTextures.set(entry.id, texture)
      } catch {
        // ignore, fallback handled at get() time
      }
    }))
  }

  get(id: string): Texture | null {
    return this.textures.get(id) ?? null
  }

  getByBaseId(baseId: string, kind: 'tile' | 'icon' | 'card'): Texture | null {
    const texture = this.get(`${baseId}_${kind}`)
    if (texture) return texture

    const stationFallback = this.fallbackTextures.get('fallback_station') ?? null
    const resourceFallback = this.fallbackTextures.get('fallback_resource') ?? null
    const kindFallback = kind === 'icon'
      ? this.fallbackTextures.get('fallback_icon') ?? null
      : kind === 'card'
        ? this.fallbackTextures.get('fallback_card') ?? null
        : resourceFallback

    return this.isStationId(baseId) ? stationFallback ?? kindFallback ?? resourceFallback : kindFallback ?? resourceFallback ?? stationFallback
  }

  private isStationId(baseId: string): boolean {
    return baseId.startsWith('extract__') || baseId.startsWith('convey__') || baseId.startsWith('recipe__') || baseId.startsWith('store__')
  }
}
