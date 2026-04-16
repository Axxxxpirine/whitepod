import { useEffect, useMemo } from 'react'
import {
  buildTierGuideSections,
  buildPlaceMetaMap,
  getPlaceLabel,
  getStationBuildCost,
} from '@/core/build-planning'
import type { LunarChemistryMetadata, Transition } from '@/core/types'
import { AssetImage } from '@/components/runtime/AssetImage'
import { resourceCandidates, stationCandidates } from '@/render/whitepod-assets'

interface TierGuideModalProps {
  open: boolean
  metadata: LunarChemistryMetadata | null
  transitions: readonly Transition[]
  onClose: () => void
}

export function TierGuideModal({ open, metadata, transitions, onClose }: TierGuideModalProps) {
  const placeMetaById = useMemo(() => buildPlaceMetaMap(metadata), [metadata])
  const sections = useMemo(() => buildTierGuideSections(metadata, transitions), [metadata, transitions])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 py-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#09101a]/95 shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Help</p>
            <h2 className="text-xl font-semibold text-white">Tier progression guide</h2>
            <p className="max-w-3xl text-sm text-white/65">
              To reach the next tier, keep the current tier flowing to stock, then place the matching recipe station.
              Building a station now spends its required input tokens: conveyors spend surface items, storage spends bus items,
              recipe stations spend stock inputs, and extractors are free.
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="grid min-h-0 gap-4 overflow-auto px-5 py-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <h3 className="text-sm font-semibold text-white">Build loop</h3>
            <div className="grid grid-cols-3 gap-2">
              <AssetImage candidates={resourceCandidates('lunar_hydrogen', 'card')} alt="Hydrogen" className="rounded-xl border border-white/10 bg-black/20 p-2" imageClassName="h-full w-full object-contain" />
              <AssetImage candidates={resourceCandidates('lunar_oxygen', 'card')} alt="Oxygen" className="rounded-xl border border-white/10 bg-black/20 p-2" imageClassName="h-full w-full object-contain" />
              <AssetImage candidates={stationCandidates('recipe__rocket_fuel', 'card')} alt="Rocket fuel" className="rounded-xl border border-white/10 bg-black/20 p-2" imageClassName="h-full w-full object-contain" />
            </div>
            <ol className="space-y-3 text-sm text-white/70">
              <li>1. For tier 0, place extractors near deposits.</li>
              <li>2. Add the matching conveyor, then storage, so the resource reaches stock.</li>
              <li>3. Spend stocked inputs to place recipe stations for the next tier.</li>
              <li>4. Once a new output appears on the surface, add its conveyor and storage so later tiers can consume it.</li>
              <li>5. Repeat until you can stock `rocket_ready` and trigger the rocket launch.</li>
            </ol>
          </aside>

          <div className="space-y-4">
            {sections.map(section => (
              <section key={section.tier} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/40">Tier {section.tier} to Tier {section.nextTier}</p>
                    <h3 className="text-lg font-semibold text-white">Produce tier {section.nextTier} resources</h3>
                  </div>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/60">
                    {section.recipes.length} recipe{section.recipes.length > 1 ? 's' : ''}
                  </span>
                </div>

                <p className="mt-3 text-sm text-white/65">
                  Keep these tier {section.tier} resources stocked: {section.tierResourceNames.join(', ') || 'none'}.
                </p>

                <div className="mt-4 grid gap-3 xl:grid-cols-2">
                  {section.recipes.map(recipe => {
                    const buildCost = getStationBuildCost(
                      transitions.find(transition => transition.id === recipe.transitionId) ?? { id: recipe.transitionId, consumes: [], produces: [] },
                    )

                    return (
                      <article key={recipe.transitionId} className="rounded-2xl border border-white/8 bg-black/20 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.12em] text-emerald-300/70">Output</p>
                            <h4 className="text-base font-semibold text-white">{recipe.outputName}</h4>
                          </div>
                          <code className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-white/50">{recipe.transitionId}</code>
                        </div>

                        <p className="mt-3 text-sm text-white/65">Build `{recipe.transitionName}` after you have the following stock:</p>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {recipe.inputs.map(input => (
                            <span key={`${recipe.transitionId}:${input.placeId}`} className="rounded-full bg-white/6 px-3 py-1 text-xs text-white/75">
                              {input.qty} x {input.placeName}{input.tier !== null ? ` · tier ${input.tier}` : ''}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.02] p-3 text-sm text-white/60">
                          After the recipe starts outputting on the surface, add:
                          <div className="mt-2 flex flex-wrap gap-2">
                            <span className="rounded-full bg-white/6 px-3 py-1 text-xs text-white/75">Conveyor: {getPlaceLabel(`${recipe.outputPlaceId.slice(0, -'_surface'.length)}_surface`, placeMetaById)}</span>
                            <span className="rounded-full bg-white/6 px-3 py-1 text-xs text-white/75">Storage: {getPlaceLabel(`${recipe.outputPlaceId.slice(0, -'_surface'.length)}_bus`, placeMetaById)}</span>
                            <span className="rounded-full bg-white/6 px-3 py-1 text-xs text-white/75">Build cost: {buildCost.length === 0 ? 'free' : buildCost.map(cost => `${cost.qty} x ${getPlaceLabel(cost.place, placeMetaById)}`).join(' + ')}</span>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
