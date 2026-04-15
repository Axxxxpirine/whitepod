import { describe, expect, it } from 'vitest'
import { GridManager } from './manager'

describe('GridManager extraction gating', () => {
  it('reserves one unit per deposit per tick', () => {
    const grid = new GridManager()
    grid.initialize(1)

    const station = grid.placeStationNearDeposit('lunar_hydrogen', 'extract__lunar_hydrogen')
    expect(station).not.toBeNull()

    const placed = station!

    const before = grid.countAvailableUnits('lunar_hydrogen')

    const depositIdTick0 = grid.reserveAdjacentDepositForStation(placed, 'lunar_hydrogen', 0)
    expect(depositIdTick0).toBeTruthy()

    const depositIdTick0Second = grid.reserveAdjacentDepositForStation(placed, 'lunar_hydrogen', 0)
    expect(depositIdTick0Second).toBeNull()

    grid.consumeReservedDeposit(depositIdTick0!)
    expect(grid.countAvailableUnits('lunar_hydrogen')).toBe(before - 1)

    const depositIdTick1 = grid.reserveAdjacentDepositForStation(placed, 'lunar_hydrogen', 1)
    expect(depositIdTick1).toBeTruthy()

    grid.consumeReservedDeposit(depositIdTick1!)
    expect(grid.countAvailableUnits('lunar_hydrogen')).toBe(before - 2)
  })
})
