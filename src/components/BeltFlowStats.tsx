import { Activity } from 'lucide-react';
import { resourceTypeLabel } from '@/game/data/buildingCatalog';
import type { GameEngine } from '@/game/engine/GameEngine';
import { resolveBeltFlow } from '@/game/flow/resolveBeltFlow';
import { ResourceType, type Building, type ResourceType as ResourceTypeT } from '@/game/types';

interface BeltFlowStatsProps {
  building: Building;
  engine: GameEngine;
}

const SPRITE_BY_RESOURCE: Record<number, string> = {
  [ResourceType.Coal]: 'sprites/coal.png',
  [ResourceType.IronOre]: 'sprites/iron-ore.png',
  [ResourceType.CopperOre]: 'sprites/copper-ore.png',
};

export function BeltFlowStats({ building, engine }: BeltFlowStatsProps) {
  const entries = resolveBeltFlow(engine, building.id);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-1 pt-0.5">
        <div className="h-px bg-border" />
        <div className="flex items-center gap-1.5">
          <Activity size={11} strokeWidth={1.5} className="shrink-0 text-ink-muted" />
          <span className="label text-ink-muted">Aucun flux actif</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 pt-0.5">
      <div className="h-px bg-border" />
      {entries.map((entry) => (
        <FlowRow key={entry.resourceType} resourceType={entry.resourceType} ratePerMinute={entry.ratePerMinute} />
      ))}
    </div>
  );
}

function FlowRow({ resourceType, ratePerMinute }: { resourceType: ResourceTypeT; ratePerMinute: number }) {
  const sprite = SPRITE_BY_RESOURCE[resourceType];
  const label = resourceTypeLabel(resourceType);
  const rateText = `${ratePerMinute}/min`;

  return (
    <div className="flex items-center gap-1.5">
      {sprite ? (
        <img src={sprite} className="h-3.5 w-3.5 shrink-0 object-contain" alt={label} />
      ) : (
        <Activity size={11} strokeWidth={1.5} className="shrink-0 text-ink-muted" />
      )}
      <span className="label text-ink-muted">{label}</span>
      <span className="ml-auto text-xs font-medium tabular-nums text-ink">{rateText}</span>
    </div>
  );
}
