import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildPlaceMetaMap,
  buildTransitionMetaMap,
  getMissingBuildCost,
  getPlaceLabel,
  getStationBuildCost,
  getTransitionLabel,
} from '@/core/build-planning'
import { TierGuideModal } from '@/components/help/TierGuideModal'
import { RuntimeSelectionPanel } from '@/components/runtime/RuntimeSelectionPanel'
import { RuntimeSettingsPopover } from '@/components/runtime/RuntimeSettingsPopover'
import { RuntimeToolIndicator } from '@/components/runtime/RuntimeToolIndicator'
import type { Transition } from '@/core/types'
import type { ResourceId } from '@/core/grid/manager'
import { GRID_CELL_SIZE, GRID_WIDTH } from '@/core/grid/config'
import { PixiCanvas } from '@/components/PixiCanvas'
import { GameLoop } from '@/engine/game-loop'
import { useGameStore } from '@/store/game-store'
import './App.css'

const PIXI_CANVAS_BASE_SIZE = GRID_WIDTH * GRID_CELL_SIZE

function formatBuildCost(transition: Transition, placeMetaById: ReturnType<typeof buildPlaceMetaMap>): string {
  const cost = getStationBuildCost(transition)
  if (cost.length === 0) return 'Free'
  return cost.map(token => `${token.qty} x ${getPlaceLabel(token.place, placeMetaById)}`).join(' + ')
}

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
  const phase = useGameStore(s => s.phase)
  const tokens = useGameStore(s => s.tokens)
  const metadata = useGameStore(s => s.metadata)
  const transitions = useGameStore(s => s.transitions)
  const stations = useGameStore(s => s.stations)
  const autoTickEnabled = useGameStore(s => s.autoTickEnabled)
  const selectedBuildCell = useGameStore(s => s.selectedBuildCell)
  const hoveredBuildCell = useGameStore(s => s.hoveredBuildCell)
  const clearBuildSelection = useGameStore(s => s.clearBuildSelection)
  const buildPalette = useGameStore(s => s.buildPalette)
  const setAutoTickEnabled = useGameStore(s => s.setAutoTickEnabled)
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
  const [canvasZoom, setCanvasZoom] = useState<number>(0.5)
  const [helpOpen, setHelpOpen] = useState(false)

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

  const placeMetaById = useMemo(() => buildPlaceMetaMap(metadata), [metadata])
  const transitionMetaById = useMemo(() => buildTransitionMetaMap(metadata), [metadata])

  const stationCatalog = useMemo(() => {
    return transitions
      .filter(transition => transitionMetaById.get(transition.id)?.kind === 'station')
      .map(transition => {
        const cost = getStationBuildCost(transition)
        const missing = getMissingBuildCost(tokens, cost)
        return {
          id: transition.id,
          name: getTransitionLabel(transition.id, transitionMetaById),
          transition,
          cost,
          affordable: missing.length === 0,
          missing,
        }
      })
      .sort((a, b) => a.id.localeCompare(b.id))
  }, [tokens, transitionMetaById, transitions])

  const stationOptions = useMemo(
    () => stationCatalog.filter(option => option.affordable),
    [stationCatalog],
  )

  const effectiveSelectedStationId = selectedStationId || stationOptions[0]?.id || ''
  const buildPrefix = palettePrefix(buildPalette)
  const buildOptions = useMemo(() => stationCatalog.filter(option => option.id.startsWith(buildPrefix)), [buildPrefix, stationCatalog])
  const buildableOptions = useMemo(() => buildOptions.filter(option => option.affordable), [buildOptions])
  const lockedBuildCount = buildOptions.length - buildableOptions.length
  const activeBuildTransitionId =
    selectedBuildTransitionId && buildableOptions.some(option => option.id === selectedBuildTransitionId)
      ? selectedBuildTransitionId
      : buildableOptions[0]?.id ?? null

  useEffect(() => {
    if (activeBuildTransitionId && activeBuildTransitionId !== selectedBuildTransitionId) {
      setSelectedBuildTransitionId(activeBuildTransitionId)
      return
    }

    if (!activeBuildTransitionId && selectedBuildTransitionId !== null) {
      setSelectedBuildTransitionId(null)
    }
  }, [activeBuildTransitionId, selectedBuildTransitionId, setSelectedBuildTransitionId])

  const activeBuildTransition = useMemo(
    () => buildableOptions.find(option => option.id === activeBuildTransitionId) ?? null,
    [activeBuildTransitionId, buildableOptions],
  )

  const activeStationOption = useMemo(
    () => stationOptions.find(option => option.id === effectiveSelectedStationId) ?? null,
    [effectiveSelectedStationId, stationOptions],
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
    <div className="app-shell min-h-screen">
      <TierGuideModal open={helpOpen} metadata={metadata} transitions={transitions} onClose={() => setHelpOpen(false)} />

      <header className="hud-header panel-surface panel-dark">
        <div>
          <p className="hud-eyebrow">Whitepod control room</p>
          <h1 className="hud-title">Lunar factory control</h1>
        </div>
        <div className="hud-header-actions">
          <div className="hud-topbar-meta">
            <div className="hud-metric"><span>Mode</span><strong>{mode}</strong></div>
            <div className="hud-metric"><span>Phase</span><strong>{statusLabel(phase)}</strong></div>
            <div className="hud-metric"><span>Seed</span><strong>{seed}</strong></div>
          </div>
          <div className="hud-actions">
            <button className="hud-button" onClick={() => setHelpOpen(true)}>Help</button>
            <button
              className="hud-button primary"
              onClick={() => {
                setAutoTickEnabled(true)
                requestSystemTransition('init')
              }}
              disabled={phase !== 'init'}
            >
              Run simulation
            </button>
          </div>
        </div>
      </header>

      <section className="hud-summary panel-surface panel-dark">
        <div className="hud-summary-group">
          <span className="hud-badge">{selectedCellLabel}</span>
          <span className="hud-badge">Stations {stations.length}</span>
          <span className="hud-badge">Tokens {tokenEntries.length}</span>
          <span className="hud-badge">Buildable {buildableOptions.length}</span>
          <span className="hud-badge">{activeBuildTransition ? activeBuildTransition.id : 'No build available'}</span>
        </div>
        <div className="hud-summary-group hud-summary-group--resources">
          {resourceTotals.map(resource => (
            <div key={resource.resourceId} className="hud-resource-pill">
              <span>{resource.resourceId.replace('lunar_', '')}</span>
              <strong>{resource.count}</strong>
            </div>
          ))}
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
                <button className="hud-button" onClick={() => requestSystemTransition('launch')}>Launch rocket</button>
                <button className="hud-button" onClick={() => requestSystemTransition('terminate')}>Terminate</button>
                <button className="hud-button" onClick={() => tick()}>Tick now</button>
              </div>
            </div>
          </section>

          <section className="panel-surface panel-dark hud-panel hud-panel--fill">
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
              <div className="hud-muted">{buildableOptions.length} buildable{lockedBuildCount > 0 ? ` · ${lockedBuildCount} locked` : ''}</div>
            </div>
            <div className="hud-panel-scroll hud-panel-scroll--grow">
              <div className="hud-library-scroll">
                <div className="hud-chip-list">
                  {buildableOptions.length === 0 ? (
                    <div className="hud-empty-state">
                      <strong>No buildable stations in this palette.</strong>
                      <span>Open Help to see which tiered resources you need to stock next.</span>
                    </div>
                  ) : (
                    buildableOptions.map(option => (
                      <button
                        key={option.id}
                        className={`hud-chip ${activeBuildTransitionId === option.id ? 'is-active' : ''}`}
                        onClick={() => setSelectedBuildTransitionId(option.id)}
                        title={option.name}
                      >
                        <span>{option.name}</span>
                        <small>{option.id}</small>
                        <small>{formatBuildCost(option.transition, placeMetaById)}</small>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
            <p className="hud-muted hud-panel-note">
              Click a grid cell to place {activeBuildTransition ? activeBuildTransition.name : 'the selected build'}.
            </p>
            <p className="hud-muted hud-panel-note">
              {selectedBuildCell
                ? `Cell ${selectedBuildCell.x}, ${selectedBuildCell.y}`
                : hoveredBuildCell
                  ? `Hover ${hoveredBuildCell.x}, ${hoveredBuildCell.y}`
                  : 'Select a grid cell to inspect.'}
            </p>
          </section>
        </aside>

        <section className="panel-surface panel-dark hud-viewport">
          <div className="panel-header panel-header--dark">
            <h2>Factory Grid</h2>
            <div className="hud-viewport-meta">
              <span className="hud-badge">{selectedCellLabel}</span>
              <span className="hud-badge">{activeBuildTransition ? activeBuildTransition.name : 'Select a build'}</span>
              <div className="hud-zoom-group">
                <button className="hud-button" onClick={() => setCanvasZoom(z => Math.max(0.25, Math.round((z - 0.125) * 1000) / 1000))}>-</button>
                <span className="hud-badge">Zoom {Math.round(canvasZoom * 100)}%</span>
                <button className="hud-button" onClick={() => setCanvasZoom(z => Math.min(1.25, Math.round((z + 0.125) * 1000) / 1000))}>+</button>
                <button className="hud-button" onClick={() => setCanvasZoom(0.5)}>Reset</button>
              </div>
            </div>
          </div>
          <div className="hud-viewport-body">
            <div
              className="relative flex-none"
              style={{
                width: `${PIXI_CANVAS_BASE_SIZE * canvasZoom}px`,
                height: `${PIXI_CANVAS_BASE_SIZE * canvasZoom}px`,
              }}
            >
              <PixiCanvas className="canvas-stage" />
              <RuntimeToolIndicator />
              <RuntimeSelectionPanel />
              <div className="pointer-events-auto absolute right-3 top-3 z-20">
                <RuntimeSettingsPopover
                  autoTickEnabled={autoTickEnabled}
                  onToggleAutoTick={() => setAutoTickEnabled(!autoTickEnabled)}
                  onResetSave={resetSave}
                  onNewGame={() => {
                    const nextSeed = Number.parseInt(seedInput, 10)
                    if (!Number.isInteger(nextSeed)) return
                    newGame(nextSeed)
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <aside className="hud-sidebar hud-sidebar--right">
          <section className="panel-surface panel-dark hud-panel hud-panel--fill">
            <div className="panel-header panel-header--dark">
              <h2>Stations</h2>
              <span className="hud-badge">Placement</span>
            </div>
            <div className="hud-stack hud-stack--fill">
              <div className="hud-row">
                <select className="hud-select hud-select-wide" value={effectiveSelectedStationId} onChange={e => setSelectedStationId(e.target.value)}>
                  {stationOptions.map(option => (
                    <option key={option.id} value={option.id}>
                      {option.id} — {option.name}
                    </option>
                  ))}
                </select>
                <button className="hud-button primary" disabled={!effectiveSelectedStationId} onClick={() => effectiveSelectedStationId && placeStation(effectiveSelectedStationId)}>Place</button>
              </div>
              {activeStationOption ? (
                <p className="hud-muted hud-panel-note">Placement cost: {formatBuildCost(activeStationOption.transition, placeMetaById)}</p>
              ) : (
                <p className="hud-muted hud-panel-note">Stock more resources to unlock another station.</p>
              )}
              <div className="hud-panel-scroll hud-panel-scroll--grow">
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
            </div>
          </section>

          <section className="panel-surface panel-dark hud-panel hud-panel--fill">
            <div className="panel-header panel-header--dark">
              <h2>Tokens</h2>
              <span className="hud-badge">Non-zero</span>
            </div>
            <div className="hud-panel-scroll hud-panel-scroll--grow">
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
            </div>
          </section>
        </aside>
      </main>
    </div>
  )
}

export default App
