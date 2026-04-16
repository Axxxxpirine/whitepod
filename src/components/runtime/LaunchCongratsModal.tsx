import { AssetImage } from './AssetImage'
import { stationCandidates } from '@/render/whitepod-assets'

interface LaunchCongratsModalProps {
  open: boolean
  onClose: () => void
}

export function LaunchCongratsModal({ open, onClose }: LaunchCongratsModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-emerald-400/20 bg-[#071018]/95 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="grid grid-cols-[1fr_160px] gap-0 border-b border-white/10">
          <div className="px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-300/70">Mission complete</p>
            <h2 className="mt-1 text-2xl font-semibold text-white">Congratulations</h2>
          </div>
          <div className="bg-white/5 p-3">
            <AssetImage candidates={stationCandidates('recipe__assemble_rocket', 'card')} alt="Rocket" className="h-full w-full rounded-2xl border border-white/10 bg-black/20 p-2" imageClassName="h-full w-full object-contain" />
          </div>
        </div>

        <div className="space-y-4 px-5 py-5 text-sm text-white/70">
          <p>The demonstration successfully reached rocket launch.</p>
          <p>The factory chain is now able to stock `rocket_ready` and complete the launch sequence.</p>

          <button
            type="button"
            className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 transition-colors hover:bg-emerald-400/15"
            onClick={onClose}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}
