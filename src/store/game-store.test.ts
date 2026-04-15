import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('useGameStore persistence hydrate', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('hydrates engine and grid from saved snapshots', async () => {
    const savedState = {
      state: {
        mode: 'player',
        seed: 1,
        tickIndex: 7,
        engineSnapshot: {
          tokens: { run: 1, foo: 2 },
          terminated: false,
        },
        gridSnapshot: {
          version: 1,
          rngState: 123,
          nextStationSeq: 2,
          deposits: [
            {
              id: 'deposit_lunar_hydrogen_0',
              x: 10,
              y: 10,
              resourceId: 'lunar_hydrogen',
              remaining: 3,
            },
          ],
          stations: [{ id: 'station_0001', x: 9, y: 10, transitionId: 'extract__lunar_hydrogen' }],
        },
      },
      version: 0,
    }

    localStorage.setItem('whitepod-save', JSON.stringify(savedState))

    const transitions = [
      { id: 'init', consumes: [{ place: 'start', qty: 1 }], produces: [{ place: 'run', qty: 1 }] },
      { id: 'launch', consumes: [{ place: 'run', qty: 1 }], produces: [{ place: 'done', qty: 1 }] },
      { id: 'terminate', consumes: [{ place: 'done', qty: 1 }], produces: [] },
      {
        id: 'extract__lunar_hydrogen',
        consumes: [{ place: 'run', qty: 1 }],
        produces: [
          { place: 'run', qty: 1 },
          { place: 'lunar_hydrogen_surface', qty: 1 },
        ],
      },
      {
        id: 'drain__lunar_hydrogen_surface',
        consumes: [
          { place: 'done', qty: 1 },
          { place: 'lunar_hydrogen_surface', qty: 1 },
        ],
        produces: [{ place: 'done', qty: 1 }],
      },
    ]

    const metadata = {
      version: 1,
      canonical: { places: [], transitions: [] },
      gameSystem: {
        places: [],
        transitions: [],
        resources: [],
        grid: {
          depositConfig: {
            lunar_helium3: { depositCount: 1, depositCapacity: 1 },
            lunar_hydrogen: { depositCount: 1, depositCapacity: 3 },
            lunar_oxygen: { depositCount: 1, depositCapacity: 1 },
            lunar_regolith: { depositCount: 1, depositCapacity: 1 },
          },
        },
      },
    }

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('game-system.transitions.json')) {
        return { ok: true, json: async () => transitions }
      }
      if (url.includes('metadata.json')) {
        return { ok: true, json: async () => metadata }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    }))

    const { useGameStore } = await import('./game-store')

    await useGameStore.getState().loadSystem()

    expect(useGameStore.getState().autosaveTickIndex).toBe(7)
    expect(useGameStore.getState().tickIndex).toBe(7)
    expect(useGameStore.getState().tokens).toEqual({ run: 1, foo: 2 })
    expect(useGameStore.getState().stations.length).toBe(1)
    expect(useGameStore.getState().grid.countAvailableUnits('lunar_hydrogen')).toBe(3)
  })

  it('autosaves every 30 ticks and flushes on placement', async () => {
    const transitions = [
      { id: 'init', consumes: [{ place: 'start', qty: 1 }], produces: [{ place: 'run', qty: 1 }] },
      { id: 'launch', consumes: [{ place: 'run', qty: 1 }], produces: [{ place: 'done', qty: 1 }] },
      { id: 'terminate', consumes: [{ place: 'done', qty: 1 }], produces: [] },
      {
        id: 'extract__lunar_hydrogen',
        consumes: [{ place: 'run', qty: 1 }],
        produces: [
          { place: 'run', qty: 1 },
          { place: 'lunar_hydrogen_surface', qty: 1 },
        ],
      },
    ]

    const metadata = {
      version: 1,
      canonical: { places: [], transitions: [] },
      gameSystem: {
        places: [],
        transitions: [],
        resources: [],
        grid: {
          depositConfig: {
            lunar_helium3: { depositCount: 1, depositCapacity: 1 },
            lunar_hydrogen: { depositCount: 1, depositCapacity: 3 },
            lunar_oxygen: { depositCount: 1, depositCapacity: 1 },
            lunar_regolith: { depositCount: 1, depositCapacity: 1 },
          },
        },
      },
    }

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('game-system.transitions.json')) {
        return { ok: true, json: async () => transitions }
      }
      if (url.includes('metadata.json')) {
        return { ok: true, json: async () => metadata }
      }
      return { ok: false, status: 404, statusText: 'Not Found' }
    }))

    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    const { useGameStore } = await import('./game-store')
    await useGameStore.getState().loadSystem()

    const afterLoad = setItemSpy.mock.calls.length

    useGameStore.getState().tick()
    expect(setItemSpy.mock.calls.length).toBe(afterLoad)

    useGameStore.getState().placeStation('extract__lunar_hydrogen')
    expect(setItemSpy.mock.calls.length).toBeGreaterThan(afterLoad)

    const afterPlacement = setItemSpy.mock.calls.length

    for (let i = 0; i < 28; i++) {
      useGameStore.getState().tick()
    }
    expect(setItemSpy.mock.calls.length).toBe(afterPlacement)

    useGameStore.getState().tick()
    expect(setItemSpy.mock.calls.length).toBeGreaterThan(afterPlacement)
  })
})
