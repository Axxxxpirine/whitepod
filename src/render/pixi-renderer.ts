import { Application, Container, Graphics, Text } from 'pixi.js'
import type { PixiActivity, PixiExport, GamePhase } from '@/core/types'
import { GRID_CELL_SIZE, GRID_HEIGHT, GRID_WIDTH } from '@/core/grid/config'
import type { ResourceId } from '@/core/grid/manager'

interface PixiRendererConfig {
  cellSize: number
  gridWidth: number
  gridHeight: number
  backgroundColors: Record<GamePhase, number>
  depositColors: Record<ResourceId, number>
}

type StationCategory = 'extractor' | 'conveyor' | 'factory' | 'storage'

const DEFAULT_CONFIG: PixiRendererConfig = {
  cellSize: GRID_CELL_SIZE,
  gridWidth: GRID_WIDTH,
  gridHeight: GRID_HEIGHT,
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
  
  private cellLayer: Graphics | null = null
  private activityLayer: Graphics | null = null
  private tokenLayer: Container | null = null

  constructor(config?: Partial<PixiRendererConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    void this.initApplication()
  }

  public attachTo(node: HTMLElement | null): void {
    this.mountNode = node

    if (this.app?.renderer && node && this.app.canvas.parentElement !== node) {
      node.replaceChildren(this.app.canvas)
    }
  }

  private async initApplication(): Promise<void> {
    const { cellSize, gridHeight, gridWidth } = this.config
    
    this.app = new Application()
    
    await this.app.init({
      width: gridWidth * cellSize,
      height: gridHeight * cellSize,
      backgroundColor: this.config.backgroundColors.running,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    })

    if (this.mountNode) {
      this.mountNode.replaceChildren(this.app.canvas)
    }

    this.createLayers()
  }

  private createLayers(): void {
    if (!this.app) return

    this.container = new Container()
    this.app.stage.addChild(this.container)

    this.cellLayer = new Graphics()
    this.activityLayer = new Graphics()
    this.tokenLayer = new Container()

    this.container.addChild(this.cellLayer)
    this.container.addChild(this.activityLayer)
    this.container.addChild(this.tokenLayer)
  }

  public update(exportData: PixiExport): void {
    if (!this.cellLayer || !this.activityLayer || !this.tokenLayer) return

    this.cellLayer.clear()
    this.activityLayer.clear()
    this.tokenLayer.removeChildren()

    this.updatePhase(exportData.phase)

    this.renderCells(exportData.grid.cells)
    this.renderActivities(exportData.activities)

    if (exportData.layerTokens) {
      this.renderTokens(exportData.layerTokens)
    }
  }

  private updatePhase(phase: GamePhase): void {
    if (!this.app) return
    this.app.renderer.background.color = this.config.backgroundColors[phase]
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
        const color = this.config.depositColors[cell.resourceId]
        this.cellLayer.circle(x + cellSize / 2, y + cellSize / 2, cellSize * 0.35).fill(color)
        continue
      }

      if (cell.kind === 'station') {
        const category = this.getStationCategory(cell.transitionId ?? cell.id)
        switch (category) {
          case 'extractor':
            this.cellLayer.rect(x + 1, y + 1, cellSize - 2, cellSize - 2).fill(0x7c2d12).stroke({ width: 1, color: 0xfbbf24 })
            this.cellLayer.circle(x + cellSize / 2, y + cellSize / 2, cellSize * 0.18).fill(0xfde68a)
            this.cellLayer.rect(x + cellSize * 0.18, y + cellSize * 0.38, cellSize * 0.64, cellSize * 0.24).fill(0xf59e0b)
            break
          case 'conveyor':
            this.cellLayer.rect(x + 1, y + 1, cellSize - 2, cellSize - 2).fill(0x262626).stroke({ width: 1, color: 0xf97316 })
            this.cellLayer.rect(x + 2, y + cellSize * 0.42, cellSize - 4, cellSize * 0.16).fill(0xf97316)
            this.cellLayer.rect(x + cellSize * 0.38, y + 2, cellSize * 0.16, cellSize - 4).fill(0xfee08b)
            break
          case 'storage':
            this.cellLayer.rect(x + 1, y + 1, cellSize - 2, cellSize - 2).fill(0x0f766e).stroke({ width: 1, color: 0x5eead4 })
            this.cellLayer.rect(x + 2, y + 2, cellSize - 4, cellSize * 0.28).fill(0x99f6e4)
            this.cellLayer.rect(x + 2, y + cellSize * 0.42, cellSize - 4, cellSize * 0.18).fill(0x14b8a6)
            this.cellLayer.rect(x + 2, y + cellSize * 0.68, cellSize - 4, cellSize * 0.18).fill(0x0f766e)
            break
          case 'factory':
          default:
            this.cellLayer.rect(x + 1, y + 1, cellSize - 2, cellSize - 2).fill(0x4338ca).stroke({ width: 1, color: 0xc4b5fd })
            this.cellLayer.rect(x + 2, y + 2, cellSize - 4, cellSize * 0.22).fill(0x818cf8)
            this.cellLayer.rect(x + 2, y + cellSize * 0.4, cellSize - 4, cellSize * 0.18).fill(0xa78bfa)
            this.cellLayer.rect(x + 2, y + cellSize * 0.66, cellSize - 4, cellSize * 0.18).fill(0x8b5cf6)
            break
        }
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

  private renderActivities(activities: readonly PixiActivity[]): void {
    if (!this.activityLayer) return

    const { cellSize, gridHeight, gridWidth } = this.config

    for (const activity of activities) {
      if (activity.kind === 'launch') {
        this.activityLayer
          .rect(2, 2, gridWidth * cellSize - 4, gridHeight * cellSize - 4)
          .stroke({ width: 4, color: 0xfde047 })
        continue
      }

      if (activity.x === undefined || activity.y === undefined) continue

      const x = activity.x * cellSize
      const y = activity.y * cellSize

      switch (activity.kind) {
        case 'spawn':
          this.activityLayer.circle(x + cellSize / 2, y + cellSize / 2, cellSize * 0.46).stroke({ width: 2, color: 0xf8fafc })
          break
        case 'build':
          this.activityLayer.rect(x + 2, y + 2, cellSize - 4, cellSize - 4).stroke({ width: 2, color: 0x4ade80 })
          break
        case 'extract':
          this.activityLayer.circle(x + cellSize / 2, y + cellSize / 2, cellSize * 0.3).fill(0xfacc15)
          break
        case 'convey':
          this.activityLayer.rect(x + 4, y + cellSize * 0.42, cellSize - 8, cellSize * 0.16).fill(0xfb923c)
          break
        case 'store':
          this.activityLayer.rect(x + 5, y + 5, cellSize - 10, cellSize - 10).stroke({ width: 2, color: 0x2dd4bf })
          break
        case 'recipe':
          this.activityLayer.circle(x + cellSize / 2, y + cellSize / 2, cellSize * 0.38).stroke({ width: 2, color: 0xc084fc })
          this.activityLayer.rect(x + cellSize * 0.28, y + cellSize * 0.28, cellSize * 0.44, cellSize * 0.44).fill(0x8b5cf6)
          break
      }
    }
  }

  public destroy(): void {
    this.container?.destroy()
    this.app?.destroy()
  }
}
