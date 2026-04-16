import type { ResourceId } from '@/core/grid/manager'

export type GamePhase = 'init' | 'running' | 'done' | 'terminated'

export interface TokenRef {
  place: string
  qty: number
}

export interface Transition {
  id: string
  consumes: TokenRef[]
  produces: TokenRef[]
}

export interface PlaceMeta {
  id: string
  name_fr?: string
  tier?: number
  kind?: 'control'
  layer?: 'surface' | 'bus' | 'stock'
  resourceId?: string
}

export type TransitionActivation = 'placed' | 'always' | 'manual'
export type TransitionKind = 'station' | 'system'

export interface TransitionMeta {
  id: string
  kind: TransitionKind
  activation: TransitionActivation
  stationKind?: 'extract' | 'recipe' | 'convey' | 'store'
  name_fr?: string
}

export interface LunarChemistryMetadata {
  version: number
  canonical: {
    places: PlaceMeta[]
    transitions: TransitionMeta[]
    arcs?: Array<{
      transitionId: string
      direction: 'in' | 'out'
      placeId: string
      meta?: unknown
      lineNo?: number
    }>
  }
  gameSystem: {
    places: PlaceMeta[]
    transitions: TransitionMeta[]
    resources: string[]
    grid: {
      depositConfig: Record<string, { depositCount: number; depositCapacity: number }>
    }
  }
}

export interface PixiGridDeposit {
  id: string
  x: number
  y: number
  resourceId: ResourceId
  remaining: number
}

export interface PixiGridStation {
  id: string
  x: number
  y: number
  transitionId: string
  active: boolean
}

export interface PixiGridCell {
  x: number
  y: number
  kind: 'deposit' | 'station'
  id: string
  resourceId?: ResourceId
  remaining?: number
  transitionId?: string
}

export interface PixiActivity {
  kind: 'spawn' | 'build' | 'extract' | 'convey' | 'store' | 'recipe' | 'launch'
  x?: number
  y?: number
  resourceId?: string
  transitionId?: string
}

export interface PixiExport {
  timestamp: number
  phase: GamePhase
  tokens: Record<string, number>
  grid: {
    width: number
    height: number
    cells: PixiGridCell[]
    deposits: PixiGridDeposit[]
    stations: PixiGridStation[]
  }
  layerTokens: {
    surface: Record<string, number>
    bus: Record<string, number>
    stock: Record<string, number>
  }
  activities: PixiActivity[]
  viewport?: {
    cellSize: number
    zoom: number
  }
}
