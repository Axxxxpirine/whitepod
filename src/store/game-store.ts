import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { applyBuildCost, getMissingBuildCost, getStationBuildCost, splitPlaceId } from '@/core/build-planning'
import type { GamePhase, LunarChemistryMetadata, PixiActivity, PixiExport, Transition } from '@/core/types'
import { GRID_CELL_SIZE } from '@/core/grid/config'
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
  selectedBuildCell: { x: number; y: number } | null
  hoveredBuildCell: { x: number; y: number } | null

  phase: GamePhase
  tokens: Record<string, number>

  // runtime-only (not persisted)
  autoTickEnabled: boolean
  demonstrationEnabled: boolean
  demoModeEnabled: boolean
  lastFiredTransitionIds: string[]
  pixiActivities: PixiActivity[]
  fireEventSeq: number

  debugStatsStartTick: number | null
  debugFiringHistory: Array<{ timestamp: number; transitionId: string }>
  debugTotalFires: Record<string, number>
  debugTokenStats: Record<string, { produced: number; consumed: number }>

  loadSystem: () => Promise<void>
  setMode: (mode: GameMode) => void
  setAutoTickEnabled: (enabled: boolean) => void
  setDemonstrationEnabled: (enabled: boolean) => void
  setDemoModeEnabled: (enabled: boolean) => void
  resetSave: () => void
  newGame: (seed: number) => void

  debugFireTransition: (transitionId: string) => { ok: boolean; reason?: string }
  debugResetStats: () => void

  placeStation: (transitionId: string) => void
  selectBuildCell: (x: number, y: number) => void
  hoverBuildCell: (x: number, y: number | null) => void
  clearBuildSelection: () => void
  getBuildOptionsAtSelectedCell: () => Array<{ transitionId: string; name: string; enabled: boolean; reason?: string }>
  placeStationAtCell: (x: number, y: number, transitionId: string) => { ok: boolean; reason?: string }
  placeStationAtSelectedCell: (transitionId: string) => { ok: boolean; reason?: string }
  removeStation: (stationId: string) => void
  setBuildPalette: (kind: 'extractor' | 'conveyor' | 'factory' | 'storage') => void
  buildPalette: 'extractor' | 'conveyor' | 'factory' | 'storage'
  selectedBuildTransitionId: string | null
  setSelectedBuildTransitionId: (transitionId: string | null) => void
  getPreferredTransitionIdForPalette: () => string | null

  requestSystemTransition: (transitionId: 'init' | 'launch' | 'terminate') => void

  countDeposits: (resourceId: ResourceId) => number

  tick: () => PixiExport
  getPixiExport: () => PixiExport
  setSelectedBuildCell: (cell: { x: number; y: number } | null) => void
}

const SYSTEM_TRANSITIONS = new Set(['init', 'launch', 'terminate'])
const EXTRACT_PREFIX = 'extract__'
const AUTOSAVE_TICK_INTERVAL = 30
const RESOURCE_ORDER: ResourceId[] = ['lunar_helium3', 'lunar_hydrogen', 'lunar_oxygen', 'lunar_regolith']
const DEMO_BUILD_TARGETS = {
  extractor: ['extract__lunar_hydrogen', 'extract__lunar_oxygen', 'extract__lunar_regolith', 'extract__lunar_helium3'],
  conveyor: ['convey__lunar_hydrogen', 'convey__lunar_oxygen', 'convey__lunar_regolith', 'convey__lunar_helium3'],
  storage: ['store__lunar_hydrogen', 'store__lunar_oxygen', 'store__lunar_regolith', 'store__lunar_helium3'],
  factory: ['recipe__assemble_rocket'],
} as const

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

function getConsumedPlaceAnchors(transitionId: string): string[] {
  if (transitionId.startsWith('extract__')) {
    return [transitionId.slice('extract__'.length)]
  }
  return []
}

