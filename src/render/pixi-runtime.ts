import { Application, Container, Graphics, Sprite, Text } from 'pixi.js'
import type { PixiExport, PixiGridCell } from '@/core/types'
import { GRID_CELL_SIZE, GRID_HEIGHT, GRID_WIDTH } from '@/core/grid/config'
import type { AssetManifest } from './asset-manifest'
import { TextureRepository } from './texture-repository'
import { hashWorld } from './diff-engine'

export class PixiRuntime {
  private app: Application | null = null
  private root: Container | null = null
  private cellLayer: Container | null = null
  private activityLayer: Container | null = null
  private overlayLayer: Container | null = null
  private textureRepository = new TextureRepository()
  private lastHash = ''
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
    this.cellLayer = new Container()
    this.activityLayer = new Container()
    this.overlayLayer = new Container()
    this.root.addChild(this.cellLayer, this.activityLayer, this.overlayLayer)
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
    if (!this.app || !this.cellLayer || !this.activityLayer || !this.overlayLayer) return
    const nextHash = hashWorld(exportData)
    if (nextHash === this.lastHash) return
    this.lastHash = nextHash

    this.cellLayer.removeChildren()
    this.activityLayer.removeChildren()
    this.overlayLayer.removeChildren()

    this.renderCells(exportData.grid.cells)
    this.renderActivities(exportData.activities)
    this.renderTokens(exportData.layerTokens)
  }

  private renderCells(cells: PixiGridCell[]): void {
    if (!this.cellLayer) return
    for (const cell of cells) {
      const sprite = new Sprite()
      sprite.x = cell.x * GRID_CELL_SIZE
      sprite.y = cell.y * GRID_CELL_SIZE
      sprite.width = GRID_CELL_SIZE
      sprite.height = GRID_CELL_SIZE
      this.cellLayer.addChild(sprite)
    }
  }

  private renderActivities(activities: PixiExport['activities']): void {
    if (!this.activityLayer) return
    for (const activity of activities) {
      const graphic = new Graphics()
      graphic.rect(0, 0, 4, 4).fill(0xffffff)
      if (activity.x !== undefined && activity.y !== undefined) {
        graphic.x = activity.x * GRID_CELL_SIZE + GRID_CELL_SIZE / 2
        graphic.y = activity.y * GRID_CELL_SIZE + GRID_CELL_SIZE / 2
      }
      this.activityLayer.addChild(graphic)
    }
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
    this.cellLayer = null
    this.activityLayer = null
    this.overlayLayer = null
    this.app = null
  }
}

export { PixiRuntime as PixiRenderer }
