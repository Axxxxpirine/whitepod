import { describe, expect, it } from 'vitest'
import { PetriNetEngine } from './engine'
import type { Transition } from '../types'

describe('PetriNetEngine (station-driven)', () => {
  const transitions: Transition[] = [
    { id: 'init', consumes: [{ place: 'start', qty: 1 }], produces: [{ place: 'run', qty: 1 }] },
    {
      id: 'extract__x',
      consumes: [{ place: 'run', qty: 1 }],
      produces: [
        { place: 'run', qty: 1 },
        { place: 'x_surface', qty: 1 },
      ],
    },
    {
      id: 'launch',
      consumes: [
        { place: 'run', qty: 1 },
        { place: 'x_surface', qty: 1 },
      ],
      produces: [
        { place: 'done', qty: 1 },
        { place: 'run', qty: 1 },
      ],
    },
    { id: 'drain__x_surface', consumes: [{ place: 'done', qty: 1 }, { place: 'x_surface', qty: 1 }], produces: [{ place: 'done', qty: 1 }] },
    { id: 'terminate', consumes: [{ place: 'done', qty: 1 }, { place: 'run', qty: 1 }], produces: [] },
  ]

  it('does nothing without init request', () => {
    const engine = new PetriNetEngine(transitions)
    engine.initialize()

    engine.tick({ activeTransitionIds: ['extract__x'] })

    expect(engine.getPhase()).toBe('init')
    expect(engine.getToken('run')).toBe(0)
    expect(engine.getToken('x_surface')).toBe(0)
  })

  it('fires init only when requested', () => {
    const engine = new PetriNetEngine(transitions)
    engine.initialize()

    engine.tick({ activeTransitionIds: [], requestedTransitionIds: ['init'] })

    expect(engine.getPhase()).toBe('running')
    expect(engine.getToken('run')).toBe(1)
    expect(engine.getToken('start')).toBe(0)
  })

  it('fires once per active entry (duplicates represent stations)', () => {
    const engine = new PetriNetEngine(transitions)
    engine.initialize()

    engine.tick({ activeTransitionIds: [], requestedTransitionIds: ['init'] })

    const { fired } = engine.tick({ activeTransitionIds: ['extract__x', 'extract__x'] })

    expect(fired).toEqual(['extract__x', 'extract__x'])
    expect(engine.getToken('x_surface')).toBe(2)
  })

  it('launch is manual and leads to done phase', () => {
    const engine = new PetriNetEngine(transitions)
    engine.initialize()

    engine.tick({ activeTransitionIds: [], requestedTransitionIds: ['init'] })
    engine.tick({ activeTransitionIds: ['extract__x'] })

    engine.tick({ activeTransitionIds: [], requestedTransitionIds: ['launch'] })

    expect(engine.getPhase()).toBe('done')
    expect(engine.getToken('done')).toBe(1)
  })

  it('terminate is manual and ends simulation', () => {
    const engine = new PetriNetEngine(transitions)
    engine.initialize()

    engine.tick({ activeTransitionIds: [], requestedTransitionIds: ['init'] })
    engine.tick({ activeTransitionIds: ['extract__x'] })
    engine.tick({ activeTransitionIds: [], requestedTransitionIds: ['launch'] })

    engine.tick({ activeTransitionIds: [], requestedTransitionIds: ['terminate'] })

    expect(engine.getPhase()).toBe('terminated')
  })
})
