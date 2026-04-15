import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
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
  autosaveTickIndex: number
  saveRevision: number
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
const AUTOSAVE_TICK_INTERVAL = 30

type PersistedGameState = Pick<
  GameState,
  'mode' | 'seed' | 'autosaveTickIndex' | 'saveRevision' | 'engineSnapshot' | 'gridSnapshot'
>

function isPersistedGameState(value: unknown): value is PersistedGameState {
  if (!value || typeof value !== 'object') return false

  const state = value as Partial<PersistedGameState>
  if (state.mode !== 'player' && state.mode !== 'debug') return false
  if (typeof state.seed !== 'number' || !Number.isFinite(state.seed)) return false
  if (typeof state.autosaveTickIndex !== 'number' || !Number.isInteger(state.autosaveTickIndex)) return false
  if (typeof state.saveRevision !== 'number' || !Number.isInteger(state.saveRevision) || state.saveRevision < 0) {
    return false
  }

  if (state.engineSnapshot !== null && state.engineSnapshot !== undefined) {
    try {
      const engine = new PetriNetEngine([])
      engine.loadSnapshot(state.engineSnapshot as PetriNetEngineSnapshot)
    } catch {
      return false
    }
  }

  if (state.gridSnapshot !== null && state.gridSnapshot !== undefined) {
    try {
      const grid = new GridManager()
      grid.loadSnapshot(state.gridSnapshot as GridSnapshot)
    } catch {
      return false
    }
  }

  return true
}

