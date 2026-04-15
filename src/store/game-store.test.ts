import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function createLocalStorageMock() {
  const data = new Map<string, string>()

  return {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value)
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key)
    }),
    clear: vi.fn(() => {
      data.clear()
    }),
  }
}

describe('useGameStore persistence hydrate', () => {
  let storage: ReturnType<typeof createLocalStorageMock>

  beforeEach(() => {
    vi.resetModules()
    storage = createLocalStorageMock()
    vi.stubGlobal('localStorage', storage)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
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

    storage.setItem('whitepod-save', JSON.stringify(savedState))

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

    const { useGameStore } = await import('./game-store')
    await useGameStore.getState().loadSystem()

    const afterLoad = storage.setItem.mock.calls.length

    useGameStore.getState().tick()
    expect(storage.setItem.mock.calls.length).toBe(afterLoad)

    useGameStore.getState().placeStation('extract__lunar_hydrogen')
    expect(storage.setItem.mock.calls.length).toBeGreaterThan(afterLoad)

    const afterPlacement = storage.setItem.mock.calls.length

    for (let i = 0; i < 28; i++) {
      useGameStore.getState().tick()
    }
    expect(storage.setItem.mock.calls.length).toBe(afterPlacement)

    useGameStore.getState().tick()
    expect(storage.setItem.mock.calls.length).toBeGreaterThan(afterPlacement)
  })

  it('flushes a requested system transition immediately', async () => {
    const transitions = [
      { id: 'init', consumes: [{ place: 'start', qty: 1 }], produces: [{ place: 'run', qty: 1 }] },
      { id: 'launch', consumes: [{ place: 'run', qty: 1 }], produces: [{ place: 'done', qty: 1 }] },
      { id: 'terminate', consumes: [{ place: 'done', qty: 1 }], produces: [] },
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

    const before = JSON.parse(storage.getItem('whitepod-save') ?? 'null')
    expect(before.state.saveRevision).toBe(1)

    useGameStore.getState().requestSystemTransition('launch')

    const after = JSON.parse(storage.getItem('whitepod-save') ?? 'null')
    expect(after.state.saveRevision).toBe(2)
  })

  it('drops invalid persisted saves during hydration', async () => {
    storage.setItem(
      'whitepod-save',
      JSON.stringify({
        state: {
          mode: 'player',
          seed: 1,
          autosaveTickIndex: 4,
          saveRevision: 1,
          engineSnapshot: {
            tokens: { run: 1 },
            terminated: false,
          },
          gridSnapshot: {
            version: 2,
            rngState: 123,
            nextStationSeq: 1,
            deposits: [],
            stations: [],
          },
        },
        version: 1,
      }),
    )

    const transitions = [
      { id: 'init', consumes: [{ place: 'start', qty: 1 }], produces: [{ place: 'run', qty: 1 }] },
      { id: 'launch', consumes: [{ place: 'run', qty: 1 }], produces: [{ place: 'done', qty: 1 }] },
      { id: 'terminate', consumes: [{ place: 'done', qty: 1 }], produces: [] },
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

    expect(useGameStore.getState().tickIndex).toBe(0)
    expect(useGameStore.getState().gridSnapshot?.version).toBe(1)

    const stored = JSON.parse(storage.getItem('whitepod-save') ?? 'null')
    expect(stored.state.gridSnapshot.version).toBe(1)
    expect(stored.state.saveRevision).toBeGreaterThanOrEqual(1)
  })

  it('exports sparse Pixi data with deposits, stations and layer tokens', async () => {
    const transitions = [
      { id: 'init', consumes: [{ place: 'start', qty: 1 }], produces: [{ place: 'run', qty: 1 }] },
      { id: 'launch', consumes: [{ place: 'run', qty: 1 }], produces: [{ place: 'done', qty: 1 }] },
      { id: 'terminate', consumes: [{ place: 'done', qty: 1 }], produces: [] },
      {
        id: 'extract__lunar_hydrogen',
        consumes: [{ place: 'run', qty: 1 }],
        produces: [
          { place: 'run', qty: 1 },
          { place: 'lunar_hydrogen_surface', qty: 2 },
          { place: 'lunar_hydrogen_bus', qty: 3 },
          { place: 'lunar_hydrogen_stock', qty: 4 },
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

    const { useGameStore } = await import('./game-store')
    await useGameStore.getState().loadSystem()

    const station = useGameStore.getState().grid.placeStationNearDeposit('lunar_hydrogen', 'extract__lunar_hydrogen')
    expect(station).not.toBeNull()

    const exportData = useGameStore.getState().getPixiExport()

    expect(exportData.grid.cells.length).toBeGreaterThan(0)
    expect(exportData.grid.deposits.length).toBeGreaterThan(0)
    expect(exportData.grid.stations.length).toBe(2)
    expect(exportData.grid.stations.every(station => station.active)).toBe(true)
    expect(exportData.layerTokens.surface).toEqual({})
    expect(exportData.layerTokens.bus).toEqual({})
    expect(exportData.layerTokens.stock).toEqual({})
  })
})
