import { create } from 'zustand'
import type { GamePhase, LunarChemistryMetadata, PixiExport, Transition } from '@/core/types'
import { PetriNetEngine } from '@/core/petri-net/engine'
import { loadGameSystemTransitions, loadLunarChemistryMetadata } from '@/data/lunar-chemistry-loader'

export type GameMode = 'player' | 'debug'

export interface GameState {
  mode: GameMode
  engine: PetriNetEngine | null
  transitions: Transition[]
  metadata: LunarChemistryMetadata | null

  placedStationIds: string[]
  requestedSystemTransitionIds: string[]

  phase: GamePhase
  tokens: Record<string, number>

  loadSystem: () => Promise<void>
  setMode: (mode: GameMode) => void

  placeStation: (transitionId: string) => void
  removeStation: (transitionId: string) => void

  requestSystemTransition: (transitionId: 'init' | 'launch' | 'terminate') => void

  tick: () => PixiExport
}

const SYSTEM_TRANSITIONS = new Set(['init', 'launch', 'terminate'])

function uniqueAppend(list: string[], value: string): string[] {
  if (list.includes(value)) return list
  return [...list, value]
}

export const useGameStore = create<GameState>((set, get) => ({
  mode: 'player',
  engine: null,
  transitions: [],
  metadata: null,

  placedStationIds: [],
  requestedSystemTransitionIds: [],

  phase: 'init',
  tokens: {},

  loadSystem: async () => {
    const [transitions, metadata] = await Promise.all([
      loadGameSystemTransitions(),
      loadLunarChemistryMetadata(),
    ])

    const engine = new PetriNetEngine(transitions)
    engine.initialize()

    set({
      transitions,
      metadata,
      engine,
      phase: engine.getPhase(),
      tokens: engine.getTokensSnapshot(),
    })
  },

  setMode: mode => {
    set({ mode })
  },

  placeStation: transitionId => {
    if (SYSTEM_TRANSITIONS.has(transitionId)) return
    set(state => ({ placedStationIds: uniqueAppend(state.placedStationIds, transitionId) }))
  },

  removeStation: transitionId => {
    set(state => ({ placedStationIds: state.placedStationIds.filter(id => id !== transitionId) }))
  },

  requestSystemTransition: transitionId => {
    set(state => ({
      requestedSystemTransitionIds: uniqueAppend(state.requestedSystemTransitionIds, transitionId),
    }))
  },

  tick: () => {
    const { engine, transitions, mode, placedStationIds, requestedSystemTransitionIds } = get()
    if (!engine) throw new Error('Engine not loaded')

    const phase = engine.getPhase()

    const drainIds =
      phase === 'done' ? transitions.filter(t => t.id.startsWith('drain__')).map(t => t.id) : []

    const stationActiveIds =
      mode === 'debug'
        ? transitions
            .map(t => t.id)
            .filter(id => !SYSTEM_TRANSITIONS.has(id))
            .filter(id => !id.startsWith('drain__'))
        : placedStationIds

    const activeTransitionIds = [...new Set([...stationActiveIds, ...drainIds])]

    engine.tick({
      activeTransitionIds,
      requestedTransitionIds: requestedSystemTransitionIds,
    })

    set({
      requestedSystemTransitionIds: [],
      phase: engine.getPhase(),
      tokens: engine.getTokensSnapshot(),
    })

    return {
      timestamp: Date.now(),
      phase: engine.getPhase(),
      tokens: engine.getTokensSnapshot(),
    }
  },
}))
