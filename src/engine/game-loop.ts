import type { PixiExport } from '@/core/types'
import { useGameStore } from '@/store/game-store'

export class GameLoop {
  private running = false
  private lastTick = 0
  private rafId: number | null = null

  start(): void {
    if (this.running) return
    this.running = true

    const loop = (timestamp: number) => {
      if (!this.running) return

      if (timestamp - this.lastTick >= 1000) {
        const state = useGameStore.getState()
        const shouldAutoTick = state.mode === 'player' || state.autoTickEnabled
        if (shouldAutoTick) {
          const exportData = state.tick()
          this.dispatchToPixi(exportData)
        }
        this.lastTick = timestamp
      }

      this.rafId = requestAnimationFrame(loop)
    }

    this.rafId = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }

  private dispatchToPixi(exportData: PixiExport): void {
    if (typeof window.__whitepodOnPixiUpdate === 'function') {
      window.__whitepodOnPixiUpdate(exportData)
    }

    window.dispatchEvent(new CustomEvent('whitepod-pixi-update', { detail: exportData }))
  }
}

declare global {
  interface Window {
    __whitepodOnPixiUpdate?: (exportData: PixiExport) => void
  }
}
