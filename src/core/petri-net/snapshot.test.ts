import { describe, expect, it } from 'vitest'
import { PetriNetEngine } from './engine'
import type { Transition } from '../types'

describe('PetriNetEngine snapshots', () => {
  it('roundtrips tokens and terminated', () => {
    const transitions: Transition[] = [
      { id: 'init', consumes: [{ place: 'start', qty: 1 }], produces: [{ place: 'run', qty: 1 }] },
      { id: 'terminate', consumes: [{ place: 'run', qty: 1 }], produces: [] },
    ]

    const engine1 = new PetriNetEngine(transitions)
    engine1.initialize()
    engine1.tick({ activeTransitionIds: [], requestedTransitionIds: ['init'] })

    const snap = engine1.getSnapshot()

    const engine2 = new PetriNetEngine(transitions)
    engine2.initialize()
    engine2.loadSnapshot(snap)

    expect(engine2.getTokensSnapshot()).toEqual(engine1.getTokensSnapshot())
    expect(engine2.getPhase()).toBe(engine1.getPhase())
  })
})
