import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GamePhase, LunarChemistryMetadata, PixiExport, Transition } from '@/core/types'
import {
  GridManager,
  type DepositConfigByResourceId,
  type GridSnapshot,
  type ResourceId,
  type StationPlacement,
} from '@/core/grid/manager'
import { PetriNetEngine, type PetriNetEngineSnapshot } from '@/core/petri-net/engine'
import { loadGameSystemTransitions, loadLunarChemistryMetadata } from '@/data/lunar-chemistry-loader'

export type GameMode = 'player' | 'debug'

export interface GameState {
  mode: GameMode
  engine: PetriNetEngine | null
  transitions: Transition[]
  metadata: LunarChemistryMetadata | null

  // persisted snapshots (serializable)
  engineSnapshot: PetriNetEngineSnapshot | null
  gridSnapshot: GridSnapshot | null

  grid: GridManager
  seed: number
  tickIndex: number

  stations: StationPlacement[]
  requestedSystemTransitionIds: string[]

  phase: GamePhase
  tokens: Record<string, number>

  // runtime-only (not persisted)
  autoTickEnabled: boolean
  lastFiredTransitionIds: string[]
  fireEventSeq: number

  debugStatsStartTick: number | null
  debugFiringHistory: Array<{ timestamp: number; transitionId: string }>
  debugTotalFires: Record<string, number>
  debugTokenStats: Record<string, { produced: number; consumed: number }>

  loadSystem: () => Promise<void>
  setMode: (mode: GameMode) => void
  setAutoTickEnabled: (enabled: boolean) => void
  resetSave: () => void
  newGame: (seed: number) => void

