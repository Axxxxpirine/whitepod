import type { GamePhase, Transition, TokenRef } from '../types'

export interface PetriNetEngineSnapshot {
  tokens: Record<string, number>
  terminated: boolean
}

export interface TickInput {
  activeTransitionIds: readonly string[]
  requestedTransitionIds?: readonly string[]
}

export interface TickResult {
  fired: string[]
}

function sumQty(tokens: readonly TokenRef[], place: string): number {
  let total = 0
  for (const t of tokens) {
    if (t.place === place) total += t.qty
  }
  return total
}

export class PetriNetEngine {
  private readonly transitionsById: Map<string, Transition>
  private readonly tokens: Map<string, number>
  private terminated: boolean

  constructor(transitions: Transition[]) {
    this.transitionsById = new Map()
    for (const t of transitions) {
      if (this.transitionsById.has(t.id)) {
        throw new Error(`Duplicate transition id '${t.id}'`)
      }
      this.transitionsById.set(t.id, t)
    }

    this.tokens = new Map()
    this.terminated = false
  }

  initialize(): void {
    this.tokens.clear()
    this.tokens.set('start', 1)
    this.tokens.set('run', 0)
    this.tokens.set('done', 0)
    this.terminated = false
  }

  getPhase(): GamePhase {
    if (this.terminated) return 'terminated'

    const done = this.getToken('done')
    if (done > 0) return 'done'

    const run = this.getToken('run')
    if (run > 0) return 'running'

    return 'init'
  }

  getToken(placeId: string): number {
    return this.tokens.get(placeId) ?? 0
  }

  getTokensSnapshot(): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [place, qty] of this.tokens) {
      if (qty !== 0) out[place] = qty
    }
    return out
  }

  getSnapshot(): PetriNetEngineSnapshot {
    return {
      tokens: this.getTokensSnapshot(),
      terminated: this.terminated,
    }
  }

  loadSnapshot(snapshot: PetriNetEngineSnapshot): void {
    this.tokens.clear()
    for (const [place, qty] of Object.entries(snapshot.tokens)) {
      if (!Number.isFinite(qty) || qty === 0) continue
      this.tokens.set(place, qty)
    }
    this.terminated = snapshot.terminated
  }

  canFire(transitionId: string): boolean {
    const transition = this.transitionsById.get(transitionId)
    if (!transition) return false

    for (const input of transition.consumes) {
      if (this.getToken(input.place) < input.qty) return false
    }

    return true
  }

  fire(transitionId: string): void {
    const transition = this.transitionsById.get(transitionId)
    if (!transition) throw new Error(`Unknown transition '${transitionId}'`)
    if (!this.canFire(transitionId)) throw new Error(`Transition '${transitionId}' cannot fire`)

    for (const input of transition.consumes) {
      const current = this.getToken(input.place)
      const next = current - input.qty
      if (next === 0) this.tokens.delete(input.place)
      else this.tokens.set(input.place, next)
    }

    for (const output of transition.produces) {
      const current = this.getToken(output.place)
      const next = current + output.qty
      if (next === 0) this.tokens.delete(output.place)
      else this.tokens.set(output.place, next)
    }

    if (transitionId === 'terminate') this.terminated = true
  }

  tick(input: TickInput): TickResult {
    const fired: string[] = []

    const requested = [...new Set(input.requestedTransitionIds ?? [])]
    for (const transitionId of requested) {
      if (!this.transitionsById.has(transitionId)) continue
      if (!this.canFire(transitionId)) continue

      this.fire(transitionId)
      fired.push(transitionId)
    }

    for (const transitionId of input.activeTransitionIds) {
      // One opportunity per entry; duplicates represent multiple placed stations.
      if (!this.transitionsById.has(transitionId)) continue
      if (!this.canFire(transitionId)) continue

      this.fire(transitionId)
      fired.push(transitionId)
    }

    return { fired }
  }

  assertRunGatedStationTransition(transitionId: string): void {
    const t = this.transitionsById.get(transitionId)
    if (!t) throw new Error(`Unknown transition '${transitionId}'`)

    const runIn = sumQty(t.consumes, 'run')
    const runOut = sumQty(t.produces, 'run')
    if (runIn < 1 || runOut < 1) {
      throw new Error(`Transition '${transitionId}' is not explicitly run-gated`)
    }
  }
}
