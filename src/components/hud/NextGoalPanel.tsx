import { memo, useEffect, useMemo, useState } from 'react';
import { HUB_BUILDING_TYPE_ID, getBuildingType, resourceTypeLabel } from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import type { Milestone } from '@/game/data/milestoneCatalog';
import { MINIMAP_MARGIN, MINIMAP_SCREEN_BOTTOM } from '@/game/renderer/minimapProjection';
import { chapterLabel, unlockLabels } from '@/game/ui/milestonePresentation';
import { getResourceSprite } from '@/game/ui/resourcePresentation';
import { useGameStore } from '@/store/useGameStore';
import { cn } from '@/lib/utils';
import { Panel, PanelHeading } from '../ui';

/** How long the "milestone reached" line stays up (full celebration comes in 0.4). */
const COMPLETION_NOTICE_MS = 5000;
/** Gap between the minimap and the panel, on the 4px spacing scale. */
const GAP_BELOW_MINIMAP = 12;

const HUB_NAME = getBuildingType(HUB_BUILDING_TYPE_ID)?.name ?? 'hub';

/**
 * Campaign "next goal": the milestone the hub requests, one progress bar per
 * resource (counted in the hub only), what it unlocks, and the action that
 * completes it once everything is delivered. Hidden in sandbox.
 */
function NextGoalPanelView() {
  const engine = useGameStore((s) => s.engine);
  // Hub deliveries and completions both arrive as world changes.
  const worldVersion = useGameStore((s) => s.worldVersion);
  const [reached, setReached] = useState<Milestone | null>(null);

  const campaign = engine?.gameMode === GameMode.Campaign;
  const progress = useMemo(() => {
    void worldVersion;
    return campaign ? (engine?.getMilestoneProgress() ?? null) : null;
  }, [engine, campaign, worldVersion]);

  useEffect(() => {
    if (!engine) return;
    return engine.onMilestoneCompleted((milestone) => setReached(milestone));
  }, [engine]);

  useEffect(() => {
    if (!reached) return;
    const timeoutId = window.setTimeout(() => setReached(null), COMPLETION_NOTICE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [reached]);

  if (!engine || !campaign) return null;

  const complete = () => {
    if (!engine.completeActiveMilestone()) return;
    engine.emitSfx({ type: 'ui_confirm', context: 'milestone_complete' });
  };

  return (
    <section
      aria-label="Prochain objectif"
      className="pointer-events-auto absolute w-60"
      style={{ top: MINIMAP_SCREEN_BOTTOM + GAP_BELOW_MINIMAP, right: MINIMAP_MARGIN }}
    >
      <Panel className="flex flex-col gap-2 px-3 py-2 text-ink">
        {reached && (
          <div role="status" className="border-b border-border pb-2 text-xs">
            <div className="text-ok">Palier atteint · {reached.title}</div>
            {unlockLabels(reached.unlocks).length > 0 && (
              <div className="mt-0.5 text-ink-muted">Débloqué : {unlockLabels(reached.unlocks).join(', ')}</div>
            )}
          </div>
        )}

        {progress ? (
          <>
            <div>
              <div className="label text-ink-muted">{chapterLabel(progress.milestone.chapter)}</div>
              <PanelHeading className="text-lg">{progress.milestone.title}</PanelHeading>
            </div>

            <div className="text-[11px] text-ink-muted">À livrer au {HUB_NAME}</div>
            <ul className="flex flex-col gap-1">
              {progress.requirements.map((requirement) => {
                const label = resourceTypeLabel(requirement.resourceType);
                const done = requirement.available >= requirement.required;
                const sprite = getResourceSprite(requirement.resourceType);
                return (
                  <li key={requirement.resourceType} className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 text-xs">
                      {sprite && <img src={sprite} alt="" className="h-3.5 w-3.5 object-contain" draggable={false} />}
                      <span className="min-w-0 flex-1 truncate">{label}</span>
                      <span className={cn('tabular-nums', done ? 'text-ok' : 'text-ink')}>
                        {requirement.available} / {requirement.required}
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-label={label}
                      aria-valuemin={0}
                      aria-valuemax={requirement.required}
                      aria-valuenow={requirement.available}
                      className="h-1 overflow-hidden rounded-sm bg-surface-2"
                    >
                      <div
                        className={cn('h-full', done ? 'bg-ok' : 'bg-accent')}
                        style={{ width: `${(requirement.available / requirement.required) * 100}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>

            {unlockLabels(progress.milestone.unlocks).length > 0 && (
              <div className="text-[11px] text-ink-muted">
                Débloque : <span className="text-ink">{unlockLabels(progress.milestone.unlocks).join(', ')}</span>
              </div>
            )}

            <button
              type="button"
              onClick={complete}
              disabled={!progress.ready}
              className={cn(
                'label rounded-sm border px-2 py-1 transition-colors',
                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                progress.ready
                  ? 'cursor-pointer border-accent bg-accent/10 text-accent hover:bg-accent/20'
                  : 'cursor-not-allowed border-border bg-surface-2 text-ink-muted',
              )}
            >
              {progress.ready ? 'Valider le palier' : 'Livraisons en cours'}
            </button>
          </>
        ) : (
          <div className="text-xs text-ink-muted">Tous les paliers de cette version sont atteints.</div>
        )}
      </Panel>
    </section>
  );
}

/** Renders from its own subscriptions: the HUD around it re-renders several times a second. */
export const NextGoalPanel = memo(NextGoalPanelView);
