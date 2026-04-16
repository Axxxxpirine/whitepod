import { Activity } from 'lucide-react';
import { resourceTypeLabel } from '@/game/data/buildingCatalog';
import type { GameEngine } from '@/game/engine/GameEngine';
import { resolveBeltFlow } from '@/game/flow/resolveBeltFlow';
import type { Building, ResourceType as ResourceTypeT } from '@/game/types';
import { assetUrl, RESOURCE_SPRITE_PATHS } from '@/game/ui/spritePaths';
import { Icon } from './ui';

interface BeltFlowStatsProps {
  building: Building;
  engine: GameEngine;
}

export function BeltFlowStats({ building, engine }: BeltFlowStatsProps) {
  const entries = resolveBeltFlow(engine, building.id);

  if (entries.length === 0) {
    return (
      <div className="flex flex-col gap-1 pt-0.5">
        <div className="h-px bg-border" />
        <div className="flex items-center gap-1.5">
          <Icon icon={Activity} size={11} className="text-ink-muted" />
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
  const sprite = RESOURCE_SPRITE_PATHS.get(resourceType);
  const label = resourceTypeLabel(resourceType);
  const rateText = `${ratePerMinute}/min`;

  return (
    <div className="flex items-center gap-1.5">
      {sprite ? (
        <img src={assetUrl(sprite)} className="h-3.5 w-3.5 shrink-0 object-contain" alt={label} />
      ) : (
        <Icon icon={Activity} size={11} className="text-ink-muted" />
      )}
      <span className="label text-ink-muted">{label}</span>
      <span className="ml-auto text-xs font-medium tabular-nums text-ink">{rateText}</span>
    </div>
  );
}
