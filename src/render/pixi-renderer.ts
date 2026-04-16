import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js'
import type { PixiExport, GamePhase } from '@/core/types'
import type { ResourceId } from '@/core/grid/manager'
import { loadWhitepodAssetCatalog, type WhitepodAssetCatalog } from '@/assets/whitepod-assets'

interface PixiRendererConfig {
  cellSize: number
  cellsPerSide: number
  backgroundColors: Record<GamePhase, number>
  depositColors: Record<ResourceId, number>
}

type StationCategory = 'extractor' | 'conveyor' | 'factory' | 'storage'

const DEFAULT_CONFIG: PixiRendererConfig = {
  cellSize: 12,
  cellsPerSide: 128,
  backgroundColors: {
    init: 0x2d1b69,
    running: 0x1a1a2e,
    done: 0x691b1b,
    terminated: 0x1a1a1a,
  },
  depositColors: {
    lunar_helium3: 0x00ffff,
    lunar_hydrogen: 0x0066ff,
    lunar_oxygen: 0xff4444,
    lunar_regolith: 0x8b4513,
  },
}

export class PixiRenderer {
  private app: Application | null = null
  private config: PixiRendererConfig
  private container: Container | null = null
  private mountNode: HTMLElement | null = null

  private gridLayer: Graphics | null = null
  private cellLayer: Container | null = null
  private tokenLayer: Container | null = null

  private assets: WhitepodAssetCatalog | null = null
  private assetsReady: Promise<void>
  private pendingExport: PixiExport | null = null

  private lastExportData: PixiExport | null = null
  private lastCellsHash: string | null = null

  constructor(config?: Partial<PixiRendererConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.assetsReady = this.initAssets()
    void this.initApplication()
  }

  public attachTo(node: HTMLElement | null): void {
    this.mountNode = node

    if (this.app?.renderer && node && this.app.canvas.parentElement !== node) {
      node.replaceChildren(this.app.canvas)
    }
  }

  private async initApplication(): Promise<void> {
    const { cellSize, cellsPerSide } = this.config
    
    this.app = new Application()
    
    await this.app.init({
      width: cellsPerSide * cellSize,
      height: cellsPerSide * cellSize,
      backgroundColor: this.config.backgroundColors.running,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    if (this.mountNode) {
      this.mountNode.replaceChildren(this.app.canvas)
    }

    this.createLayers()

    await this.assetsReady

    if (this.pendingExport) {
      this.renderExport(this.pendingExport)
      this.pendingExport = null
    }
  }

  private async initAssets(): Promise<void> {
    try {
      this.assets = await loadWhitepodAssetCatalog()
    } catch {
      this.assets = null
    }
  }

  private createLayers(): void {
    if (!this.app) return

    this.container = new Container()
    this.app.stage.addChild(this.container)

    this.gridLayer = new Graphics()
    this.cellLayer = new Container()
    this.tokenLayer = new Container()

    this.container.addChild(this.gridLayer)
    this.container.addChild(this.cellLayer)
    this.container.addChild(this.tokenLayer)
  }

  public update(exportData: PixiExport): void {
    if (this.isSameGrid(exportData)) {
      return
    }

    if (!this.cellLayer || !this.tokenLayer || !this.gridLayer) {
      this.pendingExport = exportData
      return
    }

    this.renderExport(exportData)
  }

  private renderExport(exportData: PixiExport): void {
    if (!this.cellLayer || !this.tokenLayer || !this.gridLayer) return

    this.lastExportData = exportData
    this.lastCellsHash = this.computeCellsHash(exportData.grid.cells)

    const clearChildren = (container: Container) => {
      const maybeRemoveChildren = container as Container & {
        removeChildren?: () => unknown[]
        children?: unknown[]
      }

      if (typeof maybeRemoveChildren.removeChildren === 'function') {
        const removed = maybeRemoveChildren.removeChildren()
        for (const child of removed ?? []) {
          const maybeDestroy = child as { destroy?: () => void }
          maybeDestroy.destroy?.()
        }
        return
      }

      if (Array.isArray(maybeRemoveChildren.children)) {
        maybeRemoveChildren.children.length = 0
      }
    }

    this.gridLayer.clear()
    clearChildren(this.cellLayer)
    clearChildren(this.tokenLayer)

    this.updatePhase()
    this.renderGrid(exportData.grid.width, exportData.grid.height)
    this.renderCells(exportData.grid.cells)

    if (exportData.layerTokens) {
      this.renderTokens(exportData.layerTokens)
    }
  }

  private computeCellsHash(cells: PixiExport['grid']['cells']): string {
    let hash = 0
    for (const cell of cells) {
      const str = `${cell.x},${cell.y},${cell.kind},${cell.id}`
      for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i)
        hash = hash & hash
      }
    }
    return String(hash)
  }

  private isSameGrid(exportData: PixiExport): boolean {
    if (!this.lastExportData) return false
    if (exportData.timestamp === this.lastExportData.timestamp) return true

    const currentHash = this.computeCellsHash(exportData.grid.cells)
    return currentHash === this.lastCellsHash
  }

