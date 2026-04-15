export type ResourceId = 'lunar_helium3' | 'lunar_hydrogen' | 'lunar_oxygen' | 'lunar_regolith'

export interface ResourceDeposit {
  id: string
  x: number
  y: number
  resourceId: ResourceId
  consumed: boolean
}

export interface StationPlacement {
  id: string
  x: number
  y: number
  transitionId: string
}

interface Rng {
  next: () => number
}

function createSeededRng(seed: number): Rng {
  // Simple LCG; deterministic across runtimes.
  let s = seed
  return {
    next: () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    },
  }
}

function key(x: number, y: number): string {
  return `${x},${y}`
}

export class GridManager {
  readonly width = 128
  readonly height = 128

  private rng: Rng
  private nextStationSeq = 1

  private deposits: ResourceDeposit[]
  private depositsByPos: Map<string, ResourceDeposit>

  private stationsById: Map<string, StationPlacement>
  private stationPosToId: Map<string, string>

  constructor() {
    this.rng = createSeededRng(1)
    this.deposits = []
    this.depositsByPos = new Map()
    this.stationsById = new Map()
    this.stationPosToId = new Map()
  }

  initialize(seed: number): void {
    this.rng = createSeededRng(seed)
    this.nextStationSeq = 1

    this.deposits = []
    this.depositsByPos.clear()

    this.stationsById.clear()
    this.stationPosToId.clear()

    this.generateDeposits()
  }

  listStations(): StationPlacement[] {
    return [...this.stationsById.values()].sort((a, b) => a.id.localeCompare(b.id))
  }

  removeStation(stationId: string): void {
    const station = this.stationsById.get(stationId)
    if (!station) return

    this.stationsById.delete(stationId)
    this.stationPosToId.delete(key(station.x, station.y))
  }

  listDeposits(options?: { resourceId?: ResourceId; includeConsumed?: boolean }): ResourceDeposit[] {
    const { resourceId, includeConsumed } = options ?? {}
    return this.deposits
      .filter(d => (resourceId ? d.resourceId === resourceId : true))
      .filter(d => (includeConsumed ? true : !d.consumed))
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  countAvailableDeposits(resourceId: ResourceId): number {
    let count = 0
    for (const d of this.deposits) {
      if (!d.consumed && d.resourceId === resourceId) count += 1
    }
    return count
  }

  placeStationNearDeposit(resourceId: ResourceId, transitionId: string): StationPlacement | null {
    const deposit = this.deposits.find(d => !d.consumed && d.resourceId === resourceId)
    if (!deposit) return null

    const pos = this.findFirstFreeAdjacent(deposit.x, deposit.y)
    if (!pos) return null

    return this.placeStationAt(pos.x, pos.y, transitionId)
  }

  placeStationRandom(transitionId: string, maxAttempts = 5000): StationPlacement | null {
    for (let i = 0; i < maxAttempts; i++) {
      const x = Math.floor(this.rng.next() * this.width)
      const y = Math.floor(this.rng.next() * this.height)
      if (this.isOccupied(x, y)) continue
      return this.placeStationAt(x, y, transitionId)
    }

    return null
  }

  canExtractAtStation(station: StationPlacement, resourceId: ResourceId): boolean {
    return this.findAdjacentDepositForStation(station, resourceId) !== null
  }

  consumeAdjacentDepositForStation(station: StationPlacement, resourceId: ResourceId): boolean {
    const deposit = this.findAdjacentDepositForStation(station, resourceId)
    if (!deposit) return false

    deposit.consumed = true
    this.depositsByPos.delete(key(deposit.x, deposit.y))
    return true
  }

  private placeStationAt(x: number, y: number, transitionId: string): StationPlacement | null {
    if (!this.isInBounds(x, y)) return null
    if (this.isOccupied(x, y)) return null

    const station: StationPlacement = {
      id: `station_${String(this.nextStationSeq++).padStart(4, '0')}`,
      x,
      y,
      transitionId,
    }

    this.stationsById.set(station.id, station)
    this.stationPosToId.set(key(x, y), station.id)
    return station
  }

  private isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height
  }

  private isOccupied(x: number, y: number): boolean {
    return this.stationPosToId.has(key(x, y))
  }

  private generateDeposits(): void {
    const counts: Record<ResourceId, number> = {
      lunar_helium3: 10,
      lunar_hydrogen: 20,
      lunar_oxygen: 15,
      lunar_regolith: 30,
    }

    for (const resourceId of Object.keys(counts) as ResourceId[]) {
      const count = counts[resourceId]
      let created = 0
      let i = 0
      while (created < count) {
        const x = Math.floor(this.rng.next() * this.width)
        const y = Math.floor(this.rng.next() * this.height)
        i++

        const posKey = key(x, y)
        if (this.depositsByPos.has(posKey)) continue

        const deposit: ResourceDeposit = {
          id: `deposit_${resourceId}_${created}`,
          x,
          y,
          resourceId,
          consumed: false,
        }

        this.deposits.push(deposit)
        this.depositsByPos.set(posKey, deposit)
        created++

        // safety
        if (i > 100000) throw new Error('deposit generation failed')
      }
    }
  }

  private findFirstFreeAdjacent(x: number, y: number): { x: number; y: number } | null {
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
      [x - 1, y - 1],
      [x + 1, y - 1],
      [x - 1, y + 1],
      [x + 1, y + 1],
    ]

    for (const [nx, ny] of neighbors) {
      if (!this.isInBounds(nx, ny)) continue
      if (this.isOccupied(nx, ny)) continue
      return { x: nx, y: ny }
    }

    return null
  }

  private findAdjacentDepositForStation(
    station: StationPlacement,
    resourceId: ResourceId,
  ): ResourceDeposit | null {
    const neighbors = [
      [station.x - 1, station.y],
      [station.x + 1, station.y],
      [station.x, station.y - 1],
      [station.x, station.y + 1],
      [station.x - 1, station.y - 1],
      [station.x + 1, station.y - 1],
      [station.x - 1, station.y + 1],
      [station.x + 1, station.y + 1],
    ]

    for (const [nx, ny] of neighbors) {
      const deposit = this.depositsByPos.get(key(nx, ny))
      if (!deposit) continue
      if (deposit.consumed) continue
      if (deposit.resourceId !== resourceId) continue
      return deposit
    }

    return null
  }
}
