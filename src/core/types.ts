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

export interface PixiExport {
  timestamp: number
  phase: GamePhase
  tokens: Record<string, number>
}