  private updatePhase(): void {
    // Background color update handled by container
  }

  private getResourceTextures(resourceId: ResourceId): { tile?: Texture; icon?: Texture; card?: Texture } {
    if (!this.assets) return {}
    return {
      tile: this.assets.resourceTiles.get(resourceId),
      icon: this.assets.resourceIcons.get(resourceId),
      card: this.assets.resourceCards.get(resourceId),
    }
  }

  private getStationCategory(transitionId: string): StationCategory {
    if (transitionId.startsWith('extract__')) return 'extractor'
    if (transitionId.startsWith('convey__')) return 'conveyor'
    if (transitionId.startsWith('store__')) return 'storage'
    return 'factory'
  }

  private renderCells(cells: PixiExport['grid']['cells']): void {
    if (!this.cellLayer) return

    const { cellSize } = this.config
    for (const cell of cells) {
      const x = cell.x * cellSize
      const y = cell.y * cellSize

      if (cell.kind === 'deposit' && cell.resourceId) {
        const textures = this.getResourceTextures(cell.resourceId)
        const sprite = new Sprite(textures.tile ?? textures.icon ?? Texture.WHITE)
        sprite.anchor.set(0.5)
        sprite.x = x + cellSize / 2
        sprite.y = y + cellSize / 2
        sprite.width = cellSize * 2.1
        sprite.height = cellSize * 2.1
        sprite.alpha = 0.96
        this.cellLayer.addChild(sprite)
        continue
      }

      if (cell.kind === 'station') {
        const category = this.getStationCategory(cell.transitionId ?? cell.id)
        const transitionId = cell.transitionId ?? cell.id
        const resourceId = transitionId.startsWith('extract__')
          ? (transitionId.slice('extract__'.length) as ResourceId)
          : cell.resourceId

        const textures = resourceId ? this.getResourceTextures(resourceId) : {}
        const uiTexture = this.assets?.ui.get(category === 'conveyor' ? 'icon-gear' : category === 'storage' ? 'icon-pause' : category === 'factory' ? 'icon-reset' : 'icon-play')
        const sprite = new Sprite(textures.icon ?? uiTexture ?? Texture.WHITE)
        sprite.anchor.set(0.5)
        sprite.x = x + cellSize / 2
        sprite.y = y + cellSize / 2
        sprite.width = cellSize * 2.2
        sprite.height = cellSize * 2.2
        sprite.alpha = category === 'factory' ? 0.92 : 0.98
        this.cellLayer.addChild(sprite)
      }
    }
  }

  private renderGrid(width: number, height: number): void {
    if (!this.gridLayer) return

    const { cellSize } = this.config
    const graphics = this.gridLayer as Graphics & {
      rect?: (x: number, y: number, width: number, height: number) => Graphics
      fill?: (style: { color: number; alpha?: number }) => Graphics
      moveTo?: (x: number, y: number) => Graphics
      lineTo?: (x: number, y: number) => Graphics
      stroke?: (style: { width: number; color: number; alpha?: number }) => Graphics
    }

    if (typeof graphics.rect === 'function' && typeof graphics.fill === 'function') {
      graphics.rect(0, 0, width * cellSize, height * cellSize).fill({ color: 0x071018, alpha: 0.2 })
    }

    if (typeof graphics.moveTo !== 'function' || typeof graphics.lineTo !== 'function' || typeof graphics.stroke !== 'function') {
      return
    }

    for (let x = 0; x <= width; x += 16) {
      graphics.moveTo(x * cellSize, 0).lineTo(x * cellSize, height * cellSize).stroke({ width: 1, color: 0x1f2a38, alpha: 0.35 })
    }

    for (let y = 0; y <= height; y += 16) {
      graphics.moveTo(0, y * cellSize).lineTo(width * cellSize, y * cellSize).stroke({ width: 1, color: 0x1f2a38, alpha: 0.35 })
    }
  }

  private renderTokens(layerTokens: PixiExport['layerTokens']): void {
    const textStyle = {
      fontSize: 10,
      fill: 0xffffff,
      fontFamily: 'monospace',
    }

    let yOffset = 10

    const addTokens = (
      tokens: Record<string, number>,
      label: string,
      x: number
    ) => {
      if (!this.tokenLayer) return

      const labelText = new Text(label, { ...textStyle, fontSize: 12, fill: 0xffff00 })
      labelText.x = x
      labelText.y = yOffset
      this.tokenLayer.addChild(labelText)
      yOffset += 12

      for (const [place, qty] of Object.entries(tokens)) {
        if (qty === 0) continue

        const text = new Text(`${place}: ${qty}`, textStyle)
        text.x = x
        text.y = yOffset
        this.tokenLayer.addChild(text)
        yOffset += 10
      }
      yOffset += 5
    }

    addTokens(layerTokens.surface, 'SURFACE', 10)
    addTokens(layerTokens.bus, 'BUS', 10)
    addTokens(layerTokens.stock, 'STOCK', 10)
  }

  public destroy(): void {
    this.container?.destroy()
    this.app?.destroy()
  }
}
