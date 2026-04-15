import { create } from 'zustand'
import type { GamePhase, LunarChemistryMetadata, PixiExport, Transition } from '@/core/types'
import {
  GridManager,
  type DepositConfigByResourceId,
  type ResourceId,
  type StationPlacement,
} from '@/core/grid/manager'
import { PetriNetEngine } from '@/core/petri-net/engine'
import { loadGameSystemTransitions, loadLunarChemistryMetadata } from '@/data/lunar-chemistry-loader'

export type GameMode = 'player' | 'debug'

export interface GameState {
  mode: GameMode
  engine: PetriNetEngine | null
  transitions: Transition[]
  metadata: LunarChemistryMetadata | null

  grid: GridManager
  seed: number
  tickIndex: number

  stations: StationPlacement[]
  requestedSystemTransitionIds: string[]

  phase: GamePhase
  tokens: Record<string, number>

  loadSystem: () => Promise<void>
  setMode: (mode: GameMode) => void

  placeStation: (transitionId: string) => void
  removeStation: (stationId: string) => void

  requestSystemTransition: (transitionId: 'init' | 'launch' | 'terminate') => void

  countDeposits: (resourceId: ResourceId) => number

  tick: () => PixiExport
}

const SYSTEM_TRANSITIONS = new Set(['init', 'launch', 'terminate'])
const EXTRACT_PREFIX = 'extract__'

function uniqueAppend(list: string[], value: string): string[] {
  if (list.includes(value)) return list
  return [...list, value]
}

function extractResourceId(transitionId: string): ResourceId | null {
  if (!transitionId.startsWith(EXTRACT_PREFIX)) return null
  return transitionId.slice(EXTRACT_PREFIX.length) as ResourceId
}

export const useGameStore = create<GameState>((set, get) => ({
  mode: 'player',
  engine: null,
  transitions: [],
  metadata: null,

  grid: new GridManager(),
  seed: 1,
  tickIndex: 0,

  stations: [],
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

    const seed = 1
    const grid = get().grid

    const cfg = metadata.gameSystem.grid.depositConfig
    const depositConfig: Partial<DepositConfigByResourceId> = {
      lunar_helium3: cfg.lunar_helium3,
      lunar_hydrogen: cfg.lunar_hydrogen,
      lunar_oxygen: cfg.lunar_oxygen,
      lunar_regolith: cfg.lunar_regolith,
    }
    grid.initialize(seed, depositConfig)

    set({
      transitions,
      metadata,
      engine,
      seed,
      tickIndex: 0,
      stations: grid.listStations(),
      phase: engine.getPhase(),
      tokens: engine.getTokensSnapshot(),
    })
  },

  setMode: mode => {
    set({ mode })
  },

  placeStation: transitionId => {
    if (SYSTEM_TRANSITIONS.has(transitionId)) return

    const grid = get().grid
    const resourceId = extractResourceId(transitionId)

    const station = resourceId
      ? grid.placeStationNearDeposit(resourceId, transitionId)
      : grid.placeStationRandom(transitionId)

    if (!station) return

    set({ stations: grid.listStations() })
  },

  removeStation: stationId => {
    const grid = get().grid
    grid.removeStation(stationId)
    set({ stations: grid.listStations() })
  },

  requestSystemTransition: transitionId => {
    set(state => ({
      requestedSystemTransitionIds: uniqueAppend(state.requestedSystemTransitionIds, transitionId),
    }))
  },

  countDeposits: resourceId => {
    return get().grid.countAvailableUnits(resourceId)
  },

  tick: () => {
    const { engine, transitions, mode, stations, requestedSystemTransitionIds, grid, tickIndex } = get()
    if (!engine) throw new Error('Engine not loaded')

    const phase = engine.getPhase()

    const drainIds =
      phase === 'done' ? transitions.filter(t => t.id.startsWith('drain__')).map(t => t.id) : []

    const activeTransitionIds: string[] = []

    const reservedDepositIdsByTransitionId = new Map<string, string[]>()

    const reserveExtract = (transitionId: string, depositId: string) => {
      activeTransitionIds.push(transitionId)
      const list = reservedDepositIdsByTransitionId.get(transitionId)
      if (list) list.push(depositId)
      else reservedDepositIdsByTransitionId.set(transitionId, [depositId])
    }

    if (mode === 'player') {
      for (const station of stations) {
        const resourceId = extractResourceId(station.transitionId)
        if (resourceId) {
          const depositId = grid.reserveAdjacentDepositForStation(station, resourceId, tickIndex)
          if (!depositId) continue
          reserveExtract(station.transitionId, depositId)
          continue
        }

        activeTransitionIds.push(station.transitionId)
      }
    } else {
      const allIds = transitions
        .map(t => t.id)
        .filter(id => !SYSTEM_TRANSITIONS.has(id))
        .filter(id => !id.startsWith('drain__'))

      for (const id of allIds) {
        const resourceId = extractResourceId(id)
        if (!resourceId) {
          activeTransitionIds.push(id)
          continue
        }

        for (;;) {
          const depositId = grid.reserveAnyDeposit(resourceId, tickIndex)
          if (!depositId) break
          reserveExtract(id, depositId)
        }
      }
    }

    activeTransitionIds.push(...drainIds)

    const { fired } = engine.tick({
      activeTransitionIds,
      requestedTransitionIds: requestedSystemTransitionIds,
    })

    for (const transitionId of fired) {
      const resourceId = extractResourceId(transitionId)
      if (!resourceId) continue

      const deposits = reservedDepositIdsByTransitionId.get(transitionId)
      const depositId = deposits?.shift()
      if (!depositId) continue

      grid.consumeReservedDeposit(depositId)
    }

    set({
      requestedSystemTransitionIds: [],
      tickIndex: tickIndex + 1,
      phase: engine.getPhase(),
      tokens: engine.getTokensSnapshot(),
      stations: grid.listStations(),
    })

    return {
      timestamp: Date.now(),
      phase: engine.getPhase(),
      tokens: engine.getTokensSnapshot(),
    }
  },
}))
