import { describe, expect, it } from 'vitest'
import { GridManager } from './manager'

describe('GridManager snapshots', () => {
  it('roundtrips deposits and stations', () => {
    const grid1 = new GridManager()
    grid1.initialize(1)

    const station = grid1.placeStationNearDeposit('lunar_hydrogen', 'extract__lunar_hydrogen')
    expect(station).not.toBeNull()

    const depositId = grid1.reserveAdjacentDepositForStation(station!, 'lunar_hydrogen', 0)
    expect(depositId).toBeTruthy()

    const before = grid1.countAvailableUnits('lunar_hydrogen')
    grid1.consumeReservedDeposit(depositId!)
    expect(grid1.countAvailableUnits('lunar_hydrogen')).toBe(before - 1)

    const snap = grid1.getSnapshot()

    const grid2 = new GridManager()
    grid2.initialize(1)
    grid2.loadSnapshot(snap)

    expect(grid2.listStations()).toEqual(grid1.listStations())
    expect(grid2.countAvailableUnits('lunar_hydrogen')).toBe(grid1.countAvailableUnits('lunar_hydrogen'))
  })
})
