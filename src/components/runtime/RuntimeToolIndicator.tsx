import { useGameStore } from '@/store/game-store'

function describePalette(kind: 'extractor' | 'conveyor' | 'factory' | 'storage'): string {
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

export function RuntimeToolIndicator() {
  const buildPalette = useGameStore((s) => s.buildPalette)
  const selectedBuildTransitionId = useGameStore((s) => s.selectedBuildTransitionId)
  const selectedBuildCell = useGameStore((s) => s.selectedBuildCell)
  const hoveredBuildCell = useGameStore((s) => s.hoveredBuildCell)

  const hasContext = selectedBuildTransitionId !== null || selectedBuildCell !== null || hoveredBuildCell !== null
  if (!hasContext) return null

  return (
    <div className="pointer-events-none absolute top-3 left-3 z-20 flex items-center gap-2 rounded-xl border border-white/15 bg-black/70 px-3 py-1.5 text-xs text-white/85 shadow-xl backdrop-blur-md">
      <span className="font-medium">
        <span className="text-white/50">Mode&nbsp;·&nbsp;</span>
        {describePalette(buildPalette)}
      </span>
      {selectedBuildTransitionId && (
        <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/65">
          {selectedBuildTransitionId}
        </span>
      )}
      <span className="font-mono text-[10px] text-white/50">Esc pour annuler</span>
    </div>
  )
}
