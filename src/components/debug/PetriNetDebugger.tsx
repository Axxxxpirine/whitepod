import { marked } from 'marked'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Transition } from '@/core/types'
import type { ResourceId } from '@/core/grid/manager'
import { useGameStore } from '@/store/game-store'
import { PetriNetDiagram } from './petri/PetriNetDiagram'

type SpeedMode = '1' | '10' | '100' | '1000' | 'max'

function formatPlace(place: string, qty: number): string {
  return qty > 1 ? `${place}*${qty}` : place
}

function toDsl(transitions: Transition[]): string {
  const header = [
    '# AUTO-GENERATED — Whitepod debug Petri net view',
    '# Source: public/data/lunar-chemistry.game-system.transitions.json',
    '',
  ].join('\n')

  const lines = transitions
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(t => {
      const left = t.consumes.length === 0 ? '()' : t.consumes.map(r => formatPlace(r.place, r.qty)).join(' ')
      const right = t.produces.length === 0 ? '()' : t.produces.map(r => formatPlace(r.place, r.qty)).join(' ')
      return `;${t.id} ${left} -> ${right}`
    })

  return `${header}${lines.join('\n')}\n`
}

function placeLayer(placeId: string): 'control' | 'surface' | 'bus' | 'stock' | 'other' {
  if (placeId === 'start' || placeId === 'run' || placeId === 'done') return 'control'
  if (placeId.endsWith('_surface')) return 'surface'
  if (placeId.endsWith('_bus')) return 'bus'
  if (placeId.endsWith('_stock')) return 'stock'
  return 'other'
}

function isTransitionEnabled(transition: Transition, marking: Record<string, number>): boolean {
  for (const input of transition.consumes) {
    const have = marking[input.place] ?? 0
    if (have < input.qty) return false
  }
  return true
}

