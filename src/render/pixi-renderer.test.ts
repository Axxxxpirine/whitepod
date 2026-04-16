import { describe, expect, it, vi } from 'vitest'
import type { PixiExport } from '@/core/types'
import { PixiRenderer } from './pixi-renderer'

vi.mock('pixi.js', () => {
  class MockGraphics {
    clear() { return this }
    circle() { return this }
    rect() { return this }
    fill() { return this }
    stroke() { return this }
    addChild() { return this }
  }

  class MockContainer {
    addChild() { return this }
    destroy() { return undefined }
  }

  class MockText {
    x = 0
    y = 0
    text: string
    constructor(text: string) {
      this.text = text
    }
  }

  class MockSprite {
    anchor = { set() { return undefined } }
    x = 0
    y = 0
    width = 0
    height = 0
    alpha = 1
  }

  const MockTexture = { WHITE: {} }

  class MockApplication {
    stage = new MockContainer()
    canvas = document.createElement('canvas')
    async init() { return undefined }
    destroy() { return undefined }
  }

  return {
    Application: MockApplication,
    Container: MockContainer,
    Graphics: MockGraphics,
    Sprite: MockSprite,
    Texture: MockTexture,
    Text: MockText,
  }
})

describe('PixiRenderer', () => {
  it('renders sparse grid cells from export data', async () => {
    const renderer = new PixiRenderer()
    await Promise.resolve()

    const exportData: PixiExport = {
      timestamp: 1,
      phase: 'running',
      tokens: {},
      grid: {
        width: 128,
        height: 128,
        cells: [
          { x: 1, y: 2, kind: 'deposit', id: 'deposit_1', resourceId: 'lunar_hydrogen', remaining: 3 },
          { x: 3, y: 4, kind: 'station', id: 'station_1', transitionId: 'extract__lunar_hydrogen' },
        ],
        deposits: [
          { id: 'deposit_1', x: 1, y: 2, resourceId: 'lunar_hydrogen', remaining: 3 },
        ],
        stations: [
          { id: 'station_1', x: 3, y: 4, transitionId: 'extract__lunar_hydrogen', active: true },
        ],
      },
      layerTokens: { surface: {}, bus: {}, stock: {} },
    }

    expect(() => renderer.update(exportData)).not.toThrow()
    renderer.destroy()
  })
})
