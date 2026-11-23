import { Activity, Gauge } from 'lucide-react';
import { resourceTypeLabel } from '@/game/data/buildingCatalog';
import type { GameEngine } from '@/game/engine/GameEngine';
import { resolveBeltFlow } from '@/game/flow/resolveBeltFlow';
import { formatRate } from '@/game/ui/numberPresentation';
import { getResourceSprite } from '@/game/ui/resourcePresentation';
import { type Building, type ResourceType as ResourceTypeT } from '@/game/types';
import { cn } from '@/lib/utils';
import { Icon } from './ui';

interface BeltFlowStatsProps {
  building: Building;
  engine: GameEngine;
}

export function BeltFlowStats({ building, engine }: BeltFlowStatsProps) {
  const entries = resolveBeltFlow(engine, building.id);
  const run = engine.getBeltRunStats(building.id);
  const demand = entries.reduce((sum, entry) => sum + entry.ratePerMinute, 0);
  const load = run ? <LoadRow demand={demand} capacity={run.capacityPerMinute} saturated={run.saturated} /> : null;

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-1 pt-0.5">
        <div className="h-px bg-border" />
        <div className="flex items-center gap-1.5">
          <Icon icon={Activity} size={11} className="text-ink-muted" />
          <span className="label text-ink-muted">Aucun flux actif</span>
        </div>
        {load}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 pt-0.5">
      <div className="h-px bg-border" />
      {entries.map((entry) => (
        <FlowRow key={entry.resourceType} resourceType={entry.resourceType} ratePerMinute={entry.ratePerMinute} />
      ))}
      {load}
    </div>
  );
}

function FlowRow({ resourceType, ratePerMinute }: { resourceType: ResourceTypeT; ratePerMinute: number }) {
  const sprite = getResourceSprite(resourceType);
  const label = resourceTypeLabel(resourceType);
  const rateText = formatRate(ratePerMinute);

  return (
    <div className="flex items-center gap-1.5">
      {sprite ? (
        <img src={sprite} className="h-3.5 w-3.5 shrink-0 object-contain" alt={label} />
      ) : (
        <Icon icon={Activity} size={11} className="text-ink-muted" />
      )}
      <span className="label text-ink-muted">{label}</span>
      <span className="ml-auto text-xs font-medium tabular-nums text-ink">{rateText}</span>
    </div>
  );
}

/**
 * What the sources upstream would send against what the belt carries. Amber
 * when the belt refuses units, or would at full production.
 */
function LoadRow({ demand, capacity, saturated }: { demand: number; capacity: number; saturated: boolean }) {
  const over = saturated || demand > capacity;
  return (
    <div role="status" className="flex items-center gap-1.5">
      <Icon icon={Gauge} size={11} className={over ? 'text-accent-warm' : 'text-ink-muted'} />
      <span className={cn('label', over ? 'text-accent-warm' : 'text-ink-muted')}>{over ? 'Saturé' : 'Débit max'}</span>
      <span className={cn('ml-auto text-xs font-medium tabular-nums', over ? 'text-accent-warm' : 'text-ink')}>
        {Math.round(demand)} / {capacity}/min
      </span>
    </div>
  );
}
