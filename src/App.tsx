import { useEffect, useMemo, useRef, useState } from 'react'
import { PixiCanvas } from '@/components/PixiCanvas'
import { GameLoop } from '@/engine/game-loop'
import { useGameStore } from '@/store/game-store'
import { GridViewport } from '@/components/runtime/GridViewport'
import { HudSection } from '@/components/runtime/HudSection'
import { IconButton } from '@/components/runtime/IconButton'
import { TileCard } from '@/components/runtime/TileCard'
import './App.css'

const PIXI_CANVAS_BASE_SIZE = 128 * 12
const PALETTE_ORDER = ['extractor', 'conveyor', 'factory', 'storage'] as const
const RESOURCE_ORDER = ['lunar_helium3', 'lunar_hydrogen', 'lunar_oxygen', 'lunar_regolith'] as const
const TOKEN_GROUP_ORDER = ['Control', 'Surface', 'Bus', 'Stock', 'Other'] as const

type HudCategory = (typeof PALETTE_ORDER)[number]

function statusLabel(phase: string): string {
  switch (phase) {
    case 'init':
      return 'Booting'
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

function humanizeId(id: string): string {
  return id
    .replace(/^lunar_/, '')
    .replace(/__/g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatTransitionLabel(id: string): string {
  if (id.startsWith('extract__')) return `Extract ${humanizeId(id.slice('extract__'.length))}`
  if (id.startsWith('convey__')) return `Convey ${humanizeId(id.slice('convey__'.length))}`
  if (id.startsWith('recipe__')) return `Recipe ${humanizeId(id.slice('recipe__'.length))}`
  if (id.startsWith('store__')) return `Store ${humanizeId(id.slice('store__'.length))}`
  if (id.startsWith('drain__')) return `Drain ${humanizeId(id.slice('drain__'.length))}`
  return humanizeId(id)
}

function formatResourceLabel(resourceId: string): string {
  return humanizeId(resourceId)
}

function formatCellLabel(cell: { x: number; y: number } | null, hover: { x: number; y: number } | null): string {
  if (cell) return `Cell ${cell.x}, ${cell.y}`
  if (hover) return `Hover ${hover.x}, ${hover.y}`
  return 'No cell selected'
}

function App() {
  const loadSystem = useGameStore((s) => s.loadSystem)
  const mode = useGameStore((s) => s.mode)
  const autoTickEnabled = useGameStore((s) => s.autoTickEnabled)
  const setAutoTickEnabled = useGameStore((s) => s.setAutoTickEnabled)
  const phase = useGameStore((s) => s.phase)
  const tokens = useGameStore((s) => s.tokens)
  const stations = useGameStore((s) => s.stations)
  const selectedBuildCell = useGameStore((s) => s.selectedBuildCell)
  const hoveredBuildCell = useGameStore((s) => s.hoveredBuildCell)
  const clearBuildSelection = useGameStore((s) => s.clearBuildSelection)
  const buildPalette = useGameStore((s) => s.buildPalette)
  const setBuildPalette = useGameStore((s) => s.setBuildPalette)
  const selectedBuildTransitionId = useGameStore((s) => s.selectedBuildTransitionId)
  const setSelectedBuildTransitionId = useGameStore((s) => s.setSelectedBuildTransitionId)
  const removeStation = useGameStore((s) => s.removeStation)
  const requestSystemTransition = useGameStore((s) => s.requestSystemTransition)
  const tick = useGameStore((s) => s.tick)
  const resetSave = useGameStore((s) => s.resetSave)
  const newGame = useGameStore((s) => s.newGame)
  const seed = useGameStore((s) => s.seed)
  const transitions = useGameStore((s) => s.transitions)
  const engine = useGameStore((s) => s.engine)
  const requestedSystemTransitionIds = useGameStore((s) => s.requestedSystemTransitionIds)
  const lastFiredTransitionIds = useGameStore((s) => s.lastFiredTransitionIds)
  const tickIndex = useGameStore((s) => s.tickIndex)
  const saveRevision = useGameStore((s) => s.saveRevision)

  const loopRef = useRef<GameLoop | null>(null)
  const [seedInput, setSeedInput] = useState<string>(String(seed))
  const [canvasZoom, setCanvasZoom] = useState<number>(0.625)
  const [bootError, setBootError] = useState<string | null>(null)

  useEffect(() => {
    setSeedInput(String(seed))
  }, [seed])

  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        await loadSystem()
        if (cancelled) return

        const loop = new GameLoop()
        loop.start()
        loopRef.current = loop
      } catch (error) {
        if (cancelled) return
        setBootError(error instanceof Error ? error.message : String(error))
      }
    }

    void boot()

    return () => {
      cancelled = true
      loopRef.current?.stop()
      loopRef.current = null
    }
  }, [loadSystem])

  const activeTokenEntries = useMemo(
    () => Object.entries(tokens).filter(([, value]) => value > 0).sort(([a], [b]) => a.localeCompare(b)),
    [tokens],
  )

  const tokenGroups = useMemo(() => {
    const grouped = new Map<(typeof TOKEN_GROUP_ORDER)[number], Array<[string, number]>>()
    for (const group of TOKEN_GROUP_ORDER) grouped.set(group, [])

    for (const entry of activeTokenEntries) {
      grouped.get(tokenGroupLabel(entry[0]))?.push(entry)
    }

    return TOKEN_GROUP_ORDER.map((group) => ({
      label: group,
      entries: grouped.get(group) ?? [],
    })).filter((group) => group.entries.length > 0)
  }, [activeTokenEntries])

  const resourceTotals = useMemo(
    () =>
      RESOURCE_ORDER.map((resourceId) => ({
        resourceId,
        count: Object.entries(tokens)
          .filter(([place]) => place.startsWith(resourceId))
          .reduce((sum, [, qty]) => sum + qty, 0),
      })),
    [tokens],
  )

  const buildPrefix = palettePrefix(buildPalette)
  const buildOptions = useMemo(
    () =>
      transitions
        .filter((transition) => transition.id.startsWith(buildPrefix))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [buildPrefix, transitions],
  )

  const activeBuildTransitionId =
    selectedBuildTransitionId && buildOptions.some((transition) => transition.id === selectedBuildTransitionId)
      ? selectedBuildTransitionId
      : buildOptions[0]?.id ?? null

  useEffect(() => {
    if (activeBuildTransitionId && activeBuildTransitionId !== selectedBuildTransitionId) {
      setSelectedBuildTransitionId(activeBuildTransitionId)
    }
  }, [activeBuildTransitionId, selectedBuildTransitionId, setSelectedBuildTransitionId])

  const activeBuildTransition = useMemo(
    () => buildOptions.find((transition) => transition.id === activeBuildTransitionId) ?? null,
    [activeBuildTransitionId, buildOptions],
  )

  const stationGroups = useMemo(() => {
    const grouped = new Map<HudCategory, typeof stations>()
    for (const kind of PALETTE_ORDER) grouped.set(kind, [])

    for (const station of stations) {
      const category = stationCategoryFromTransitionId(station.transitionId)
      grouped.get(category)?.push(station)
    }

    return PALETTE_ORDER.map((kind) => ({
      kind,
      label: paletteLabel(kind),
      stations: grouped.get(kind) ?? [],
    })).filter((group) => group.stations.length > 0)
  }, [stations])

  const selectedCellLabel = formatCellLabel(selectedBuildCell, hoveredBuildCell)
  const status = statusLabel(phase)
  const isReady = engine !== null && transitions.length > 0
  const selectedBuildLabel = activeBuildTransition ? formatTransitionLabel(activeBuildTransition.id) : 'No build selected'
  const selectedBuildHint =
    buildPalette === 'conveyor'
      ? 'Drag on the grid to paint conveyor transitions.'
      : 'Click a cell to place the selected transition.'

  const handleNewGame = () => {
    const nextSeed = Number.parseInt(seedInput, 10)
    if (!Number.isInteger(nextSeed)) return
    newGame(nextSeed)
  }

  const handleResetSave = () => {
    if (!window.confirm('Reset the current session and start a new game?')) return
    resetSave()
  }

  const zoomOut = () => setCanvasZoom((zoom) => Math.max(0.25, Math.round((zoom - 0.125) * 1000) / 1000))
  const zoomIn = () => setCanvasZoom((zoom) => Math.min(1.5, Math.round((zoom + 0.125) * 1000) / 1000))
  const resetZoom = () => setCanvasZoom(0.625)

  return (
    <div className="app-shell min-h-screen">
      <header className="hud-header panel-surface panel-dark">
        <div>
          <p className="hud-eyebrow">Whitepod runtime</p>
          <h1 className="hud-title">Lunar system UI</h1>
        </div>
        <div className="hud-topbar-meta">
          <div className="hud-metric"><span>Phase</span><strong>{status}</strong></div>
          <div className="hud-metric"><span>Seed</span><strong>{seed}</strong></div>
          <div className="hud-metric"><span>Stations</span><strong>{stations.length}</strong></div>
          <div className="hud-metric"><span>Tokens</span><strong>{activeTokenEntries.length}</strong></div>
        </div>
      </header>

      <section className="hud-summary panel-surface panel-dark">
        <div className="hud-summary-block">
          <div className="hud-menu-group-title">Selection</div>
          <div className="hud-summary-group">
            <span className="hud-badge">{selectedCellLabel}</span>
            <span className="hud-badge">{selectedBuildLabel}</span>
          </div>
        </div>

        <div className="hud-summary-block">
          <div className="hud-menu-group-title">Runtime</div>
          <div className="hud-summary-group">
            <span className="hud-badge">Tick {tickIndex}</span>
            <span className="hud-badge">Save {saveRevision}</span>
            <span className="hud-badge">{mode}</span>
            <span className="hud-badge">{autoTickEnabled ? 'Auto tick' : 'Paused'}</span>
          </div>
        </div>

        <div className="hud-summary-block hud-summary-block--wide">
          <div className="hud-menu-group-title">Resources</div>
          <div className="hud-summary-group hud-summary-group--resources">
            {resourceTotals.map((resource) => (
              <div key={resource.resourceId} className="hud-resource-pill">
                <span>{formatResourceLabel(resource.resourceId)}</span>
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
                  <input className="hud-input" value={seedInput} onChange={(event) => setSeedInput(event.target.value)} onKeyDown={(event) => {
                    if (event.key === 'Enter') handleNewGame()
                  }} />
                </label>
              </div>

              <div className="hud-menu-group">
                <div className="hud-menu-group-title">Session actions</div>
                <div className="hud-actions hud-actions--dense">
                  <button className="hud-button primary" onClick={handleNewGame} disabled={!isReady}>New game</button>
                  <button className="hud-button" onClick={handleResetSave} disabled={!isReady}>Reset save</button>
                </div>
              </div>

              <div className="hud-menu-group">
                <div className="hud-menu-group-title">Simulation</div>
                <div className="hud-actions hud-actions--dense">
                  <button className="hud-button" onClick={() => requestSystemTransition('init')} disabled={!isReady}>Init</button>
                  <button className="hud-button" onClick={() => requestSystemTransition('launch')} disabled={!isReady}>Launch</button>
                  <button className="hud-button" onClick={() => requestSystemTransition('terminate')} disabled={!isReady}>Terminate</button>
                  <button className="hud-button primary" onClick={() => tick()} disabled={!isReady}>Tick now</button>
                </div>
              </div>

              <div className="hud-menu-group">
                <div className="hud-menu-group-title">Playback</div>
                <div className="hud-actions hud-actions--dense">
                  <button className={`hud-button ${autoTickEnabled ? 'primary' : ''}`} onClick={() => setAutoTickEnabled(!autoTickEnabled)} disabled={!isReady}>
                    {autoTickEnabled ? 'Auto tick ON' : 'Auto tick OFF'}
                  </button>
                  <span className="hud-badge">Mode: {mode}</span>
                </div>
              </div>

              <div className="hud-menu-group">
                <div className="hud-menu-group-title">Runtime state</div>
                <div className="hud-actions hud-actions--dense">
                  <span className="hud-badge">{status}</span>
                  <span className="hud-badge">Queued {requestedSystemTransitionIds.length}</span>
                  <span className="hud-badge">Fired {lastFiredTransitionIds.length}</span>
                </div>
              </div>
            </div>
          </section>

          <HudSection
            title="Build Library"
            badge={`${buildOptions.length} available`}
            action={
              <button className="hud-link" onClick={() => clearBuildSelection()} disabled={!isReady}>
                Clear
              </button>
            }
            className="hud-panel hud-panel--fill"
          >
            <div className="hud-menu-group">
              <div className="hud-menu-group-title">Categories</div>
              <div className="hud-actions hud-actions--dense">
                {PALETTE_ORDER.map((kind) => (
                  <button
                    key={kind}
                    className={`hud-button ${buildPalette === kind ? 'primary' : ''}`}
                    onClick={() => setBuildPalette(kind)}
                    disabled={!isReady}
                  >
                    {paletteLabel(kind)}
                  </button>
                ))}
              </div>
            </div>

            <div className="runtime-tile-grid runtime-tile-grid--library">
              {buildOptions.map((transition) => (
                <TileCard
                  key={transition.id}
                  selected={activeBuildTransitionId === transition.id}
                  onClick={() => setSelectedBuildTransitionId(transition.id)}
                  title={formatTransitionLabel(transition.id)}
                  subtitle={transition.id}
                  disabled={!isReady}
                />
              ))}
            </div>

            <div className="hud-menu-group">
              <div className="hud-menu-group-title">Placement</div>
              <p className="hud-muted hud-panel-note">{selectedBuildHint}</p>
              <p className="hud-muted hud-panel-note">{selectedCellLabel}</p>
            </div>
          </HudSection>
        </aside>

        <GridViewport
          title="Factory Grid"
          meta={
            <>
              <span className="hud-badge">{selectedCellLabel}</span>
              <span className="hud-badge">{selectedBuildLabel}</span>
            </>
          }
        >
          <div className="hud-viewport-body">
            {bootError ? (
              <div className="hud-menu-group" style={{ minWidth: 'min(640px, 100%)' }}>
                <div className="hud-menu-group-title">Runtime error</div>
                <p className="hud-muted hud-panel-note">{bootError}</p>
              </div>
            ) : (
              <PixiCanvas
                className="canvas-stage"
                style={{
                  width: `${PIXI_CANVAS_BASE_SIZE * canvasZoom}px`,
                  height: `${PIXI_CANVAS_BASE_SIZE * canvasZoom}px`,
                }}
              />
            )}
          </div>
        </GridViewport>

        <aside className="hud-sidebar hud-sidebar--right">
          <HudSection title="Stations" badge="Placement" className="hud-panel hud-panel--fill">
            <div className="hud-panel-scroll hud-panel-scroll--grow runtime-scroll">
              {stationGroups.length === 0 ? (
                <p className="hud-muted">No stations placed.</p>
              ) : (
                stationGroups.map((group) => (
                  <div key={group.kind} className="hud-menu-group">
                    <div className="hud-menu-group-title">{group.label}</div>
                    <div className="runtime-tile-grid">
                      {group.stations.map((station) => (
                        <TileCard
                          key={station.id}
                          title={station.id}
                          subtitle={`${station.transitionId} @ (${station.x}, ${station.y})`}
                          onClick={() => removeStation(station.id)}
                          disabled={!isReady}
                        />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </HudSection>

          <HudSection title="Tokens" badge="Non-zero" className="hud-panel hud-panel--fill">
            <div className="hud-panel-scroll hud-panel-scroll--grow runtime-scroll">
              {tokenGroups.length === 0 ? (
                <p className="hud-muted">No active tokens.</p>
              ) : (
                tokenGroups.map((group) => (
                  <div key={group.label} className="hud-menu-group">
                    <div className="hud-menu-group-title">{group.label}</div>
                    <div className="runtime-tile-grid runtime-tile-grid--tokens">
                      {group.entries.map(([key, value]) => (
                        <TileCard key={key} title={key} subtitle={`Count ${value}`} disabled />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </HudSection>
        </aside>
      </main>

      <footer className="hud-footer panel-surface panel-dark">
        <div className="hud-footer-left">
          <div className="hud-menu-group hud-menu-group--inline">
            <div className="hud-menu-group-title">Status</div>
            <div className="hud-actions hud-actions--dense">
              <span className="hud-badge">{status}</span>
              <span className="hud-badge">{selectedBuildLabel}</span>
              <span className="hud-badge">{selectedBuildHint}</span>
            </div>
          </div>
        </div>

        <div className="hud-footer-right">
          <div className="hud-menu-group hud-menu-group--inline">
            <div className="hud-menu-group-title">View</div>
            <div className="hud-zoom-group">
              <IconButton icon="zoom-out" label="-" onClick={zoomOut} aria-label="Zoom out" />
              <span className="hud-badge">Zoom {Math.round(canvasZoom * 100)}%</span>
              <IconButton icon="zoom-in" label="+" onClick={zoomIn} aria-label="Zoom in" />
              <IconButton icon="reset" label="Reset" onClick={resetZoom} aria-label="Reset zoom" />
            </div>
          </div>

          <div className="hud-menu-group hud-menu-group--inline">
            <div className="hud-menu-group-title">Build</div>
            <div className="hud-actions hud-actions--dense">
              <button className="hud-button" onClick={() => setBuildPalette('extractor')} disabled={!isReady}>Extractors</button>
              <button className="hud-button" onClick={() => setBuildPalette('conveyor')} disabled={!isReady}>Conveyors</button>
              <button className="hud-button" onClick={() => setBuildPalette('factory')} disabled={!isReady}>Factories</button>
              <button className="hud-button" onClick={() => setBuildPalette('storage')} disabled={!isReady}>Storage</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