function createDedupeStorage() {
  const base = createJSONStorage<PersistedGameState>(() => localStorage)
  if (!base) return undefined

  return {
    ...base,
    setItem: (
      name: Parameters<typeof base.setItem>[0],
      value: Parameters<typeof base.setItem>[1],
    ) => {
      try {
        const next = JSON.stringify(value)
        const prev = localStorage.getItem(name)
        if (prev === next) return
      } catch {
        // ignore
      }

      return base.setItem(name, value)
    },
  }
}

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
      autosaveTickIndex: 0,
      saveRevision: 0,
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
        const autosaveTickIndex = get().autosaveTickIndex

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
          tickIndex: autosaveTickIndex,
          autoTickEnabled: mode === 'player',
          engineSnapshot: engine.getSnapshot(),

          gridSnapshot: grid.getSnapshot(),
          stations: grid.listStations(),
          phase: engine.getPhase(),
          tokens: engine.getTokensSnapshot(),
          lastFiredTransitionIds: [],
          fireEventSeq: state.fireEventSeq + 1,
          saveRevision: state.saveRevision + 1,
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
          autosaveTickIndex: 0,
          saveRevision: state.saveRevision + 1,
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
          autosaveTickIndex: 0,
          saveRevision: state.saveRevision + 1,
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

        const { grid, engine, tickIndex } = get()
        const resourceId = extractResourceId(transitionId)

        const station = resourceId
          ? grid.placeStationNearDeposit(resourceId, transitionId)
          : grid.placeStationRandom(transitionId)

        if (!station) return

        set({
          autosaveTickIndex: tickIndex,
          saveRevision: get().saveRevision + 1,
          stations: grid.listStations(),
          engineSnapshot: engine ? engine.getSnapshot() : null,
          gridSnapshot: grid.getSnapshot(),
        })
      },

      removeStation: stationId => {
        const { grid, engine, tickIndex } = get()
        grid.removeStation(stationId)

        set({
          autosaveTickIndex: tickIndex,
          saveRevision: get().saveRevision + 1,
          stations: grid.listStations(),
          engineSnapshot: engine ? engine.getSnapshot() : null,
          gridSnapshot: grid.getSnapshot(),
        })
      },

      requestSystemTransition: transitionId => {
        set(state => ({
          requestedSystemTransitionIds: uniqueAppend(state.requestedSystemTransitionIds, transitionId),
          autosaveTickIndex: state.tickIndex,
          saveRevision: state.saveRevision + 1,
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

        const timestamp = Date.now()

        const transitionsById = new Map<string, Transition>()
        for (const t of transitions) transitionsById.set(t.id, t)

        set(state => {
          const startTick = state.debugStatsStartTick ?? tickIndex
          const fired = [transitionId]

          const base = {
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

          return {
            ...base,
            autosaveTickIndex: tickIndex,
            saveRevision: state.saveRevision + 1,
            engineSnapshot: engine.getSnapshot(),
            gridSnapshot: grid.getSnapshot(),
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

        const nextTickIndex = tickIndex + 1
        const firedSystemTransition = fired.some(id => SYSTEM_TRANSITIONS.has(id))
        const shouldAutosave = nextTickIndex % AUTOSAVE_TICK_INTERVAL === 0 || firedSystemTransition
        const timestamp = Date.now()

        const deposits = grid.listDeposits({ includeDepleted: false })
        const gridStations = grid.listStations()
        const tokensSnapshot = engine.getTokensSnapshot()

        const layerTokens = {
          surface: {} as Record<string, number>,
          bus: {} as Record<string, number>,
          stock: {} as Record<string, number>,
        }

        for (const [place, qty] of Object.entries(tokensSnapshot)) {
          if (place.endsWith('_surface')) {
            layerTokens.surface[place] = qty
          } else if (place.endsWith('_bus')) {
            layerTokens.bus[place] = qty
          } else if (place.endsWith('_stock')) {
            layerTokens.stock[place] = qty
          }
        }

        set(state => {
          const base = {
            requestedSystemTransitionIds: [],
            tickIndex: nextTickIndex,
            phase: engine.getPhase(),
            tokens: tokensSnapshot,
            stations: gridStations,
            lastFiredTransitionIds: fired,
            fireEventSeq: state.fireEventSeq + 1,
          }

          const maybeAutosaved = shouldAutosave
            ? {
                ...base,
                autosaveTickIndex: nextTickIndex,
                saveRevision: state.saveRevision + 1,
                engineSnapshot: engine.getSnapshot(),
                gridSnapshot: grid.getSnapshot(),
              }
            : base

          if (mode !== 'debug') return maybeAutosaved

          const transitionsById = new Map<string, Transition>()
          for (const t of transitions) transitionsById.set(t.id, t)

          const startTick = state.debugStatsStartTick ?? tickIndex

          return {
            ...maybeAutosaved,
            debugStatsStartTick: startTick,
            debugFiringHistory: updateDebugHistory(state.debugFiringHistory, fired, timestamp),
            debugTotalFires: updateDebugTotalFires(state.debugTotalFires, fired),
            debugTokenStats: updateDebugTokenStats(state.debugTokenStats, fired, transitionsById),
          }
        })

        return {
          timestamp,
          phase: engine.getPhase(),
          tokens: tokensSnapshot,
          grid: {
            width: 128,
            height: 128,
            deposits: deposits.map(d => ({
              id: d.id,
              x: d.x,
              y: d.y,
              resourceId: d.resourceId,
              remaining: d.remaining,
            })),
            stations: gridStations,
          },
          layerTokens,
        }
      },
    }),
    {
      name: 'whitepod-save',
      version: 1,
      storage: createDedupeStorage(),
      merge: (persisted, current) => {
        if (!isPersistedGameState(persisted)) {
          try {
            localStorage.removeItem('whitepod-save')
          } catch {
            // ignore
          }
          return current
        }

        return {
          ...current,
          ...persisted,
        }
      },
      migrate: (persisted, version) => {
        if (version === 0) {
          const s = (persisted ?? {}) as Partial<PersistedGameState> & { tickIndex?: number }
          const autosaveTickIndex =
            typeof s.autosaveTickIndex === 'number' ? s.autosaveTickIndex : (s.tickIndex ?? 0)

          return {
            mode: s.mode ?? 'player',
            seed: s.seed ?? 1,
            engineSnapshot: s.engineSnapshot ?? null,
            gridSnapshot: s.gridSnapshot ?? null,
            autosaveTickIndex,
            saveRevision: typeof s.saveRevision === 'number' ? s.saveRevision : 0,
          }
        }

        return persisted as PersistedGameState
      },
      partialize: state => ({
        mode: state.mode,
        seed: state.seed,
        autosaveTickIndex: state.autosaveTickIndex,
        saveRevision: state.saveRevision,
        engineSnapshot: state.engineSnapshot,
        gridSnapshot: state.gridSnapshot,
      }),
    },
  ),
)
