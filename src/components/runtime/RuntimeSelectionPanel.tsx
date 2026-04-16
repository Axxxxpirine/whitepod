import { useGameStore } from '@/store/game-store'
import { AssetImage } from './AssetImage'
import { stationCandidates } from '@/render/whitepod-assets'

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
        <div className="mb-2 flex items-center gap-2">
          <AssetImage
            key={selectedBuildTransitionId ?? 'recipe__preview'}
            candidates={stationCandidates(selectedBuildTransitionId ?? 'recipe__preview', 'card')}
            alt=""
            className="h-12 w-12 rounded-lg border border-white/10 bg-black/30 p-1"
            imageClassName="h-full w-full object-contain"
          />
          <div className="min-w-0">
            <div className="truncate font-medium text-white/90">{selectedBuildTransitionId ?? 'No blueprint'}</div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-white/35">Selected build</div>
          </div>
        </div>
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
