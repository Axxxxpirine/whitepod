import { useEffect, useRef, useState } from 'react'
import { IconButton } from './IconButton'

interface RuntimeSettingsPopoverProps {
  autoTickEnabled: boolean
  demoModeEnabled: boolean
  simulationSpeed: 1 | 10 | 1000
  onToggleAutoTick: () => void
  onToggleDemoMode: () => void
  onChangeSimulationSpeed: (speed: 1 | 10 | 1000) => void
  onResetSave: () => void
  onNewGame: () => void
}

export function RuntimeSettingsPopover({
  autoTickEnabled,
  demoModeEnabled,
  simulationSpeed,
  onToggleAutoTick,
  onToggleDemoMode,
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
        <div className="absolute bottom-full right-0 mb-2 min-w-52 rounded-xl border border-white/15 bg-black/85 p-2 shadow-2xl backdrop-blur-md">
          <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
            Runtime
          </p>

          <button
            type="button"
            onClick={onToggleAutoTick}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
          >
            <span>Auto tick</span>
            <span className={`ml-3 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${autoTickEnabled ? 'bg-emerald-400/20 text-emerald-400' : 'bg-white/10 text-white/40'}`}>
              {autoTickEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleDemoMode}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
          >
            <span>Simulation mode</span>
            <span className={`ml-3 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${demoModeEnabled ? 'bg-sky-400/20 text-sky-400' : 'bg-white/10 text-white/40'}`}>
              {demoModeEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <div className="mt-1 px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-white/40">
            Simulation speed
          </div>
          <div className="flex gap-1 px-1 pb-1">
            {([1, 10, 1000] as const).map(speed => (
              <button
                key={speed}
                type="button"
                onClick={() => onChangeSimulationSpeed(speed)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-mono transition-colors hover:bg-white/10 ${simulationSpeed === speed ? 'bg-emerald-400/20 text-emerald-300' : 'text-white/60'}`}
              >
                {speed}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false)
              onNewGame()
            }}
            className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
          >
            <span>New game</span>
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
            Reset save
          </button>
        </div>
      )}
    </div>
  )
}