function getBuildReason(grid: GridManager, transitionId: string, x: number, y: number): string | null {
  if (!grid.canPlaceStationAt(x, y)) return 'Cellule occupée ou hors limites'

  const anchors = getConsumedPlaceAnchors(transitionId)
  if (anchors.length === 0) return null

  for (const place of anchors) {
    const resourceId = place as ResourceId
    if (grid.hasAdjacentDeposit(resourceId, x, y)) return null
  }

  return 'Aucune place consommée adjacente'
}

function getBuildPaymentReason(tokens: Record<string, number>, transition: Transition): string | null {
  const missing = getMissingBuildCost(tokens, getStationBuildCost(transition))
  if (missing.length === 0) return null

  const missingLabel = missing.map(token => `${token.qty} ${token.place}`).join(', ')
  return `Ressources insuffisantes: ${missingLabel}`
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

function buildLayerTokens(tokens: Record<string, number>): PixiExport['layerTokens'] {
  const surface: Record<string, number> = {}
  const bus: Record<string, number> = {}
  const stock: Record<string, number> = {}

  for (const [place, qty] of Object.entries(tokens)) {
    if (place.endsWith('_surface')) {
      surface[place] = qty
      continue
    }

    if (place.endsWith('_bus')) {
      bus[place] = qty
      continue
    }

    if (place.endsWith('_stock')) {
      stock[place] = qty
    }
  }

  return { surface, bus, stock }
}

function getPalettePrefix(kind: GameState['buildPalette']): string {
  switch (kind) {
    case 'extractor':
      return 'extract__'
    case 'conveyor':
      return 'convey__'
    case 'factory':
      return 'recipe__'
    case 'storage':
      return 'store__'
  }
}

function ensureStarterExtractor(grid: GridManager): void {
  if (grid.listStations().length > 0) return

  for (const resourceId of RESOURCE_ORDER) {
    const transitionId = `extract__${resourceId}`
    const station = grid.placeStationNearDeposit(resourceId, transitionId)
    if (station) return
  }
}

function appendMapValue<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const current = map.get(key)
  if (current) current.push(value)
  else map.set(key, [value])
}

function buildPlaceTierMap(metadata: LunarChemistryMetadata): Map<string, number> {
  const tiers = new Map<string, number>()
  for (const place of metadata.gameSystem.places) {
    if (place.tier === undefined || place.kind === 'control' || place.layer) continue
    tiers.set(place.id, place.tier)
  }
  return tiers
}

function getPrimaryOutputBaseId(transition: Transition): string | null {
  for (const output of transition.produces) {
    if (output.place === 'run' || output.place === 'done' || output.place === 'start') continue
    return splitPlaceId(output.place).baseId
  }
  return null
}

function buildRelevantDemoResources(
  transitions: readonly Transition[],
  targetResourceId: string,
): Set<string> {
  const recipeByOutputBaseId = new Map<string, Transition>()
  for (const transition of transitions) {
    if (!transition.id.startsWith('recipe__')) continue
    const outputBaseId = getPrimaryOutputBaseId(transition)
    if (!outputBaseId) continue
    recipeByOutputBaseId.set(outputBaseId, transition)
  }

  const relevant = new Set<string>()

  const visit = (resourceId: string) => {
    if (relevant.has(resourceId)) return
    relevant.add(resourceId)

    const recipe = recipeByOutputBaseId.get(resourceId)
    if (!recipe) return

    for (const input of getStationBuildCost(recipe)) {
      const baseId = splitPlaceId(input.place).baseId
      if (!baseId) continue
      visit(baseId)
    }
  }

  visit(targetResourceId)
  return relevant
}

function sortDemoResources(resourceIds: Iterable<string>, placeTiers: ReadonlyMap<string, number>): string[] {
  return [...resourceIds].sort((left, right) => {
    const tierDiff = (placeTiers.get(left) ?? Number.MAX_SAFE_INTEGER) - (placeTiers.get(right) ?? Number.MAX_SAFE_INTEGER)
    if (tierDiff !== 0) return tierDiff
    return left.localeCompare(right)
  })
}

