import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResourceId } from '@/core/grid/manager'
import { PixiCanvas } from '@/components/PixiCanvas'
import { PetriNetDebugger } from '@/components/debug/PetriNetDebugger'
import { GameLoop } from '@/engine/game-loop'
import { useGameStore } from '@/store/game-store'
import './App.css'

const PIXI_CANVAS_BASE_SIZE = 128 * 12
const PALETTE_ORDER = ['extractor', 'conveyor', 'factory', 'storage'] as const
const TOKEN_GROUP_ORDER = ['Control', 'Surface', 'Bus', 'Stock', 'Other'] as const

type HudCategory = (typeof PALETTE_ORDER)[number]

function statusLabel(phase: string): string {
  switch (phase) {
    case 'initializing':
      return 'Initializing'
    case 'running':
      return 'Running'
    case 'done':
      return 'Completed'
    case 'terminated':
      return 'Terminated'
    default:
      return phase
  }
}

const RESOURCE_ORDER: ResourceId[] = ['lunar_helium3', 'lunar_hydrogen', 'lunar_oxygen', 'lunar_regolith']

function paletteLabel(kind: HudCategory): string {
  switch (kind) {
    case 'extractor':
      return 'Extractors'
    case 'conveyor':
      return 'Conveyors'
    case 'factory':
      return 'Factories'
    case 'storage':
      return 'Storage'
  }
}

