import { useEffect, useRef, useState } from 'react'
import { IconButton } from './IconButton'
import { AssetImage } from './AssetImage'
import { uiIconCandidates } from '@/render/whitepod-assets'

interface RuntimeSettingsPopoverProps {
  autoTickEnabled: boolean
  demoModeEnabled: boolean
  demonstrationEnabled: boolean
  simulationSpeed: 1 | 10 | 1000
  onToggleAutoTick: () => void
  onToggleDemoMode: () => void
  onToggleDemonstration: () => void
  onChangeSimulationSpeed: (speed: 1 | 10 | 1000) => void
  onResetSave: () => void
  onNewGame: () => void
}

export function RuntimeSettingsPopover({
  autoTickEnabled,
  demoModeEnabled,
  demonstrationEnabled,
  simulationSpeed,
  onToggleAutoTick,
  onToggleDemoMode,
  onToggleDemonstration,
  onChangeSimulationSpeed,
  onResetSave,
  onNewGame,
}: RuntimeSettingsPopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <IconButton icon="gear" label="Settings" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Settings" />

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 max-w-[calc(100vw-1rem)] max-h-[min(72vh,28rem)] overflow-y-auto rounded-xl border border-white/15 bg-black/90 p-2 shadow-2xl backdrop-blur-md">
          <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
            Runtime
          </p>

          <button
            type="button"
            onClick={onToggleAutoTick}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
          >
            <span className="flex items-center gap-2">
              <AssetImage candidates={uiIconCandidates('step')} alt="" className="h-4 w-4" imageClassName="h-4 w-4 object-contain" />
              Auto tick
            </span>
            <span className={`ml-3 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${autoTickEnabled ? 'bg-emerald-400/20 text-emerald-400' : 'bg-white/10 text-white/40'}`}>
              {autoTickEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleDemoMode}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
          >
            <span className="flex items-center gap-2">
              <AssetImage candidates={uiIconCandidates('play')} alt="" className="h-4 w-4" imageClassName="h-4 w-4 object-contain" />
              Simulation mode
            </span>
            <span className={`ml-3 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${demoModeEnabled ? 'bg-sky-400/20 text-sky-400' : 'bg-white/10 text-white/40'}`}>
              {demoModeEnabled ? 'ON' : 'OFF'}
            </span>
            </button>

          <button
            type="button"
            onClick={onToggleDemonstration}
            className="mt-1 flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
          >
            <span className="flex items-center gap-2">
              <AssetImage candidates={uiIconCandidates(demonstrationEnabled ? 'pause' : 'play')} alt="" className="h-4 w-4" imageClassName="h-4 w-4 object-contain" />
              {demonstrationEnabled ? 'Stop demonstration' : 'Start demonstration'}
            </span>
            <span className={`ml-3 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${demonstrationEnabled ? 'bg-sky-400/20 text-sky-400' : 'bg-white/10 text-white/40'}`}>
              {demonstrationEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <div className="mt-2 px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-white/40">
            Simulation speed
          </div>
          <div className="px-2 pb-2">
            <input
              type="range"
              min={0}
              max={2}
              step={1}
              value={simulationSpeed === 1 ? 0 : simulationSpeed === 10 ? 1 : 2}
              onChange={event => {
                const nextSpeed = ([1, 10, 1000] as const)[Number.parseInt(event.target.value, 10)]
                onChangeSimulationSpeed(nextSpeed)
              }}
              className="hud-speed-slider"
              aria-label="Simulation speed"
            />
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-white/55">
              <span>1x</span>
              <span className="text-emerald-300">{simulationSpeed}x</span>
              <span>1000x</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onNewGame()
            }}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
          >
            <span className="flex items-center gap-2">
              <AssetImage candidates={uiIconCandidates('load')} alt="" className="h-4 w-4" imageClassName="h-4 w-4 object-contain" />
              New game
            </span>
            <span className="font-mono text-[10px] text-white/40">↻</span>
          </button>

          <div className="my-1.5 border-t border-white/10" />

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onResetSave()
            }}
            className="flex w-full items-center rounded-lg px-2 py-1.5 text-xs text-red-400/80 transition-colors hover:bg-red-400/10 hover:text-red-400"
          >
            <AssetImage candidates={uiIconCandidates('delete')} alt="" className="mr-2 h-4 w-4" imageClassName="h-4 w-4 object-contain" />
            Reset save
          </button>
        </div>
      )}
    </div>
  )
}
