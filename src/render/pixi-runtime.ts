import { Application, Container, Text } from 'pixi.js'
import type { PixiExport } from '@/core/types'
import { GRID_CELL_SIZE, GRID_HEIGHT, GRID_WIDTH } from '@/core/grid/config'
import type { AssetManifest } from './asset-manifest'
import { TextureRepository } from './texture-repository'

export class PixiRuntime {
  private app: Application | null = null
  private root: Container | null = null
  private overlayLayer: Container | null = null
  private textureRepository = new TextureRepository()
  private mountedNode: HTMLElement | null = null

  async init(manifest: AssetManifest): Promise<void> {
    await this.textureRepository.preload(manifest.assets)
    this.app = new Application()
    await this.app.init({
      width: GRID_WIDTH * GRID_CELL_SIZE,
      height: GRID_HEIGHT * GRID_CELL_SIZE,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      background: 0x1a1a2e,
    })
    this.root = new Container()
    this.overlayLayer = new Container()
    this.root.addChild(this.overlayLayer)
    this.app.stage.addChild(this.root)
    if (this.mountedNode) this.mount(this.mountedNode)
  }

  mount(node: HTMLElement): void {
    this.mountedNode = node
    if (this.app?.canvas) node.replaceChildren(this.app.canvas)
  }

  resize(width: number, height: number): void {
    this.app?.renderer.resize(width, height)
  }

  update(exportData: PixiExport): void {
    if (!this.app || !this.overlayLayer) return
    this.overlayLayer.removeChildren()
    this.renderTokens(exportData.layerTokens)
  }

  private renderTokens(layerTokens: PixiExport['layerTokens']): void {
    if (!this.overlayLayer) return
    const text = new Text({ text: `surface:${Object.keys(layerTokens.surface).length} bus:${Object.keys(layerTokens.bus).length} stock:${Object.keys(layerTokens.stock).length}`, style: { fill: 0xffffff, fontSize: 12 } })
    text.x = 8
    text.y = 8
    this.overlayLayer.addChild(text)
  }

  destroy(): void {
    this.root?.destroy({ children: true })
    this.app?.destroy(true)
    this.root = null
    this.overlayLayer = null
    this.app = null
  }
}

export { PixiRuntime as PixiRenderer }
