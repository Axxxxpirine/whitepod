import { Application, Assets, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js'
import type { PixiExport } from '@/core/types'
import { GRID_CELL_SIZE, GRID_HEIGHT, GRID_WIDTH } from '@/core/grid/config'
import type { AssetManifest } from './asset-manifest'
import { TextureRepository } from './texture-repository'
import { assetSrc } from './whitepod-assets'

export class PixiRuntime {
  private app: Application | null = null
  private root: Container | null = null
  private worldLayer: Container | null = null
  private overlayLayer: Container | null = null
  private selectionLayer: Container | null = null
  private hoverLayer: Container | null = null
  private surfaceTextures: Texture[] = []
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
    this.worldLayer = new Container()
    this.overlayLayer = new Container()
    this.selectionLayer = new Container()
    this.hoverLayer = new Container()
    this.root.addChild(this.worldLayer, this.selectionLayer, this.hoverLayer, this.overlayLayer)
    this.app.stage.addChild(this.root)
    this.surfaceTextures = await Promise.all([
      Assets.load(assetSrc('terrain_lunar_surface_01.png')),
      Assets.load(assetSrc('terrain_lunar_surface_02.png')),
      Assets.load(assetSrc('terrain_lunar_surface_03.png')),
      Assets.load(assetSrc('terrain_lunar_surface_04.png')),
    ])
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
    if (!this.app || !this.worldLayer || !this.overlayLayer || !this.selectionLayer || !this.hoverLayer) return
    this.worldLayer.removeChildren()
    this.selectionLayer.removeChildren()
    this.hoverLayer.removeChildren()
    this.overlayLayer.removeChildren()
    this.renderWorld(exportData)
    this.renderSelection(exportData)
    this.renderHover(exportData)
    this.renderTokens(exportData.layerTokens)
  }

  private renderWorld(exportData: PixiExport): void {
    if (!this.worldLayer) return

    for (const cell of exportData.grid.cells) {
      const surfaceTexture = this.surfaceTextures[(cell.x + cell.y) % this.surfaceTextures.length]
      const backdrop = new Sprite(surfaceTexture)
      backdrop.x = cell.x * GRID_CELL_SIZE
      backdrop.y = cell.y * GRID_CELL_SIZE
      backdrop.width = GRID_CELL_SIZE
      backdrop.height = GRID_CELL_SIZE
      this.worldLayer.addChild(backdrop)

      const overlay = new Graphics()
      overlay.rect(0, 0, GRID_CELL_SIZE - 1, GRID_CELL_SIZE - 1).stroke({ width: 1, color: 0xffffff, alpha: 0.08 })
      overlay.x = cell.x * GRID_CELL_SIZE
      overlay.y = cell.y * GRID_CELL_SIZE
      this.worldLayer.addChild(overlay)
    }

    for (const deposit of exportData.grid.deposits) {
      const sprite = new Sprite(this.textureRepository.getByBaseId(deposit.resourceId, 'tile') ?? undefined)
      sprite.x = deposit.x * GRID_CELL_SIZE + 2
      sprite.y = deposit.y * GRID_CELL_SIZE + 2
      sprite.width = GRID_CELL_SIZE - 4
      sprite.height = GRID_CELL_SIZE - 4
      this.worldLayer.addChild(sprite)
    }

    for (const station of exportData.grid.stations) {
      const texture = this.textureRepository.getByBaseId(this.stationBaseId(station.transitionId), 'tile')
      const sprite = new Sprite(texture ?? undefined)
      sprite.x = station.x * GRID_CELL_SIZE
      sprite.y = station.y * GRID_CELL_SIZE
      sprite.width = GRID_CELL_SIZE
      sprite.height = GRID_CELL_SIZE
      this.worldLayer.addChild(sprite)
    }
  }

  private stationBaseId(transitionId: string): string {
    return transitionId
  }

  private renderTokens(layerTokens: PixiExport['layerTokens']): void {
    if (!this.overlayLayer) return
    const text = new Text({ text: `surface:${Object.keys(layerTokens.surface).length} bus:${Object.keys(layerTokens.bus).length} stock:${Object.keys(layerTokens.stock).length}`, style: { fill: 0xffffff, fontSize: 12 } })
    text.x = 8
    text.y = 8
    this.overlayLayer.addChild(text)
  }

  private renderSelection(exportData: PixiExport): void {
    if (!this.selectionLayer) return
    const selected = exportData.grid.stations[0] ?? exportData.grid.deposits[0]
    if (!selected) return
    const graphic = new Graphics()
    graphic.rect(0, 0, GRID_CELL_SIZE, GRID_CELL_SIZE).stroke({ width: 2, color: 0x36d6ff, alpha: 0.9 })
    graphic.x = selected.x * GRID_CELL_SIZE
    graphic.y = selected.y * GRID_CELL_SIZE
    this.selectionLayer.addChild(graphic)
  }

  private renderHover(exportData: PixiExport): void {
    if (!this.hoverLayer) return
    const cell = exportData.grid.cells[0]
    if (!cell) return
    const graphic = new Graphics()
    graphic.rect(0, 0, GRID_CELL_SIZE - 1, GRID_CELL_SIZE - 1).stroke({ width: 1, color: 0xf7b500, alpha: 0.7 })
    graphic.x = cell.x * GRID_CELL_SIZE
    graphic.y = cell.y * GRID_CELL_SIZE
    this.hoverLayer.addChild(graphic)
  }

  destroy(): void {
    this.root?.destroy({ children: true })
    this.app?.destroy(true)
    this.root = null
    this.worldLayer = null
    this.selectionLayer = null
    this.hoverLayer = null
    this.overlayLayer = null
    this.app = null
  }
}

export { PixiRuntime as PixiRenderer }
