import { useEffect, useMemo, useRef, useState } from 'react'
import type { ResourceId } from '@/core/grid/manager'
import { PixiCanvas } from '@/components/PixiCanvas'
import { PetriNetDebugger } from '@/components/debug/PetriNetDebugger'
import { GameLoop } from '@/engine/game-loop'
import { useGameStore } from '@/store/game-store'

function App() {
  const loadSystem = useGameStore(s => s.loadSystem)
  const mode = useGameStore(s => s.mode)
  const setMode = useGameStore(s => s.setMode)
  const phase = useGameStore(s => s.phase)
  const tokens = useGameStore(s => s.tokens)
  const metadata = useGameStore(s => s.metadata)
  const stations = useGameStore(s => s.stations)
  const placeStation = useGameStore(s => s.placeStation)
  const removeStation = useGameStore(s => s.removeStation)
  const countDeposits = useGameStore(s => s.countDeposits)
  const requestSystemTransition = useGameStore(s => s.requestSystemTransition)
  const tick = useGameStore(s => s.tick)
  const resetSave = useGameStore(s => s.resetSave)
  const newGame = useGameStore(s => s.newGame)
  const seed = useGameStore(s => s.seed)

  const loopRef = useRef<GameLoop | null>(null)
  const [selectedStationId, setSelectedStationId] = useState<string>('')
  const [seedInput, setSeedInput] = useState<string>(String(seed))

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

  return (
    <div className="min-h-screen p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Whitepod</h1>
        <div className="flex items-center gap-3">
          <label className="text-sm">Mode</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={mode}
            onChange={e => setMode(e.target.value as 'player' | 'debug')}
          >
            <option value="player">player</option>
            <option value="debug">debug</option>
          </select>
        </div>
      </header>

       <section className="flex flex-wrap items-center gap-2">
         <span className="text-sm">Phase:</span>
         <code className="text-sm">{phase}</code>
         <span className="text-sm">Seed:</span>
         <code className="text-sm">{seed}</code>
         <input
           className="border rounded px-2 py-1 text-sm w-28"
           value={seedInput}
           onChange={e => setSeedInput(e.target.value)}
         />
         <button
           className="border rounded px-2 py-1 text-sm"
           onClick={() => {
             const nextSeed = Number.parseInt(seedInput, 10)
             if (!Number.isInteger(nextSeed)) return
             newGame(nextSeed)
           }}
         >
           New game
         </button>

        <button
          className="border rounded px-2 py-1 text-sm"
          onClick={() => requestSystemTransition('init')}
        >
          Init
        </button>
        <button
          className="border rounded px-2 py-1 text-sm"
          onClick={() => requestSystemTransition('launch')}
        >
          Launch
        </button>
        <button
          className="border rounded px-2 py-1 text-sm"
          onClick={() => requestSystemTransition('terminate')}
        >
          Terminate
        </button>
        <button className="border rounded px-2 py-1 text-sm" onClick={() => tick()}>
          Tick now
        </button>
        <button className="border rounded px-2 py-1 text-sm" onClick={() => resetSave()}>
          Reset save
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Stations</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="border rounded px-2 py-1 text-sm min-w-80"
            value={effectiveSelectedStationId}
            onChange={e => setSelectedStationId(e.target.value)}
          >
            {stationOptions.map(t => (
              <option key={t.id} value={t.id}>
                {t.id} {t.name_fr ? `— ${t.name_fr}` : ''}
              </option>
            ))}
          </select>
          <button
            className="border rounded px-2 py-1 text-sm"
            onClick={() => effectiveSelectedStationId && placeStation(effectiveSelectedStationId)}
          >
            Place
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {stations.length === 0 ? (
            <span className="text-sm text-gray-600">No stations placed.</span>
          ) : (
            stations.map(s => (
              <button
                key={s.id}
                className="border rounded px-2 py-1 text-sm"
                onClick={() => removeStation(s.id)}
                title="Remove station"
              >
                {s.id}: {s.transitionId} @({s.x},{s.y})
              </button>
            ))
          )}
        </div>

        {effectiveSelectedStationId.startsWith('extract__') ? (
          <div className="text-sm text-gray-600">
            Units available:{' '}
            <code>
              {countDeposits(effectiveSelectedStationId.slice('extract__'.length) as ResourceId)}
            </code>
            . Extract stations are auto-placed adjacent to a matching deposit.
          </div>
        ) : null}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Tokens (non-zero)</h2>
        <pre className="bg-gray-50 border rounded p-3 text-xs overflow-auto">
          {JSON.stringify(tokens, null, 2)}
        </pre>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Lunar Factory Visualization</h2>
        <div className="border-2 border-indigo-500 rounded-lg overflow-hidden">
          <PixiCanvas />
        </div>
      </section>

      {mode === 'debug' ? <PetriNetDebugger /> : null}
    </div>
  )
}

export default App
