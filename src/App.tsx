import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResourceId } from '@/core/grid/manager'
import { PixiCanvas } from '@/components/PixiCanvas'
import { PetriNetDebugger } from '@/components/debug/PetriNetDebugger'
import { GameLoop } from '@/engine/game-loop'
import { useGameStore } from '@/store/game-store'

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

function paletteLabel(kind: 'extractor' | 'conveyor' | 'factory' | 'storage'): string {
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

function palettePrefix(kind: 'extractor' | 'conveyor' | 'factory' | 'storage'): string {
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
  const [canvasZoom, setCanvasZoom] = useState<number>(1.75)
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

  const tokenEntries = Object.entries(tokens)
    .filter(([, value]) => value > 0)
    .sort(([a], [b]) => a.localeCompare(b))

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

  return (
    <div className="app-shell app-shell--overlay min-h-screen">
      <PixiCanvas
        className="canvas-stage canvas-stage--background"
        style={{ transform: `scale(${canvasZoom})`, transformOrigin: 'top left' }}
      />

      <header className="hud-topbar panel-surface panel-dark hud-layer">
        <div>
          <p className="hud-eyebrow">Whitepod control room</p>
          <h1 className="hud-title">Lunar factory control</h1>
        </div>
        <div className="hud-topbar-meta">
          <div className="hud-metric">
            <span>Mode</span>
            <select className="hud-select" value={mode} onChange={e => setMode(e.target.value as 'player' | 'debug')}>
              <option value="player">Player</option>
              <option value="debug">Debug</option>
            </select>
          </div>
          <div className="hud-metric"><span>Phase</span><strong>{statusLabel(phase)}</strong></div>
          <div className="hud-metric"><span>Seed</span><strong>{seed}</strong></div>
        </div>
      </header>

      <div className="hud-status-strip hud-layer panel-surface panel-dark">
        <span className="hud-badge">{selectedCellLabel}</span>
        <span className="hud-badge">Stations {stations.length}</span>
        <span className="hud-badge">Tokens {tokenEntries.length}</span>
        <span className="hud-badge">Build {buildOptions.length}</span>
        <span className="hud-badge">{activeBuildTransition ? activeBuildTransition.id : 'No build selected'}</span>
      </div>

      <div className="hud-resource-strip hud-layer panel-surface panel-dark">
        {resourceTotals.map(resource => (
          <div key={resource.resourceId} className="hud-resource-pill">
            <span>{resource.resourceId.replace('lunar_', '')}</span>
            <strong>{resource.count}</strong>
          </div>
        ))}
      </div>

      <main className="hud-layer-grid hud-layer">
        <aside className="hud-column hud-column--left">
          <section className="panel-surface panel-dark hud-panel">
            <div className="panel-header panel-header--dark">
              <h2>Session</h2>
              <span className="hud-badge">Live</span>
            </div>
            <div className="hud-stack">
              <label className="hud-field">
                <span>Seed</span>
                <input className="hud-input" value={seedInput} onChange={e => setSeedInput(e.target.value)} />
              </label>
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
              <div className="hud-actions hud-actions--dense">
                <button className="hud-button" onClick={() => requestSystemTransition('init')}>Init</button>
                <button className="hud-button" onClick={() => requestSystemTransition('launch')}>Launch</button>
                <button className="hud-button" onClick={() => requestSystemTransition('terminate')}>Terminate</button>
                <button className="hud-button" onClick={() => tick()}>Tick now</button>
              </div>
            </div>
          </section>

          <section className="panel-surface panel-dark hud-panel">
            <div className="panel-header panel-header--dark">
              <h2>Build Library</h2>
              <button className="hud-link" onClick={() => clearBuildSelection()}>Clear</button>
            </div>
            <div className="hud-actions hud-actions--dense">
              {([
                ['extractor', 'Extractor'],
                ['conveyor', 'Conveyor'],
                ['factory', 'Factory'],
                ['storage', 'Storage'],
              ] as const).map(([kind, label]) => (
                <button
                  key={kind}
                  className={`hud-button ${buildPalette === kind ? 'primary' : ''}`}
                  onClick={() => setBuildPalette(kind)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="hud-library-header">
              <div>
                <span className="hud-muted">Active category</span>
                <div className="hud-library-title">{paletteLabel(buildPalette)}</div>
              </div>
              <div className="hud-muted">{buildOptions.length} available</div>
            </div>
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
            <p className="hud-muted">
              Click a grid cell to place {activeBuildTransition ? activeBuildTransition.name_fr ?? activeBuildTransition.id : 'the selected build'}.
            </p>
            <p className="hud-muted">
              {selectedBuildCell
                ? `Cell ${selectedBuildCell.x}, ${selectedBuildCell.y}`
                : hoveredBuildCell
                  ? `Hover ${hoveredBuildCell.x}, ${hoveredBuildCell.y}`
                  : 'Select a grid cell to inspect.'}
            </p>
          </section>
        </aside>

        <aside className="hud-column hud-column--right">
          <section className="panel-surface panel-dark hud-panel">
            <div className="panel-header panel-header--dark">
              <h2>Stations</h2>
              <span className="hud-badge">Placement</span>
            </div>
            <div className="hud-stack">
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
              <div className="hud-chip-list compact">
                {stations.length === 0 ? (
                  <span className="hud-muted">No stations placed.</span>
                ) : (
                  stations.map(s => (
                    <button key={s.id} className="hud-chip" onClick={() => removeStation(s.id)} title="Remove station">
                      {s.id} · {s.transitionId} @({s.x},{s.y})
                    </button>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="panel-surface panel-dark hud-panel">
            <div className="panel-header panel-header--dark">
              <h2>Tokens</h2>
              <span className="hud-badge">Non-zero</span>
            </div>
            {tokenEntries.length === 0 ? (
              <p className="hud-muted">No active tokens.</p>
            ) : (
              <div className="token-grid">
                {tokenEntries.map(([key, value]) => (
                  <div key={key} className="token-card">
                    <span>{key}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </main>

      <footer className="hud-bottom panel-surface panel-dark hud-layer">
        <div className="hud-bottom-left">
          <span className="hud-badge">{statusLabel(phase)}</span>
          <span className="hud-badge">Seed {seed}</span>
          {mode === 'debug' ? <span className="hud-badge hud-badge--accent">Debug</span> : null}
          <span className="hud-badge">Debug via top-right Mode</span>
        </div>
        <div className="hud-bottom-right">
          <div className="hud-zoom-group">
            <button className="hud-button" onClick={() => setCanvasZoom(z => Math.max(0.75, Math.round((z - 0.125) * 1000) / 1000))}>-</button>
            <span className="hud-badge">Zoom {Math.round(canvasZoom * 100)}%</span>
            <button className="hud-button" onClick={() => setCanvasZoom(z => Math.min(2, Math.round((z + 0.125) * 1000) / 1000))}>+</button>
            <button className="hud-button" onClick={() => setCanvasZoom(1.25)}>Reset</button>
          </div>
          <label className="hud-inline-field">
            <span>Mode</span>
            <select className="hud-select" value={mode} onChange={e => setMode(e.target.value as 'player' | 'debug')}>
              <option value="player">Player</option>
              <option value="debug">Debug</option>
            </select>
          </label>
          {mode === 'debug' ? (
            <button className="hud-button primary" onClick={() => setDebugOpen(open => !open)}>
              {debugOpen ? 'Hide debug' : 'Show debug'}
            </button>
          ) : null}
        </div>
      </footer>

      {mode === 'debug' && debugOpen ? <div className="panel-surface panel-dark hud-debug hud-layer"><PetriNetDebugger /></div> : null}
    </div>
  )
}

export default App