export function PetriNetDebugger() {
  const mode = useGameStore(s => s.mode)
  const setAutoTickEnabled = useGameStore(s => s.setAutoTickEnabled)
  const tick = useGameStore(s => s.tick)
  const transitions = useGameStore(s => s.transitions)
  const tokens = useGameStore(s => s.tokens)
  const tickIndex = useGameStore(s => s.tickIndex)
  const phase = useGameStore(s => s.phase)
  const countDeposits = useGameStore(s => s.countDeposits)
  const debugFireTransition = useGameStore(s => s.debugFireTransition)

  const debugStatsStartTick = useGameStore(s => s.debugStatsStartTick)
  const debugFiringHistory = useGameStore(s => s.debugFiringHistory)
  const debugTotalFires = useGameStore(s => s.debugTotalFires)
  const debugTokenStats = useGameStore(s => s.debugTokenStats)
  const debugResetStats = useGameStore(s => s.debugResetStats)

  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [speedMode, setSpeedMode] = useState<SpeedMode>('1')

  const [filterText, setFilterText] = useState('')
  const [showControl, setShowControl] = useState(true)
  const [showSurface, setShowSurface] = useState(true)
  const [showBus, setShowBus] = useState(true)
  const [showStock, setShowStock] = useState(true)

  const [status, setStatus] = useState<string>('')


  const rafRef = useRef<number | null>(null)
  const lastRealTsRef = useRef<number | null>(null)
  const accMsRef = useRef<number>(0)

  const dslText = useMemo(() => toDsl(transitions), [transitions])

  const marking = useMemo(() => {
    const allPlaces = new Set<string>()
    for (const t of transitions) {
      for (const input of t.consumes) allPlaces.add(input.place)
      for (const output of t.produces) allPlaces.add(output.place)
    }

    const out: Record<string, number> = {}
    for (const p of allPlaces) {
      out[p] = tokens[p] ?? 0
    }

    return out
  }, [transitions, tokens])

  const enabledTransitionIds = useMemo(() => {
    const set = new Set<string>()
    for (const t of transitions) {
      if (!isTransitionEnabled(t, marking)) continue

      if (t.id.startsWith('extract__')) {
        const resourceId = t.id.slice('extract__'.length) as ResourceId
        if (countDeposits(resourceId) <= 0) continue
      }

      set.add(t.id)
    }
    return set
  }, [countDeposits, marking, transitions])

  const visibility = useMemo(() => {
    const q = filterText.trim().toLowerCase()

    const allowedLayers = new Set<string>()
    if (showControl) allowedLayers.add('control')
    if (showSurface) allowedLayers.add('surface')
    if (showBus) allowedLayers.add('bus')
    if (showStock) allowedLayers.add('stock')

    const placePassesLayer = (placeId: string) => allowedLayers.has(placeLayer(placeId))

    const transitionMatchesQuery = (t: Transition) => {
      if (!q) return true
      if (t.id.toLowerCase().includes(q)) return true
      for (const input of t.consumes) {
        if (input.place.toLowerCase().includes(q)) return true
      }
      for (const output of t.produces) {
        if (output.place.toLowerCase().includes(q)) return true
      }
      return false
    }

    const visibleTransitionIds = new Set<string>()
    const visiblePlaceIds = new Set<string>()

    if (!q) {
      // Layer-only filtering: show all transitions that touch at least one visible place.
      for (const t of transitions) {
        let transitionVisible = false

        for (const input of t.consumes) {
          if (!placePassesLayer(input.place)) continue
          transitionVisible = true
          visiblePlaceIds.add(input.place)
        }
        for (const output of t.produces) {
          if (!placePassesLayer(output.place)) continue
          transitionVisible = true
          visiblePlaceIds.add(output.place)
        }

        if (transitionVisible) visibleTransitionIds.add(t.id)
      }

      return { visibleTransitionIds, visiblePlaceIds }
    }

    // Query filtering: include matches + 1-hop neighborhood.
    const matchingTransitions = transitions.filter(transitionMatchesQuery)

    for (const t of matchingTransitions) {
      visibleTransitionIds.add(t.id)

      for (const input of t.consumes) {
        if (placePassesLayer(input.place)) visiblePlaceIds.add(input.place)
      }
      for (const output of t.produces) {
        if (placePassesLayer(output.place)) visiblePlaceIds.add(output.place)
      }
    }

    for (const t of transitions) {
      if (visibleTransitionIds.has(t.id)) continue

      for (const input of t.consumes) {
        if (visiblePlaceIds.has(input.place)) {
          visibleTransitionIds.add(t.id)
          break
        }
      }
      for (const output of t.produces) {
        if (visiblePlaceIds.has(output.place)) {
          visibleTransitionIds.add(t.id)
          break
        }
      }
    }

    return { visibleTransitionIds, visiblePlaceIds }
  }, [filterText, showBus, showControl, showStock, showSurface, transitions])

  const documentationHtml = useMemo(() => {
    const md = [
      '### Debug Petri net simulator',
      '',
      '- Click **enabled** transitions (green) to fire them immediately.',
      '- **Step tick** runs the normal store `tick()` (consumes deposits, fires all active transitions in debug mode).',
      '- **Auto-sim** repeatedly runs ticks at the chosen speed.',
      '',
      'Syntax shown in the editor is informational only (read-only).',
    ].join('\n')

    return marked.parse(md)
  }, [])

  useEffect(() => {
    if (mode !== 'debug') return
    // Ensure GameLoop does not fight the simulator.
    setAutoTickEnabled(false)
  }, [mode, setAutoTickEnabled])

  useEffect(() => {
    // stop RAF on unmount
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [])


  if (mode !== 'debug') return null

  const resetStats = () => {
    debugResetStats()
  }

  const stepTick = () => {
    try {
      tick()
      setStatus('')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  const stop = () => {
    setRunning(false)
    setPaused(false)
    lastRealTsRef.current = null
    accMsRef.current = 0
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
  }

  const frame = (realNowMs: number) => {
    if (!running) return

    if (paused) {
      rafRef.current = requestAnimationFrame(frame)
      return
    }

    if (lastRealTsRef.current === null) lastRealTsRef.current = realNowMs
    let dt = realNowMs - lastRealTsRef.current
    lastRealTsRef.current = realNowMs

    if (dt < 0) dt = 0
    if (dt > 250) dt = 250

    const maxStepsPerFrame = 200
    let steps = 0

    if (speedMode === 'max') {
      steps = maxStepsPerFrame
    } else {
      const multiplier = Number.parseInt(speedMode, 10)
      accMsRef.current += dt * (Number.isFinite(multiplier) ? multiplier : 1)
      steps = Math.floor(accMsRef.current / 1000)
      if (steps > maxStepsPerFrame) {
        steps = maxStepsPerFrame
        accMsRef.current = 0
      } else {
        accMsRef.current -= steps * 1000
      }
    }

    if (steps > 0) {
      for (let i = 0; i < steps; i++) {
        tick()
      }
    }

    rafRef.current = requestAnimationFrame(frame)
  }

  const start = () => {
    if (running) return
    setRunning(true)
    setPaused(false)
    lastRealTsRef.current = null
    accMsRef.current = 0
    rafRef.current = requestAnimationFrame(frame)
  }

  const fireTransition = (transitionId: string) => {
    const res = debugFireTransition(transitionId)
    if (!res.ok) {
      setStatus(res.reason ?? 'Failed to fire transition')
    } else {
      setStatus('')
    }
  }

  const elapsedTicks = debugStatsStartTick === null ? 0 : Math.max(0, tickIndex - debugStatsStartTick)

  return (
    <section className="space-y-4">
      <h2 className="font-semibold">Petri net simulator</h2>

      <div className="grid grid-cols-1 xl:grid-cols-[520px_1fr] gap-4">
        {/* Editor/Controls */}
        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <button className="border rounded px-2 py-1" onClick={resetStats}>
                Reset stats
              </button>
              <button className="border rounded px-2 py-1" onClick={stepTick}>
                Step tick
              </button>
              <button className="border rounded px-2 py-1" onClick={start}>
                Start auto-sim
              </button>
              <button className="border rounded px-2 py-1" onClick={stop}>
                Stop
              </button>
              <button
                className="border rounded px-2 py-1"
                onClick={() => setPaused(p => !p)}
                disabled={!running}
              >
                {paused ? 'Resume' : 'Pause'}
              </button>

              <label className="flex items-center gap-2">
                <span>Speed</span>
                <select
                  className="border rounded px-2 py-1"
                  value={speedMode}
                  onChange={e => setSpeedMode(e.target.value as SpeedMode)}
                >
                  <option value="1">1x</option>
                  <option value="10">10x</option>
                  <option value="100">100x</option>
                  <option value="1000">1Kx</option>
                  <option value="max">Max</option>
                </select>
              </label>

              <span className="ml-auto text-xs text-gray-600">
                Status: {running ? (paused ? 'Paused' : 'Running') : 'Stopped'}
              </span>
            </div>

            <div className="text-xs text-gray-700">
              Tick: <code>{tickIndex}</code> • Phase: <code>{phase}</code> • Elapsed ticks: <code>{elapsedTicks}</code>
            </div>

            {status ? <div className="text-sm text-red-700">{status}</div> : null}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">Filter</span>
              <input
                className="border rounded px-2 py-1 flex-1 min-w-64"
                placeholder="Search place/transition"
                value={filterText}
                onChange={e => setFilterText(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={showControl} onChange={e => setShowControl(e.target.checked)} />
                control
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={showSurface} onChange={e => setShowSurface(e.target.checked)} />
                surface
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={showBus} onChange={e => setShowBus(e.target.checked)} />
                bus
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={showStock} onChange={e => setShowStock(e.target.checked)} />
                stock
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">DSL (read-only)</h3>
            <textarea className="w-full h-56 border rounded p-2 font-mono text-xs" value={dslText} readOnly />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Statistics</h3>
            <div className="text-xs bg-gray-50 border rounded p-2">
              <div>Total firing events: {Object.values(debugTotalFires).reduce((a, b) => a + b, 0)}</div>
              <div>Unique transitions fired: {Object.keys(debugTotalFires).length}</div>
            </div>

            <h4 className="text-xs font-semibold">Firing history</h4>
            <div className="bg-gray-50 border rounded p-2 font-mono text-xs max-h-44 overflow-auto">
              {debugFiringHistory.length === 0 ? (
                <div className="text-gray-600">No firing events yet</div>
              ) : (
                debugFiringHistory.map((e, idx) => (
                  <div key={idx}>
                    <span className="text-gray-600">[{new Date(e.timestamp).toLocaleTimeString()}]</span> {e.transitionId}
                  </div>
                ))
              )}
            </div>

            <h4 className="text-xs font-semibold">Token production</h4>
            <div className="bg-gray-50 border rounded p-2 font-mono text-xs max-h-56 overflow-auto">
              {Object.keys(debugTokenStats).length === 0 ? (
                <div className="text-gray-600">No token deltas yet</div>
              ) : (
                Object.entries(debugTokenStats)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([place, st]) => {
                    const net = st.produced - st.consumed
                    return (
                      <div key={place} className="flex justify-between gap-2">
                        <span>{place}</span>
                        <span>
                          +{st.produced} / -{st.consumed} = {net}
                        </span>
                      </div>
                    )
                  })
              )}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <div className="text-sm" dangerouslySetInnerHTML={{ __html: documentationHtml }} />

          <PetriNetDiagram
            transitions={transitions}
            marking={marking}
            enabledTransitionIds={enabledTransitionIds}
            onFireTransition={fireTransition}
            visibleTransitionIds={visibility.visibleTransitionIds}
            visiblePlaceIds={visibility.visiblePlaceIds}
          />
        </div>
      </div>
    </section>
  )
}