function palettePrefix(kind: HudCategory): string {
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

function stationCategoryFromTransitionId(transitionId: string): HudCategory {
  if (transitionId.startsWith('extract__')) return 'extractor'
  if (transitionId.startsWith('convey__')) return 'conveyor'
  if (transitionId.startsWith('store__')) return 'storage'
  return 'factory'
}

function tokenGroupLabel(place: string): (typeof TOKEN_GROUP_ORDER)[number] {
  if (place === 'start' || place === 'run' || place === 'done') return 'Control'
  if (place.endsWith('_surface')) return 'Surface'
  if (place.endsWith('_bus')) return 'Bus'
  if (place.endsWith('_stock')) return 'Stock'
  return 'Other'
}

function App() {
  const loadSystem = useGameStore(s => s.loadSystem)
  const mode = useGameStore(s => s.mode)
  const setMode = useGameStore(s => s.setMode)
  const phase = useGameStore(s => s.phase)
  const tokens = useGameStore(s => s.tokens)
  const metadata = useGameStore(s => s.metadata)
  const stations = useGameStore(s => s.stations)
  const selectedBuildCell = useGameStore(s => s.selectedBuildCell)
  const hoveredBuildCell = useGameStore(s => s.hoveredBuildCell)
  const clearBuildSelection = useGameStore(s => s.clearBuildSelection)
  const buildPalette = useGameStore(s => s.buildPalette)
  const setBuildPalette = useGameStore(s => s.setBuildPalette)
  const selectedBuildTransitionId = useGameStore(s => s.selectedBuildTransitionId)
  const setSelectedBuildTransitionId = useGameStore(s => s.setSelectedBuildTransitionId)
  const placeStation = useGameStore(s => s.placeStation)
  const removeStation = useGameStore(s => s.removeStation)
  const requestSystemTransition = useGameStore(s => s.requestSystemTransition)
  const tick = useGameStore(s => s.tick)
  const resetSave = useGameStore(s => s.resetSave)
  const newGame = useGameStore(s => s.newGame)
  const seed = useGameStore(s => s.seed)

  const loopRef = useRef<GameLoop | null>(null)
  const [selectedStationId, setSelectedStationId] = useState<string>('')
  const [seedInput, setSeedInput] = useState<string>(String(seed))
  const [canvasZoom, setCanvasZoom] = useState<number>(0.625)
  const [debugOpen, setDebugOpen] = useState<boolean>(false)

  useEffect(() => {
    setSeedInput(String(seed))
  }, [seed])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      await loadSystem()
      if (cancelled) return

      const loop = new GameLoop()
      loop.start()
      loopRef.current = loop
    }

    boot()

    return () => {
      cancelled = true
      loopRef.current?.stop()
      loopRef.current = null
    }
  }, [loadSystem])

  useEffect(() => {
    if (mode !== 'debug' && debugOpen) {
      setDebugOpen(false)
    }
  }, [debugOpen, mode])

  const stationOptions = useMemo(() => {
    const transitions = metadata?.gameSystem.transitions ?? []
    return transitions
      .filter(t => t.kind === 'station' && t.activation === 'placed')
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
  }, [metadata])

  const effectiveSelectedStationId = selectedStationId || stationOptions[0]?.id || ''
  const buildPrefix = palettePrefix(buildPalette)
  const buildOptions = useMemo(
    () => (metadata?.gameSystem.transitions ?? []).filter(t => t.id.startsWith(buildPrefix)).sort((a, b) => a.id.localeCompare(b.id)),
    [buildPrefix, metadata],
  )
  const activeBuildTransitionId =
    selectedBuildTransitionId && selectedBuildTransitionId.startsWith(buildPrefix)
      ? selectedBuildTransitionId
      : buildOptions[0]?.id ?? null

  useEffect(() => {
    if (activeBuildTransitionId && activeBuildTransitionId !== selectedBuildTransitionId) {
      setSelectedBuildTransitionId(activeBuildTransitionId)
    }
  }, [activeBuildTransitionId, selectedBuildTransitionId, setSelectedBuildTransitionId])

  const activeBuildTransition = useMemo(
    () => buildOptions.find(t => t.id === activeBuildTransitionId) ?? null,
    [activeBuildTransitionId, buildOptions],
  )

  const tokenEntries = useMemo(
    () => Object.entries(tokens).filter(([, value]) => value > 0).sort(([a], [b]) => a.localeCompare(b)),
    [tokens],
  )

  const tokenGroups = useMemo(() => {
    const grouped = new Map<(typeof TOKEN_GROUP_ORDER)[number], Array<[string, number]>>()
    for (const group of TOKEN_GROUP_ORDER) grouped.set(group, [])

    for (const entry of tokenEntries) {
      grouped.get(tokenGroupLabel(entry[0]))?.push(entry)
    }

    return TOKEN_GROUP_ORDER.map(group => ({
      label: group,
      entries: grouped.get(group) ?? [],
    })).filter(group => group.entries.length > 0)
  }, [tokenEntries])

  const stationGroups = useMemo(() => {
    const grouped = new Map<HudCategory, typeof stations>()
    for (const kind of PALETTE_ORDER) grouped.set(kind, [])

    for (const station of stations) {
      const category = stationCategoryFromTransitionId(station.transitionId)
      grouped.get(category)?.push(station)
    }

    return PALETTE_ORDER.map(kind => ({
      kind,
      label: paletteLabel(kind),
      stations: grouped.get(kind) ?? [],
    })).filter(group => group.stations.length > 0)
  }, [stations])

  const resourceTotals = RESOURCE_ORDER.map(resourceId => ({
    resourceId,
    count: Object.entries(tokens)
      .filter(([place]) => place.startsWith(resourceId))
      .reduce((sum, [, qty]) => sum + qty, 0),
  }))

  const selectedCellLabel = selectedBuildCell
    ? `Cell ${selectedBuildCell.x}, ${selectedBuildCell.y}`
    : hoveredBuildCell
      ? `Hover ${hoveredBuildCell.x}, ${hoveredBuildCell.y}`
      : 'No cell selected'

  const toggleDebug = () => {
    if (mode === 'debug' && debugOpen) {
      setDebugOpen(false)
      setMode('player')
      return
    }

    if (mode === 'debug') {
      setDebugOpen(true)
      return
    }

    setMode('debug')
    setDebugOpen(true)
  }

  return (
    <div className="app-shell min-h-screen">
      <header className="hud-header panel-surface panel-dark">
        <div>
          <p className="hud-eyebrow">Whitepod control room</p>
          <h1 className="hud-title">Lunar factory control</h1>
        </div>
        <div className="hud-topbar-meta">
          <div className="hud-metric"><span>Mode</span><strong>{mode}</strong></div>
          <div className="hud-metric"><span>Phase</span><strong>{statusLabel(phase)}</strong></div>
          <div className="hud-metric"><span>Seed</span><strong>{seed}</strong></div>
        </div>
      </header>

      <section className="hud-summary panel-surface panel-dark">
        <div className="hud-summary-block">
          <div className="hud-menu-group-title">Selection</div>
          <div className="hud-summary-group">
            <span className="hud-badge">{selectedCellLabel}</span>
            <span className="hud-badge">{activeBuildTransition ? activeBuildTransition.id : 'No build selected'}</span>
          </div>
        </div>
        <div className="hud-summary-block">
          <div className="hud-menu-group-title">Factory</div>
          <div className="hud-summary-group">
            <span className="hud-badge">Stations {stations.length}</span>
            <span className="hud-badge">Tokens {tokenEntries.length}</span>
            <span className="hud-badge">Build {buildOptions.length}</span>
          </div>
        </div>
        <div className="hud-summary-block hud-summary-block--wide">
          <div className="hud-menu-group-title">Resources</div>
          <div className="hud-summary-group hud-summary-group--resources">
            {resourceTotals.map(resource => (
              <div key={resource.resourceId} className="hud-resource-pill">
                <span>{resource.resourceId.replace('lunar_', '')}</span>
                <strong>{resource.count}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <main className="hud-main">
        <aside className="hud-sidebar hud-sidebar--left">
          <section className="panel-surface panel-dark hud-panel">
            <div className="panel-header panel-header--dark">
              <h2>Session</h2>
              <span className="hud-badge">Live</span>
            </div>
            <div className="hud-stack">
              <div className="hud-menu-group">
                <div className="hud-menu-group-title">Seed</div>
                <label className="hud-field">
                  <span>Seed</span>
                  <input className="hud-input" value={seedInput} onChange={e => setSeedInput(e.target.value)} />
                </label>
              </div>

              <div className="hud-menu-group">
                <div className="hud-menu-group-title">Session actions</div>
                <div className="hud-actions">
                  <button className="hud-button primary" onClick={() => {
                    const nextSeed = Number.parseInt(seedInput, 10)
                    if (!Number.isInteger(nextSeed)) return
                    newGame(nextSeed)
                  }}>
                    New game
                  </button>
                  <button className="hud-button" onClick={() => resetSave()}>Reset save</button>
                </div>
              </div>

              <div className="hud-menu-group">
                <div className="hud-menu-group-title">Simulation</div>
                <div className="hud-actions hud-actions--dense">
                  <button className="hud-button" onClick={() => requestSystemTransition('init')}>Init</button>
                  <button className="hud-button" onClick={() => requestSystemTransition('launch')}>Launch</button>
                  <button className="hud-button" onClick={() => requestSystemTransition('terminate')}>Terminate</button>
                  <button className="hud-button" onClick={() => tick()}>Tick now</button>
                </div>
              </div>
            </div>
          </section>

          <section className="panel-surface panel-dark hud-panel hud-panel--fill">
            <div className="panel-header panel-header--dark">
              <h2>Build Library</h2>
              <button className="hud-link" onClick={() => clearBuildSelection()}>Clear</button>
            </div>

            <div className="hud-menu-group">
              <div className="hud-menu-group-title">Categories</div>
              <div className="hud-actions hud-actions--dense">
                {PALETTE_ORDER.map(kind => (
                  <button
                    key={kind}
                    className={`hud-button ${buildPalette === kind ? 'primary' : ''}`}
                    onClick={() => setBuildPalette(kind)}
                  >
                    {paletteLabel(kind)}
                  </button>
                ))}
              </div>
            </div>

            <div className="hud-menu-group">
              <div className="hud-library-header">
                <div>
                  <div className="hud-menu-group-title">Blueprints</div>
                  <div className="hud-library-title">{paletteLabel(buildPalette)}</div>
                </div>
                <div className="hud-muted">{buildOptions.length} available</div>
              </div>
              <div className="hud-panel-scroll hud-panel-scroll--grow">
                <div className="hud-library-scroll">
                  <div className="hud-chip-list">
                    {buildOptions.map(option => (
                      <button
                        key={option.id}
                        className={`hud-chip ${activeBuildTransitionId === option.id ? 'is-active' : ''}`}
                        onClick={() => setSelectedBuildTransitionId(option.id)}
                        title={option.name_fr ?? option.id}
                      >
                        <span>{option.name_fr ?? option.id}</span>
                        <small>{option.id}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="hud-menu-group">
              <div className="hud-menu-group-title">Placement</div>
              <p className="hud-muted hud-panel-note">
                Click a grid cell to place {activeBuildTransition ? activeBuildTransition.name_fr ?? activeBuildTransition.id : 'the selected build'}.
              </p>
              <p className="hud-muted hud-panel-note">
                {selectedBuildCell
                  ? `Cell ${selectedBuildCell.x}, ${selectedBuildCell.y}`
                  : hoveredBuildCell
                    ? `Hover ${hoveredBuildCell.x}, ${hoveredBuildCell.y}`
                    : 'Select a grid cell to inspect.'}
              </p>
            </div>
          </section>
        </aside>

        <section className="panel-surface panel-dark hud-viewport">
          <div className="panel-header panel-header--dark">
            <h2>Factory Grid</h2>
            <div className="hud-viewport-meta">
              <span className="hud-badge">{selectedCellLabel}</span>
              <span className="hud-badge">{activeBuildTransition ? activeBuildTransition.name_fr ?? activeBuildTransition.id : 'Select a build'}</span>
            </div>
          </div>
          <div className="hud-viewport-body">
            <PixiCanvas
              className="canvas-stage"
              style={{
                width: `${PIXI_CANVAS_BASE_SIZE * canvasZoom}px`,
                height: `${PIXI_CANVAS_BASE_SIZE * canvasZoom}px`,
              }}
            />
          </div>
        </section>

        <aside className="hud-sidebar hud-sidebar--right">
          <section className="panel-surface panel-dark hud-panel hud-panel--fill">
            <div className="panel-header panel-header--dark">
              <h2>Stations</h2>
              <span className="hud-badge">Placement</span>
            </div>
            <div className="hud-stack hud-stack--fill">
              <div className="hud-menu-group">
                <div className="hud-menu-group-title">Placement</div>
                <div className="hud-row">
                  <select className="hud-select hud-select-wide" value={effectiveSelectedStationId} onChange={e => setSelectedStationId(e.target.value)}>
                    {stationOptions.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.id}{t.name_fr ? ` — ${t.name_fr}` : ''}
                      </option>
                    ))}
                  </select>
                  <button className="hud-button primary" onClick={() => effectiveSelectedStationId && placeStation(effectiveSelectedStationId)}>Place</button>
                </div>
              </div>

              <div className="hud-panel-scroll hud-panel-scroll--grow">
                {stationGroups.length === 0 ? (
                  <p className="hud-muted">No stations placed.</p>
                ) : (
                  stationGroups.map(group => (
                    <div key={group.kind} className="hud-menu-group">
                      <div className="hud-menu-group-title">{group.label}</div>
                      <div className="hud-chip-list compact">
                        {group.stations.map(station => (
                          <button key={station.id} className="hud-chip" onClick={() => removeStation(station.id)} title="Remove station">
                            {station.id} · {station.transitionId} @({station.x},{station.y})
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="panel-surface panel-dark hud-panel hud-panel--fill">
            <div className="panel-header panel-header--dark">
              <h2>Tokens</h2>
              <span className="hud-badge">Non-zero</span>
            </div>
            <div className="hud-panel-scroll hud-panel-scroll--grow">
              {tokenGroups.length === 0 ? (
                <p className="hud-muted">No active tokens.</p>
              ) : (
                tokenGroups.map(group => (
                  <div key={group.label} className="hud-menu-group">
                    <div className="hud-menu-group-title">{group.label}</div>
                    <div className="token-grid">
                      {group.entries.map(([key, value]) => (
                        <div key={key} className="token-card">
                          <span>{key}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </main>

      {debugOpen ? (
        <section className="hud-debug panel-surface panel-dark">
          <div className="panel-header panel-header--dark">
            <h2>Debug Console</h2>
            <div className="hud-actions hud-actions--dense">
              <span className="hud-badge">Petri net</span>
              <button className="hud-button" onClick={toggleDebug}>Close debug</button>
            </div>
          </div>
          <PetriNetDebugger />
        </section>
      ) : null}

      <footer className="hud-footer panel-surface panel-dark">
        <div className="hud-footer-left">
          <div className="hud-menu-group hud-menu-group--inline">
            <div className="hud-menu-group-title">Status</div>
            <div className="hud-actions hud-actions--dense">
              <span className="hud-badge">{statusLabel(phase)}</span>
              <span className="hud-badge">Seed {seed}</span>
              <span className="hud-badge">{mode === 'debug' ? 'Debug HUD' : 'Player HUD'}</span>
            </div>
          </div>
        </div>
        <div className="hud-footer-right">
          <div className="hud-menu-group hud-menu-group--inline">
            <div className="hud-menu-group-title">View</div>
            <div className="hud-zoom-group">
              <button className="hud-button" onClick={() => setCanvasZoom(z => Math.max(0.25, Math.round((z - 0.125) * 1000) / 1000))}>-</button>
              <span className="hud-badge">Zoom {Math.round(canvasZoom * 100)}%</span>
              <button className="hud-button" onClick={() => setCanvasZoom(z => Math.min(1.5, Math.round((z + 0.125) * 1000) / 1000))}>+</button>
              <button className="hud-button" onClick={() => setCanvasZoom(0.625)}>Reset</button>
            </div>
          </div>

          <div className="hud-menu-group hud-menu-group--inline">
            <div className="hud-menu-group-title">Tools</div>
            <div className="hud-actions hud-actions--dense">
              <button className={`hud-button ${mode === 'debug' ? 'primary' : ''}`} onClick={toggleDebug}>
                {mode === 'debug' && debugOpen ? 'Return to player' : mode === 'debug' ? 'Show debug' : 'Open debug'}
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