function placeDemoStation(
  transitionId: string,
  transitionsById: ReadonlyMap<string, Transition>,
  grid: GridManager,
  engine: PetriNetEngine,
): PixiActivity | null {
  const transition = transitionsById.get(transitionId)
  if (!transition) return null

  const nextTokens = applyBuildCost(engine.getTokensSnapshot(), getStationBuildCost(transition))
  if (!nextTokens) return null

  const resourceId = extractResourceId(transitionId)
  const station = resourceId
    ? grid.placeStationNearDeposit(resourceId, transitionId)
    : grid.placeStationRandom(transitionId)

  if (!station) return null

  engine.loadSnapshot({
    ...engine.getSnapshot(),
    tokens: nextTokens,
  })

  return {
    kind: 'build',
    x: station.x,
    y: station.y,
    transitionId,
    resourceId: getPrimaryOutputBaseId(transition) ?? resourceId ?? undefined,
  }
}

function runDemonstrationBuildStep(
  metadata: LunarChemistryMetadata,
  transitions: readonly Transition[],
  grid: GridManager,
  engine: PetriNetEngine,
): PixiActivity[] {
  const transitionsById = new Map(transitions.map(transition => [transition.id, transition]))
  const placeTiers = buildPlaceTierMap(metadata)
  const relevantResources = buildRelevantDemoResources(transitions, 'rocket_ready')
  const sortedResources = sortDemoResources(relevantResources, placeTiers)
  const stationTransitionIds = new Set(grid.listStations().map(station => station.transitionId))
  const tokens = engine.getTokensSnapshot()

  for (const resourceId of RESOURCE_ORDER) {
    if (!relevantResources.has(resourceId)) continue
    const transitionId = `extract__${resourceId}`
    if (stationTransitionIds.has(transitionId)) continue
    const activity = placeDemoStation(transitionId, transitionsById, grid, engine)
    if (activity) return [activity]
  }

  for (const resourceId of sortedResources) {
    const transitionId = `convey__${resourceId}`
    if (stationTransitionIds.has(transitionId)) continue
    if ((tokens[`${resourceId}_surface`] ?? 0) <= 0) continue
    const activity = placeDemoStation(transitionId, transitionsById, grid, engine)
    if (activity) return [activity]
  }

  for (const resourceId of sortedResources) {
    const transitionId = `store__${resourceId}`
    if (stationTransitionIds.has(transitionId)) continue
    if ((tokens[`${resourceId}_bus`] ?? 0) <= 0) continue
    const activity = placeDemoStation(transitionId, transitionsById, grid, engine)
    if (activity) return [activity]
  }

  const recipeTransitions = transitions
    .filter(transition => transition.id.startsWith('recipe__'))
    .filter(transition => {
      const outputBaseId = getPrimaryOutputBaseId(transition)
      return outputBaseId !== null && relevantResources.has(outputBaseId)
    })
    .sort((left, right) => {
      const leftTier = placeTiers.get(getPrimaryOutputBaseId(left) ?? '') ?? Number.MAX_SAFE_INTEGER
      const rightTier = placeTiers.get(getPrimaryOutputBaseId(right) ?? '') ?? Number.MAX_SAFE_INTEGER
      if (leftTier !== rightTier) return leftTier - rightTier
      return left.id.localeCompare(right.id)
    })

  for (const transition of recipeTransitions) {
    if (stationTransitionIds.has(transition.id)) continue
    const activity = placeDemoStation(transition.id, transitionsById, grid, engine)
    if (activity) return [activity]
  }

  return []
}

function pickDemoStationTransition(
  buildPalette: 'extractor' | 'conveyor' | 'factory' | 'storage',
  getPreferredTransitionIdForPalette: () => string | null,
): string | null {
  const preferred = getPreferredTransitionIdForPalette()
  if (preferred) return preferred
  return DEMO_BUILD_TARGETS[buildPalette][0] ?? null
}

