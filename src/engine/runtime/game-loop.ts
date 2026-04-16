import { useGameStore } from '@/store/game-store'

export class GameLoop {
  private running = false
  private lastTick = 0
  private accumulator = 0
  private rafId: number | null = null

  start(): void {
    if (this.running) return
    this.running = true

    const loop = (timestamp: number) => {
      if (!this.running) return

      const state = useGameStore.getState()
      const active = state.autoTickEnabled || state.demoModeEnabled
      const interval = (state.demoModeEnabled ? 2200 : 1000) / state.simulationSpeed

      if (!active) {
        this.lastTick = timestamp
        this.accumulator = 0
        this.rafId = requestAnimationFrame(loop)
        return
      }

      if (this.lastTick === 0) this.lastTick = timestamp

      const elapsed = timestamp - this.lastTick
      this.lastTick = timestamp
      this.accumulator = Math.min(this.accumulator + elapsed, 1000)

      while (this.accumulator >= interval) {
        const currentState = useGameStore.getState()
        if (!(currentState.autoTickEnabled || currentState.demoModeEnabled)) {
          this.accumulator = 0
          break
        }

        currentState.tick()
        this.accumulator -= interval
      }

      // keep the renderer in sync without React subscriptions
      useGameStore.getState().getPixiExport()

      this.rafId = requestAnimationFrame(loop)
    }

    this.rafId = requestAnimationFrame(loop)
  }

  stop(): void {
    this.running = false
    this.accumulator = 0
    this.lastTick = 0
    if (this.rafId !== null) cancelAnimationFrame(this.rafId)
    this.rafId = null
  }
}
