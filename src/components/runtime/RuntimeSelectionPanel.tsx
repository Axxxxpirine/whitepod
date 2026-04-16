import { useGameStore } from '@/store/game-store'

function formatCell(cell: { x: number; y: number } | null): string {
  return cell ? `${cell.x}, ${cell.y}` : '-'
}

export function RuntimeSelectionPanel() {
  const selectedBuildCell = useGameStore((s) => s.selectedBuildCell)
  const hoveredBuildCell = useGameStore((s) => s.hoveredBuildCell)
  const buildPalette = useGameStore((s) => s.buildPalette)
  const selectedBuildTransitionId = useGameStore((s) => s.selectedBuildTransitionId)

  if (!selectedBuildCell && !hoveredBuildCell && !selectedBuildTransitionId) return null

  return (
    <div className="pointer-events-auto absolute left-3 top-16 z-20 w-[220px] rounded-xl border border-white/15 bg-black/80 px-3 py-2 text-white shadow-2xl backdrop-blur-md">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
        Selection
      </div>
      <div className="space-y-1 text-xs text-white/85">
        <div className="flex items-center justify-between gap-2">
          <span className="text-white/50">Cell</span>
          <span className="font-mono">{formatCell(selectedBuildCell ?? hoveredBuildCell)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-white/50">Palette</span>
          <span className="font-medium capitalize">{buildPalette}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-white/50">Blueprint</span>
          <span className="truncate font-mono text-[10px] text-white/75">{selectedBuildTransitionId ?? '-'}</span>
        </div>
      </div>
    </div>
  )
}