function buildTickActivities(
  transitions: readonly Transition[],
  stations: readonly StationPlacement[],
  grid: GridManager,
  fired: readonly string[],
  consumedDepositIdsByTransitionId: ReadonlyMap<string, string[]>,
): PixiActivity[] {
  const activities: PixiActivity[] = []
  const stationsByTransitionId = new Map<string, StationPlacement[]>()
  const depositsById = new Map(grid.listDeposits({ includeDepleted: true }).map(deposit => [deposit.id, deposit]))
  const transitionsById = new Map(transitions.map(transition => [transition.id, transition]))

  for (const station of stations) appendMapValue(stationsByTransitionId, station.transitionId, station)

  for (const transitionId of fired) {
    if (transitionId === 'launch') {
      activities.push({ kind: 'launch', transitionId })
      continue
    }

    const station = stationsByTransitionId.get(transitionId)?.shift()
    const transition = transitionsById.get(transitionId)
    const outputBaseId = transition ? getPrimaryOutputBaseId(transition) : null
    const extractResourceIdValue = extractResourceId(transitionId)

    if (extractResourceIdValue) {
      const depositId = consumedDepositIdsByTransitionId.get(transitionId)?.shift()
      const deposit = depositId ? depositsById.get(depositId) : null
      if (deposit) {
        activities.push({
          kind: 'spawn',
          x: deposit.x,
          y: deposit.y,
          resourceId: extractResourceIdValue,
          transitionId,
        })
      }
      if (station) {
        activities.push({
          kind: 'extract',
          x: station.x,
          y: station.y,
          resourceId: extractResourceIdValue,
          transitionId,
        })
      }
      continue
    }

    if (!station) continue

    activities.push({
      kind: transitionId.startsWith('convey__')
        ? 'convey'
        : transitionId.startsWith('store__')
          ? 'store'
          : 'recipe',
      x: station.x,
      y: station.y,
      resourceId: outputBaseId ?? undefined,
      transitionId,
    })
  }

  return activities
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
      selectedBuildCell: null,
      hoveredBuildCell: null,
      buildPalette: 'extractor',
      selectedBuildTransitionId: null,

      phase: 'init',
      tokens: {},

      autoTickEnabled: true,
      demonstrationEnabled: false,
      demoModeEnabled: false,
      lastFiredTransitionIds: [],
      pixiActivities: [],
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

        ensureStarterExtractor(grid)

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
          demonstrationEnabled: false,
          demoModeEnabled: false,
          engineSnapshot: engine.getSnapshot(),

          gridSnapshot: grid.getSnapshot(),
          stations: grid.listStations(),
          phase: engine.getPhase(),
          tokens: engine.getTokensSnapshot(),
          lastFiredTransitionIds: [],
          pixiActivities: [],
          fireEventSeq: state.fireEventSeq + 1,
          saveRevision: state.saveRevision + 1,
          debugStatsStartTick: null,
          debugFiringHistory: [],
          debugTotalFires: {},
          debugTokenStats: {},
          selectedBuildTransitionId: null,
        }))
      },

      setMode: mode => {
        set({
          mode,
          autoTickEnabled: mode === 'player',
          demonstrationEnabled: false,
          demoModeEnabled: false,
          pixiActivities: [],
        })
      },

      setAutoTickEnabled: enabled => {
        set({ autoTickEnabled: enabled })
      },

      setDemonstrationEnabled: enabled => {
        set(state => ({
          demonstrationEnabled: enabled,
          autoTickEnabled: enabled ? true : state.autoTickEnabled,
          pixiActivities: enabled ? state.pixiActivities : [],
        }))
      },

      setDemoModeEnabled: enabled => {
        set(state => ({
          demoModeEnabled: enabled,
          demonstrationEnabled: enabled,
          autoTickEnabled: enabled ? true : state.autoTickEnabled,
          requestedSystemTransitionIds: enabled ? [] : state.requestedSystemTransitionIds,
          selectedBuildCell: null,
          hoveredBuildCell: null,
          selectedBuildTransitionId: enabled ? null : state.selectedBuildTransitionId,
        }))
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

        ensureStarterExtractor(grid)

        if (engine) engine.initialize()

        set(state => ({
          seed,
          autosaveTickIndex: 0,
          saveRevision: state.saveRevision + 1,
          tickIndex: 0,
          demonstrationEnabled: false,
          demoModeEnabled: false,
          requestedSystemTransitionIds: [],
          stations: grid.listStations(),
          engineSnapshot: engine ? engine.getSnapshot() : null,
          gridSnapshot: grid.getSnapshot(),
          phase: engine ? engine.getPhase() : 'init',
          tokens: engine ? engine.getTokensSnapshot() : {},
          lastFiredTransitionIds: [],
          pixiActivities: [],
          fireEventSeq: state.fireEventSeq + 1,
          debugStatsStartTick: null,
          debugFiringHistory: [],
          debugTotalFires: {},
          debugTokenStats: {},
          selectedBuildTransitionId: null,
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

        ensureStarterExtractor(grid)

        if (engine) engine.initialize()

        set(state => ({
          seed,
          autosaveTickIndex: 0,
          saveRevision: state.saveRevision + 1,
          tickIndex: 0,
          demonstrationEnabled: false,
          demoModeEnabled: false,
          requestedSystemTransitionIds: [],
          stations: grid.listStations(),
          engineSnapshot: engine ? engine.getSnapshot() : null,
          gridSnapshot: grid.getSnapshot(),
          phase: engine ? engine.getPhase() : 'init',
          tokens: engine ? engine.getTokensSnapshot() : {},
          lastFiredTransitionIds: [],
          pixiActivities: [],
          fireEventSeq: state.fireEventSeq + 1,
          debugStatsStartTick: null,
          debugFiringHistory: [],
          debugTotalFires: {},
          debugTokenStats: {},
          selectedBuildTransitionId: null,
        }))
      },

      placeStation: transitionId => {
        if (SYSTEM_TRANSITIONS.has(transitionId)) return

        const { grid, engine, tickIndex, transitions } = get()
        const transition = transitions.find(entry => entry.id === transitionId)
        if (!transition) return

        const nextTokens = engine ? applyBuildCost(engine.getTokensSnapshot(), getStationBuildCost(transition)) : {}
        if (engine && nextTokens === null) return

        const resourceId = extractResourceId(transitionId)

        const station = resourceId
          ? grid.placeStationNearDeposit(resourceId, transitionId)
          : grid.placeStationRandom(transitionId)

        if (!station) return

        if (engine && nextTokens) {
          engine.loadSnapshot({
            ...engine.getSnapshot(),
            tokens: nextTokens,
          })
        }

        set({
          autosaveTickIndex: tickIndex,
          saveRevision: get().saveRevision + 1,
          stations: grid.listStations(),
          phase: engine ? engine.getPhase() : get().phase,
          tokens: engine ? engine.getTokensSnapshot() : get().tokens,
          engineSnapshot: engine ? engine.getSnapshot() : null,
          gridSnapshot: grid.getSnapshot(),
        })
      },

      placeStationAtCell: (x, y, transitionId) => {
        const { grid, metadata, engine, tickIndex, transitions } = get()
        if (!metadata) return { ok: false, reason: 'Métadonnées non chargées' }

        const transitionMeta = metadata.gameSystem.transitions.find(t => t.id === transitionId)
        if (!transitionMeta) return { ok: false, reason: 'Transition inconnue' }

        const transition = transitions.find(entry => entry.id === transitionId)
        if (!transition) return { ok: false, reason: 'Transition runtime inconnue' }

        const placeOk = getBuildReason(grid, transitionId, x, y)
        if (placeOk) return { ok: false, reason: placeOk }

        const paymentReason = getBuildPaymentReason(engine?.getTokensSnapshot() ?? {}, transition)
        if (paymentReason) return { ok: false, reason: paymentReason }

        const station = grid.placeStationAt(x, y, transitionId)
        if (!station) return { ok: false, reason: 'Impossible de poser la station' }

        if (engine) {
          const nextTokens = applyBuildCost(engine.getTokensSnapshot(), getStationBuildCost(transition))
          if (!nextTokens) return { ok: false, reason: 'Ressources insuffisantes' }
          engine.loadSnapshot({
            ...engine.getSnapshot(),
            tokens: nextTokens,
          })
        }

        set({
          selectedBuildCell: null,
          autosaveTickIndex: tickIndex,
          saveRevision: get().saveRevision + 1,
          stations: grid.listStations(),
          phase: engine ? engine.getPhase() : get().phase,
          tokens: engine ? engine.getTokensSnapshot() : get().tokens,
          engineSnapshot: engine ? engine.getSnapshot() : null,
          gridSnapshot: grid.getSnapshot(),
        })

        return { ok: true }
      },

      selectBuildCell: (x, y) => {
        set({ selectedBuildCell: { x, y } })
      },

      hoverBuildCell: (x, y) => {
        set({ hoveredBuildCell: y === null ? null : { x, y } })
      },

      clearBuildSelection: () => {
        set({ selectedBuildCell: null, hoveredBuildCell: null })
      },

      setBuildPalette: kind => {
        const prefix = getPalettePrefix(kind)
        const current = get().selectedBuildTransitionId
        const next = current && current.startsWith(prefix) ? current : null
        set({ buildPalette: kind, selectedBuildTransitionId: next })
      },

      setSelectedBuildTransitionId: transitionId => {
        set({ selectedBuildTransitionId: transitionId })
      },

      getBuildOptionsAtSelectedCell: () => {
        const { grid, selectedBuildCell, buildPalette, transitions, metadata, engine } = get()
        if (!selectedBuildCell) return []
        const prefix = getPalettePrefix(buildPalette)
        const candidates = transitions.filter(t => t.id.startsWith(prefix))
        return candidates.map(transition => {
          const placementReason = getBuildReason(grid, transition.id, selectedBuildCell.x, selectedBuildCell.y)
          const paymentReason = getBuildPaymentReason(engine?.getTokensSnapshot() ?? {}, transition)
          const reason = placementReason ?? paymentReason
          const name = metadata?.gameSystem.transitions.find(t => t.id === transition.id)?.name_fr ?? transition.id
          return { transitionId: transition.id, name, enabled: reason === null, reason: reason ?? undefined }
        })
      },

      getPreferredTransitionIdForPalette: () => {
        const { selectedBuildTransitionId, buildPalette, transitions, engine } = get()
        const prefix = getPalettePrefix(buildPalette)
        const affordableTransitions = transitions.filter(transition => {
          if (!transition.id.startsWith(prefix)) return false
          return getMissingBuildCost(engine?.getTokensSnapshot() ?? {}, getStationBuildCost(transition)).length === 0
        })

        if (selectedBuildTransitionId && affordableTransitions.some(transition => transition.id === selectedBuildTransitionId)) {
          return selectedBuildTransitionId
        }

        return affordableTransitions[0]?.id ?? null
      },

      placeStationAtSelectedCell: transitionId => {
        const { selectedBuildCell } = get()
        if (!selectedBuildCell) return { ok: false, reason: 'Aucune cellule sélectionnée' }
        return get().placeStationAtCell(selectedBuildCell.x, selectedBuildCell.y, transitionId)
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

      getPixiExport: () => {
        const { engine, grid, pixiActivities } = get()
        const deposits = grid.listDeposits({ includeDepleted: false })
        const stations = grid.listStations()
        const tokens = engine?.getTokensSnapshot() ?? {}

        return {
          timestamp: Date.now(),
          phase: engine?.getPhase() ?? 'init',
          tokens,
          grid: {
            width: grid.width,
            height: grid.height,
            cells: [
              ...deposits.map(d => ({
                x: d.x,
                y: d.y,
                kind: 'deposit' as const,
                id: d.id,
                resourceId: d.resourceId,
                remaining: d.remaining,
              })),
              ...stations.map(s => ({
                x: s.x,
                y: s.y,
                kind: 'station' as const,
                id: s.id,
                transitionId: s.transitionId,
              })),
            ],
            deposits: deposits.map(d => ({
              id: d.id,
              x: d.x,
              y: d.y,
              resourceId: d.resourceId,
              remaining: d.remaining,
            })),
            stations: stations.map(s => ({ ...s, active: true })),
          },
          layerTokens: buildLayerTokens(tokens),
          activities: pixiActivities,
          viewport: { cellSize: GRID_CELL_SIZE, zoom: 1 },
        }
      },

      setSelectedBuildCell: cell => {
        set({ selectedBuildCell: cell })
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
        const {
          engine,
          transitions,
          mode,
          requestedSystemTransitionIds,
          grid,
          tickIndex,
          metadata,
          demonstrationEnabled,
          demoModeEnabled,
          buildPalette,
        } = get()
        if (!engine) throw new Error('Engine not loaded')

        const demonstrationActivities = demonstrationEnabled && metadata
          ? runDemonstrationBuildStep(metadata, transitions, grid, engine)
          : []

        const demoAutoBuildTransitionId = demoModeEnabled
          ? pickDemoStationTransition(buildPalette, () => get().getPreferredTransitionIdForPalette())
          : null

        if (demoModeEnabled && demoAutoBuildTransitionId) {
          const placement = get().placeStationAtSelectedCell(demoAutoBuildTransitionId)
          if (placement.ok) {
            return get().getPixiExport()
          }
        }

        const stations = grid.listStations()

        const phase = engine.getPhase()
        let effectiveRequestedTransitionIds = requestedSystemTransitionIds

        if (demonstrationEnabled && phase === 'init') {
          effectiveRequestedTransitionIds = uniqueAppend(effectiveRequestedTransitionIds, 'init')
        }

        if (demonstrationEnabled && (engine.getTokensSnapshot().rocket_ready_stock ?? 0) > 0) {
          effectiveRequestedTransitionIds = uniqueAppend(effectiveRequestedTransitionIds, 'launch')
        }

        const drainIds =
          phase === 'done' ? transitions.filter(t => t.id.startsWith('drain__')).map(t => t.id) : []

        const activeTransitionIds: string[] = []
        const reservedDepositIdsByTransitionId = new Map<string, string[]>()
        const consumedDepositIdsByTransitionId = new Map<string, string[]>()

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
          requestedTransitionIds: effectiveRequestedTransitionIds,
        })

        for (const transitionId of fired) {
          const resourceId = extractResourceId(transitionId)
          if (!resourceId) continue

          const deposits = reservedDepositIdsByTransitionId.get(transitionId)
          const depositId = deposits?.shift()
          if (!depositId) continue

          grid.consumeReservedDeposit(depositId)
          appendMapValue(consumedDepositIdsByTransitionId, transitionId, depositId)
        }

        const nextTickIndex = tickIndex + 1
        const firedSystemTransition = fired.some(id => SYSTEM_TRANSITIONS.has(id))
        const shouldAutosave = nextTickIndex % AUTOSAVE_TICK_INTERVAL === 0 || firedSystemTransition || demonstrationActivities.length > 0
        const timestamp = Date.now()
        const tokensSnapshot = engine.getTokensSnapshot()
        const gridStations = grid.listStations()
        const tickActivities = [
          ...demonstrationActivities,
          ...buildTickActivities(transitions, gridStations, grid, fired, consumedDepositIdsByTransitionId),
        ]

        set(state => {
          const base = {
            requestedSystemTransitionIds: [],
            tickIndex: nextTickIndex,
            phase: engine.getPhase(),
            tokens: tokensSnapshot,
            stations: gridStations,
            lastFiredTransitionIds: fired,
            pixiActivities: tickActivities,
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

        return get().getPixiExport()
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
