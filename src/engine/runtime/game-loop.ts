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
        if (state.mode === 'player' || state.autoTickEnabled) state.tick()
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
}
