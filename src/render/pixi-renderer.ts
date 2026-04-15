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
  private app: Application = null!
  private config: PixiRendererConfig
  private container: Container = null!
  
  private depositLayer: Graphics = null!
  private stationLayer: Graphics = null!
  private tokenLayer: Graphics = null!
  
  private lastExportData: PixiExport | null = null

  constructor(config?: Partial<PixiRendererConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    
    void this.initApplication()
    this.createLayers()
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
  }

  private createLayers(): void {
    this.container = new Container()
    this.app.stage.addChild(this.container)

    this.depositLayer = new Graphics()
    this.stationLayer = new Graphics()
    this.tokenLayer = new Graphics()

    this.container.addChild(this.depositLayer)
    this.container.addChild(this.stationLayer)
    this.container.addChild(this.tokenLayer)
  }

  public update(exportData: PixiExport): void {
    if (this.isSameGrid(exportData)) {
      return
    }

    this.lastExportData = exportData

    this.depositLayer.clear()
    this.stationLayer.clear()
    this.tokenLayer.clear()

    this.updatePhase(exportData.phase)

    if (exportData.grid) {
      this.renderDeposits(exportData.grid.deposits)
      this.renderStations(exportData.grid.stations)
    }

    if (exportData.layerTokens) {
      this.renderTokens(exportData.layerTokens)
    }
  }

  private isSameGrid(exportData: PixiExport): boolean {
    if (!this.lastExportData) return false
    if (exportData.timestamp === this.lastExportData.timestamp) return true
    
    if (!exportData.grid || !this.lastExportData.grid) return false
    
    const depositsEqual =
      exportData.grid.deposits.length === this.lastExportData.grid.deposits.length &&
      exportData.grid.deposits.every((d, i) => d.id === this.lastExportData!.grid.deposits[i].id)
    
    const stationsEqual =
      exportData.grid.stations.length === this.lastExportData.grid.stations.length &&
      exportData.grid.stations.every((s, i) => s.id === this.lastExportData!.grid.stations[i].id)

    return depositsEqual && stationsEqual
  }

  private updatePhase(_phase: GamePhase): void {
    // Background color update handled by container
  }

  private renderDeposits(deposits: PixiExport['grid']['deposits']): void {
    const { cellSize } = this.config
    const circleSize = cellSize * 0.7

    for (const deposit of deposits) {
      const x = deposit.x * cellSize
      const y = deposit.y * cellSize
      const centerX = x + cellSize / 2
      const centerY = y + cellSize / 2

      const color = this.config.depositColors[deposit.resourceId]

      this.depositLayer
        .circle(centerX, centerY, circleSize / 2)
        .fill(color)
        .stroke({ width: 1, color: 0xffffff })

      const capacityBarWidth = cellSize * 0.6
      const capacityBarHeight = (deposit.remaining / 5) * cellSize * 0.3
      const barX = x + cellSize * 0.2
      const barY = y + cellSize - capacityBarHeight

      this.depositLayer.rect(barX, barY, capacityBarWidth, capacityBarHeight).fill(0x00ff00)
    }
  }

  private renderStations(stations: PixiExport['grid']['stations']): void {
    const { cellSize } = this.config

    for (const station of stations) {
      const x = station.x * cellSize
      const y = station.y * cellSize

      this.stationLayer
        .rect(x, y, cellSize, cellSize)
        .fill(0x666666)
        .stroke({ width: 1, color: 0x00ff00 })
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
    this.container.destroy()
    this.app.destroy()
  }
}
