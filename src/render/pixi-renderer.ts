import { Application, Container, Graphics, Text } from 'pixi.js'
import type { PixiExport, GamePhase } from '@/core/types'
import type { ResourceId } from '@/core/grid/manager'

interface PixiRendererConfig {
  cellSize: number
  cellsPerSide: number
  backgroundColors: Record<GamePhase, number>
  depositColors: Record<ResourceId, number>
}

const DEFAULT_CONFIG: PixiRendererConfig = {
  cellSize: 10,
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
  
  private cellLayer: Graphics | null = null
  private tokenLayer: Graphics | null = null
  
  private lastExportData: PixiExport | null = null
  private lastCellsHash: string | null = null

  constructor(config?: Partial<PixiRendererConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    void this.initApplication()
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

    const container = document.getElementById('pixi-canvas')
    if (container) {
      container.appendChild(this.app.canvas)
    }

    this.createLayers()
  }

  private createLayers(): void {
    if (!this.app) return

    this.container = new Container()
    this.app.stage.addChild(this.container)

    this.cellLayer = new Graphics()
    this.tokenLayer = new Graphics()

    this.container.addChild(this.cellLayer)
    this.container.addChild(this.tokenLayer)
  }

  public update(exportData: PixiExport): void {
    if (this.isSameGrid(exportData)) {
      return
    }

    this.lastExportData = exportData
    this.lastCellsHash = this.computeCellsHash(exportData.grid.cells)

    if (!this.cellLayer || !this.tokenLayer) return

    this.cellLayer.clear()
    this.tokenLayer.clear()

    this.updatePhase()

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

  private renderCells(cells: PixiExport['grid']['cells']): void {
    if (!this.cellLayer) return

    const { cellSize } = this.config
    for (const cell of cells) {
      const x = cell.x * cellSize
      const y = cell.y * cellSize

      if (cell.kind === 'deposit' && cell.resourceId) {
        const color = this.config.depositColors[cell.resourceId]
        this.cellLayer.circle(x + cellSize / 2, y + cellSize / 2, cellSize * 0.35).fill(color)
        continue
      }

      if (cell.kind === 'station') {
        this.cellLayer.rect(x, y, cellSize, cellSize).fill(0x666666).stroke({ width: 1, color: 0x00ff00 })
      }
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