  debugFireTransition: (transitionId: string) => { ok: boolean; reason?: string }
  debugResetStats: () => void

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

function toDepositConfig(metadata: LunarChemistryMetadata): Partial<DepositConfigByResourceId> {
  const cfg = metadata.gameSystem.grid.depositConfig
  return {
    lunar_helium3: cfg.lunar_helium3,
    lunar_hydrogen: cfg.lunar_hydrogen,
    lunar_oxygen: cfg.lunar_oxygen,
    lunar_regolith: cfg.lunar_regolith,
  }
}

function updateDebugHistory(
  prev: Array<{ timestamp: number; transitionId: string }>,
  fired: readonly string[],
  timestamp: number,
): Array<{ timestamp: number; transitionId: string }> {
  if (fired.length === 0) return prev
  const next = prev.slice()
  for (const transitionId of fired) {
    next.push({ timestamp, transitionId })
  }
  return next.slice(-100)
}

function updateDebugTotalFires(prev: Record<string, number>, fired: readonly string[]): Record<string, number> {
  if (fired.length === 0) return prev
  const next = { ...prev }
  for (const transitionId of fired) {
    next[transitionId] = (next[transitionId] ?? 0) + 1
  }
  return next
}

function updateDebugTokenStats(
  prev: Record<string, { produced: number; consumed: number }>,
  fired: readonly string[],
  transitionsById: ReadonlyMap<string, Transition>,
): Record<string, { produced: number; consumed: number }> {
  if (fired.length === 0) return prev

  const next: Record<string, { produced: number; consumed: number }> = { ...prev }

  for (const transitionId of fired) {
    const t = transitionsById.get(transitionId)
    if (!t) continue

    for (const input of t.consumes) {
      const entry = next[input.place] ?? { produced: 0, consumed: 0 }
      next[input.place] = { ...entry, consumed: entry.consumed + input.qty }
    }

    for (const output of t.produces) {
      const entry = next[output.place] ?? { produced: 0, consumed: 0 }
      next[output.place] = { ...entry, produced: entry.produced + output.qty }
    }
  }

  return next
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      mode: 'player',
      engine: null,
      transitions: [],
      metadata: null,

      engineSnapshot: null,
      gridSnapshot: null,

      grid: new GridManager(),
      seed: 1,
      tickIndex: 0,

      stations: [],
      requestedSystemTransitionIds: [],

      phase: 'init',
      tokens: {},

      autoTickEnabled: true,
      lastFiredTransitionIds: [],
      fireEventSeq: 0,

      debugStatsStartTick: null,
      debugFiringHistory: [],
      debugTotalFires: {},
      debugTokenStats: {},

      loadSystem: async () => {
        const [transitions, metadata] = await Promise.all([
          loadGameSystemTransitions(),
          loadLunarChemistryMetadata(),
        ])

        const engine = new PetriNetEngine(transitions)
        const grid = get().grid
        const mode = get().mode

        grid.initialize(get().seed, toDepositConfig(metadata))

        const engineSnapshot = get().engineSnapshot
        const gridSnapshot = get().gridSnapshot

        if (gridSnapshot) {
          grid.loadSnapshot(gridSnapshot)
        }

        if (engineSnapshot) {
          engine.loadSnapshot(engineSnapshot)
        } else {
          engine.initialize()
        }

        set(state => ({
          transitions,
          metadata,
          engine,
          autoTickEnabled: mode === 'player',
          engineSnapshot: engine.getSnapshot(),
          gridSnapshot: grid.getSnapshot(),
          stations: grid.listStations(),
          phase: engine.getPhase(),
          tokens: engine.getTokensSnapshot(),
          lastFiredTransitionIds: [],
          fireEventSeq: state.fireEventSeq + 1,
          debugStatsStartTick: null,
          debugFiringHistory: [],
          debugTotalFires: {},
          debugTokenStats: {},
        }))
      },

      setMode: mode => {
        set({
          mode,
          autoTickEnabled: mode === 'player',
        })
      },

      setAutoTickEnabled: enabled => {
        set({ autoTickEnabled: enabled })
      },

      resetSave: () => {
        try {
          window.localStorage.removeItem('whitepod-save')
        } catch {
          // ignore
        }

        const metadata = get().metadata
        const grid = get().grid
        const engine = get().engine

        const seed = 1
        if (metadata) {
          grid.initialize(seed, toDepositConfig(metadata))
        } else {
          grid.initialize(seed)
        }

        if (engine) engine.initialize()

        set(state => ({
          seed,
          tickIndex: 0,
          requestedSystemTransitionIds: [],
          stations: grid.listStations(),
          engineSnapshot: engine ? engine.getSnapshot() : null,
          gridSnapshot: grid.getSnapshot(),
          phase: engine ? engine.getPhase() : 'init',
          tokens: engine ? engine.getTokensSnapshot() : {},
          lastFiredTransitionIds: [],
          fireEventSeq: state.fireEventSeq + 1,
          debugStatsStartTick: null,
          debugFiringHistory: [],
          debugTotalFires: {},
          debugTokenStats: {},
        }))
      },

      newGame: seed => {
        const metadata = get().metadata
        const grid = get().grid
        const engine = get().engine

        if (metadata) {
          grid.initialize(seed, toDepositConfig(metadata))
        } else {
          grid.initialize(seed)
        }

        if (engine) engine.initialize()

        set(state => ({
          seed,
          tickIndex: 0,
          requestedSystemTransitionIds: [],
          stations: grid.listStations(),
          engineSnapshot: engine ? engine.getSnapshot() : null,
          gridSnapshot: grid.getSnapshot(),
          phase: engine ? engine.getPhase() : 'init',
          tokens: engine ? engine.getTokensSnapshot() : {},
          lastFiredTransitionIds: [],
          fireEventSeq: state.fireEventSeq + 1,
          debugStatsStartTick: null,
          debugFiringHistory: [],
          debugTotalFires: {},
          debugTokenStats: {},
        }))
      },

      placeStation: transitionId => {
        if (SYSTEM_TRANSITIONS.has(transitionId)) return

        const grid = get().grid
        const resourceId = extractResourceId(transitionId)

        const station = resourceId
          ? grid.placeStationNearDeposit(resourceId, transitionId)
          : grid.placeStationRandom(transitionId)

        if (!station) return

        set({
          stations: grid.listStations(),
          gridSnapshot: grid.getSnapshot(),
        })
      },

      removeStation: stationId => {
        const grid = get().grid
        grid.removeStation(stationId)

        set({
          stations: grid.listStations(),
          gridSnapshot: grid.getSnapshot(),
        })
      },

      requestSystemTransition: transitionId => {
        set(state => ({
          requestedSystemTransitionIds: uniqueAppend(state.requestedSystemTransitionIds, transitionId),
        }))
      },

      countDeposits: resourceId => {
        return get().grid.countAvailableUnits(resourceId)
      },

      debugResetStats: () => {
        const { tickIndex } = get()
        set({
          debugStatsStartTick: tickIndex,
          debugFiringHistory: [],
          debugTotalFires: {},
          debugTokenStats: {},
        })
      },

      debugFireTransition: transitionId => {
        const { engine, grid, tickIndex, mode, transitions } = get()
        if (!engine) return { ok: false, reason: 'Engine not loaded' }
        if (mode !== 'debug') return { ok: false, reason: 'Only available in debug mode' }

        if (!engine.canFire(transitionId)) {
          return { ok: false, reason: 'Transition not enabled' }
        }

        const resourceId = extractResourceId(transitionId)
        let reservedDepositId: string | null = null

        if (resourceId) {
          reservedDepositId = grid.reserveAnyDeposit(resourceId, tickIndex)
          if (!reservedDepositId) {
            return { ok: false, reason: `No deposits available for ${resourceId}` }
          }
        }

        try {
          engine.fire(transitionId)
        } catch (err) {
          return { ok: false, reason: err instanceof Error ? err.message : String(err) }
        }

        if (reservedDepositId) {
          grid.consumeReservedDeposit(reservedDepositId)
        }

        const nextEngineSnapshot = engine.getSnapshot()
        const nextGridSnapshot = grid.getSnapshot()
        const timestamp = Date.now()

        const transitionsById = new Map<string, Transition>()
        for (const t of transitions) transitionsById.set(t.id, t)

        set(state => {
          const startTick = state.debugStatsStartTick ?? tickIndex
          const fired = [transitionId]

          return {
            engineSnapshot: nextEngineSnapshot,
            gridSnapshot: nextGridSnapshot,
            phase: engine.getPhase(),
            tokens: engine.getTokensSnapshot(),
            stations: grid.listStations(),
            lastFiredTransitionIds: fired,
            fireEventSeq: state.fireEventSeq + 1,
            debugStatsStartTick: startTick,
            debugFiringHistory: updateDebugHistory(state.debugFiringHistory, fired, timestamp),
            debugTotalFires: updateDebugTotalFires(state.debugTotalFires, fired),
            debugTokenStats: updateDebugTokenStats(state.debugTokenStats, fired, transitionsById),
          }
        })

        return { ok: true }
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

        const nextEngineSnapshot = engine.getSnapshot()
        const nextGridSnapshot = grid.getSnapshot()
        const timestamp = Date.now()

        const transitionsById = new Map<string, Transition>()
        for (const t of transitions) transitionsById.set(t.id, t)

        set(state => {
          const base = {
            requestedSystemTransitionIds: [],
            tickIndex: tickIndex + 1,
            engineSnapshot: nextEngineSnapshot,
            gridSnapshot: nextGridSnapshot,
            phase: engine.getPhase(),
            tokens: engine.getTokensSnapshot(),
            stations: grid.listStations(),
            lastFiredTransitionIds: fired,
            fireEventSeq: state.fireEventSeq + 1,
          }

          if (mode !== 'debug') return base

          const startTick = state.debugStatsStartTick ?? tickIndex

          return {
            ...base,
            debugStatsStartTick: startTick,
            debugFiringHistory: updateDebugHistory(state.debugFiringHistory, fired, timestamp),
            debugTotalFires: updateDebugTotalFires(state.debugTotalFires, fired),
            debugTokenStats: updateDebugTokenStats(state.debugTokenStats, fired, transitionsById),
          }
        })

        return {
          timestamp,
          phase: engine.getPhase(),
          tokens: engine.getTokensSnapshot(),
        }
      },
    }),
    {
      name: 'whitepod-save',
      partialize: state => ({
        mode: state.mode,
        seed: state.seed,
        tickIndex: state.tickIndex,
        engineSnapshot: state.engineSnapshot,
        gridSnapshot: state.gridSnapshot,
      }),
    },
  ),
)
