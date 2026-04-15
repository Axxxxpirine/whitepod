export type ResourceId = 'lunar_helium3' | 'lunar_hydrogen' | 'lunar_oxygen' | 'lunar_regolith'

export interface ResourceDeposit {
  id: string
  x: number
  y: number
  resourceId: ResourceId
  remaining: number
  reservedTick: number | null
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

export interface DepositConfig {
  depositCount: number
  depositCapacity: number
}

export type DepositConfigByResourceId = Record<ResourceId, DepositConfig>

export class GridManager {
  readonly width = 128
  readonly height = 128

  private rng: Rng
  private nextStationSeq = 1

  private deposits: ResourceDeposit[]
  private depositsById: Map<string, ResourceDeposit>
  private depositsByPos: Map<string, ResourceDeposit>

  private depositConfig: DepositConfigByResourceId

  private stationsById: Map<string, StationPlacement>
  private stationPosToId: Map<string, string>

  constructor() {
    this.rng = createSeededRng(1)
    this.deposits = []
    this.depositsById = new Map()
    this.depositsByPos = new Map()

    this.depositConfig = {
      lunar_helium3: { depositCount: 10, depositCapacity: 3 },
      lunar_hydrogen: { depositCount: 20, depositCapacity: 5 },
      lunar_oxygen: { depositCount: 15, depositCapacity: 5 },
      lunar_regolith: { depositCount: 30, depositCapacity: 8 },
    }
    this.stationsById = new Map()
    this.stationPosToId = new Map()
  }

  initialize(seed: number, config?: Partial<DepositConfigByResourceId>): void {
    this.rng = createSeededRng(seed)
    if (config) {
      this.depositConfig = { ...this.depositConfig, ...config }
    }
    this.nextStationSeq = 1

    this.deposits = []
    this.depositsById.clear()
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

  listDeposits(options?: { resourceId?: ResourceId; includeDepleted?: boolean }): ResourceDeposit[] {
    const { resourceId, includeDepleted } = options ?? {}
    return this.deposits
      .filter(d => (resourceId ? d.resourceId === resourceId : true))
      .filter(d => (includeDepleted ? true : d.remaining > 0))
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  countAvailableDeposits(resourceId: ResourceId): number {
    let count = 0
    for (const d of this.deposits) {
      if (d.remaining > 0 && d.resourceId === resourceId) count += 1
    }
    return count
  }

  countAvailableUnits(resourceId: ResourceId): number {
    let total = 0
    for (const d of this.deposits) {
      if (d.remaining > 0 && d.resourceId === resourceId) total += d.remaining
    }
    return total
  }

  placeStationNearDeposit(resourceId: ResourceId, transitionId: string): StationPlacement | null {
    const deposit = this.deposits.find(d => d.remaining > 0 && d.resourceId === resourceId)
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

  reserveAdjacentDepositForStation(
    station: StationPlacement,
    resourceId: ResourceId,
    tickIndex: number,
  ): string | null {
    const deposit = this.findAdjacentDepositForStation(station, resourceId, tickIndex)
    if (!deposit) return null

    deposit.reservedTick = tickIndex
    return deposit.id
  }

  reserveAnyDeposit(resourceId: ResourceId, tickIndex: number): string | null {
    const deposit = this.deposits.find(
      d => d.remaining > 0 && d.resourceId === resourceId && d.reservedTick !== tickIndex,
    )
    if (!deposit) return null

    deposit.reservedTick = tickIndex
    return deposit.id
  }

  consumeReservedDeposit(depositId: string): void {
    const deposit = this.depositsById.get(depositId)
    if (!deposit) return

    if (deposit.remaining <= 0) return

    deposit.remaining -= 1
    if (deposit.remaining <= 0) {
      this.depositsById.delete(depositId)
      this.depositsByPos.delete(key(deposit.x, deposit.y))
    }
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
    for (const resourceId of Object.keys(this.depositConfig) as ResourceId[]) {
      const { depositCount, depositCapacity } = this.depositConfig[resourceId]
      const count = depositCount
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
          remaining: depositCapacity,
          reservedTick: null,
        }

        this.deposits.push(deposit)
        this.depositsById.set(deposit.id, deposit)
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
    tickIndex: number,
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
      if (deposit.remaining <= 0) continue
      if (deposit.resourceId !== resourceId) continue
      if (deposit.reservedTick === tickIndex) continue
      return deposit
    }

    return null
  }
}
