import { Assets, Texture } from 'pixi.js'
import type { AssetManifestEntry } from './asset-manifest'

export class TextureRepository {
  private textures = new Map<string, Texture>()

  async preload(entries: readonly AssetManifestEntry[]): Promise<void> {
    await Promise.all(entries.map(async entry => {
      const texture = await Assets.load(entry.src)
      this.textures.set(entry.id, texture)
    }))
  }

  get(id: string): Texture | null {
    return this.textures.get(id) ?? null
  }
}
