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

      const state = useGameStore.getState()
      const interval = state.demoModeEnabled ? 2200 : 1000

      if (timestamp - this.lastTick >= interval) {
        if (state.mode === 'player' || state.autoTickEnabled || state.demoModeEnabled) state.tick()
        this.lastTick = timestamp

        // keep the renderer in sync without React subscriptions
        state.getPixiExport()
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
}
