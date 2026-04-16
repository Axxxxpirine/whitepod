import { Assets, Texture } from 'pixi.js'
import type { AssetManifestEntry } from './asset-manifest'

export class TextureRepository {
  private textures = new Map<string, Texture>()
  private fallbackTexture: Texture | null = null

  async preload(entries: readonly AssetManifestEntry[]): Promise<void> {
    await Promise.all(entries.map(async entry => {
      try {
        const texture = await Assets.load(entry.src)
        this.textures.set(entry.id, texture)
        if (entry.id === 'fallback_icon') this.fallbackTexture = texture
      } catch {
        // ignore, fallback handled at get() time
      }
    }))
  }

  get(id: string): Texture | null {
    return this.textures.get(id) ?? this.fallbackTexture ?? null
  }
}
