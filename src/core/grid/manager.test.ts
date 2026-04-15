import { describe, expect, it } from 'vitest'
import { GridManager } from './manager'

describe('GridManager extraction gating', () => {
  it('only allows extraction when deposit adjacent', () => {
    const grid = new GridManager()
    grid.initialize(1)

    const station = grid.placeStationNearDeposit('lunar_hydrogen', 'extract__lunar_hydrogen')
    expect(station).not.toBeNull()

    const placed = station!
    expect(grid.canExtractAtStation(placed, 'lunar_hydrogen')).toBe(true)

    const consumed = grid.consumeAdjacentDepositForStation(placed, 'lunar_hydrogen')
    expect(consumed).toBe(true)

    expect(grid.canExtractAtStation(placed, 'lunar_hydrogen')).toBe(false)
  })
})
