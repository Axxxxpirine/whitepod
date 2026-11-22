import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Activity, Battery, GitMerge, Layers, Lock, Pickaxe, Sun, Zap } from 'lucide-react';
import { RESOURCE_ENTRIES, getResourceSprite } from '@/game/ui/resourcePresentation';
import { lockedHint } from '@/game/ui/unlockPresentation';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  extractorRatePerMinute,
  isExtractorTypeId,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SPLITTER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  getBuildingType,
  isBeltTypeId,
  isProcessorTypeId,
  isStorageTypeId,
  resourceTypeLabel,
} from '@/game/data/buildingCatalog';
import { getRecipesForBuilding, type Recipe } from '@/game/data/recipeCatalog';
import type { GameEngine } from '@/game/engine/GameEngine';
import { PortKind, type Building } from '@/game/types';
import { cn } from '@/lib/utils';
import { useGameStore } from '@/store/useGameStore';
import { formatAmount } from '@/game/ui/depositPresentation';
import { BeltFlowStats } from './BeltFlowStats';
import { Icon } from './ui';

interface BuildingStatsPanelProps {
  building: Building;
  engine: GameEngine;
  /** Cache-buster: incremented on world changes so the panel recalculates. */
  worldTick: number;
  /** Cache-buster: incremented on energy topology changes. */
  energyVersion: number;
}

export const BuildingStatsPanel = memo(function BuildingStatsPanel({ building, engine }: BuildingStatsPanelProps) {
  const showsTimeDependentEnergy =
    building.typeId === BATTERY_BASIC_BUILDING_TYPE_ID || building.typeId === SOLAR_PANEL_BUILDING_TYPE_ID;
  useGameStore((s) => showsTimeDependentEnergy ? s.simulationTime : null);
  if (isBeltTypeId(building.typeId)) return <BeltFlowStats building={building} engine={engine} />;

  let rows: React.ReactNode = null;

  if (isExtractorTypeId(building.typeId)) {
    const resource = engine.getResourceAt(building.origin.x, building.origin.y);
    const powerState = engine.getBuildingPowerState(building.id);
    const isPowered = powerState === 'powered';
    const powerLabel = isPowered ? 'Alimente' : powerState === 'unpowered' ? 'Non alimente' : 'Non connecte';
    const powerClass = isPowered ? 'text-ok' : powerState === 'unpowered' ? 'text-error' : undefined;
    const remaining = engine.getDepositRemaining(building.id) ?? 0;
    const exhausted = remaining === 0;
    const rate = isPowered && !exhausted ? extractorRatePerMinute(building.typeId) : 0;
    // DESIGN.md: amber means "not enough".
    const depositValue = exhausted ? 'Épuisé' : engine.depletesDeposits ? formatAmount(remaining) : 'Illimité';

    rows = (
      <>
        <StatRow icon={Pickaxe} label="Ressource" value={resourceTypeLabel(resource)} />
        <StatRow
          icon={Layers}
          label="Gisement"
          value={depositValue}
          valueClass={exhausted ? 'text-accent-warm' : 'text-ink'}
        />
        <StatRow icon={Zap} label="Energie" value={powerLabel} valueClass={powerClass} />
        <StatRow
          icon={Activity}
          label="Debit"
          value={`${rate}/min`}
          valueClass={isPowered ? 'text-ink' : 'text-ink-muted'}
        />
      </>
    );
  } else if (isStorageTypeId(building.typeId)) {
    const stock = engine.getStorageInventory(building.id) ?? engine.getResourceCounts();
    const visibleStock = RESOURCE_ENTRIES.filter((r) => stock[r.key] > 0);

    rows = visibleStock.length > 0 ? (
      <div className="grid grid-cols-3 gap-1">
        {visibleStock.map((r) => (
          <ResourceStockCard key={r.key} sprite={r.sprite} alt={resourceTypeLabel(r.type)} count={stock[r.key]} />
        ))}
      </div>
    ) : (
      <div className="py-0.5 text-center text-xs text-ink-muted">Stockage vide</div>
    );
  } else if (building.typeId === BATTERY_BASIC_BUILDING_TYPE_ID) {
    const batterySpec = getBuildingType(building.typeId)?.energy?.battery;
    if (batterySpec) {
      const charge = engine.batteryCharges.get(building.id) ?? 0;
      const percent = Math.round((charge / batterySpec.capacity) * 100);

      const lowCharge = percent < 20;
      rows = (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Icon icon={Battery} size={11} className="text-ink-muted" />
              <span className="text-xs font-medium tabular-nums text-ink">{percent}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Icon icon={Zap} size={11} className="text-ink-muted" />
              <span className="text-xs font-medium tabular-nums text-ink">
                Reserve {Math.round(charge * 10) / 10} / {batterySpec.capacity} kWh
              </span>
            </div>
          </div>
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-sm bg-surface-2">
            <div
              className={`h-full rounded-sm transition-all duration-300 ${lowCharge ? 'bg-accent-warm' : 'bg-accent'}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      );
    }
  } else if (building.typeId === MERGER_BASIC_BUILDING_TYPE_ID || building.typeId === SPLITTER_BASIC_BUILDING_TYPE_ID) {
    // Junctions: a merger counts its inputs, a splitter its outputs.
    const isSplitter = building.typeId === SPLITTER_BASIC_BUILDING_TYPE_ID;
    const sideKind = isSplitter ? PortKind.Output : PortKind.Input;
    const buildingType = getBuildingType(building.typeId);
    const totalSide = buildingType?.ports.filter((p) => p.kind === sideKind).length ?? 3;
    const connections = engine.getConnectionsOf(building.id);
    const connectedSide = connections.filter((c) =>
      isSplitter ? c.from.building === building.id : c.to.building === building.id,
    ).length;

    // Collect resource types from powered extractors upstream of each connected input.
    const resourceSet = new Set<string>();
    for (const connection of connections) {
      if (connection.to.building !== building.id) continue;
      // Trace upstream through the incoming belt chain to find the extractor.
      const visited = new Set<number>();
      const queue: number[] = [connection.from.building];
      while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        const upstream = engine.getBuildings().get(current);
        if (!upstream) continue;
        if (isExtractorTypeId(upstream.typeId)) {
          if (engine.getBuildingPowerState(upstream.id) === 'powered') {
            resourceSet.add(resourceTypeLabel(engine.getResourceAt(upstream.origin.x, upstream.origin.y)));
          }
          break;
        }
        for (const conn of engine.getConnectionsOf(current)) {
          if (conn.to.building === current) queue.push(conn.from.building);
        }
      }
    }

    const resourceList = resourceSet.size > 0 ? [...resourceSet].join(', ') : 'Aucune';

    rows = (
      <>
        <StatRow icon={GitMerge} label={isSplitter ? 'Sorties' : 'Entrees'} value={`${connectedSide}/${totalSide}`} />
        <StatRow icon={Activity} label="Ressources" value={resourceList} />
      </>
    );
  } else if (building.typeId === SOLAR_PANEL_BUILDING_TYPE_ID) {
    const production = getBuildingType(building.typeId)?.energy?.production ?? 0;
    const network = engine.getEnergyStatsForBuilding(building.id);
    const surplusValue = network !== null ? `${Math.round(network.surplusPower)} kW` : 'Reseau isole';
    const surplusClass =
      network === null ? 'text-ink-muted' : network.surplusPower >= 0 ? 'text-ok' : 'text-error';
    const demandValue = network !== null ? `${Math.round(network.demandedConsumption)} kW` : '0 kW';

    rows = (
      <>
        <StatRow icon={Sun} label="Puissance nominale" value={`${production} kW`} />
        <StatRow
          icon={Zap}
          label={network !== null && network.surplusPower < 0 ? 'Deficit reseau' : 'Surplus reseau'}
          value={surplusValue}
          valueClass={surplusClass}
        />
        <StatRow icon={Activity} label="Demande" value={demandValue} valueClass={network ? 'text-ink' : 'text-ink-muted'} />
      </>
    );
  }

  if (isProcessorTypeId(building.typeId)) {
    const buildingKind = building.typeId === CONVERTER_BUILDING_TYPE_ID ? 'converter' : 'synthesizer';
    const recipes = getRecipesForBuilding(buildingKind as 'converter' | 'synthesizer');
    const state = engine.getProcessorState(building.id);
    const activeRecipeId = state?.recipeId ?? null;
    const powerState = engine.getBuildingPowerState(building.id);
    const logistics = engine.getProcessorLogisticsStatus(building.id);
    const isPowered = powerState === 'powered';
    const powerLabel = isPowered ? 'Alimente' : powerState === 'unpowered' ? 'Non alimente' : 'Non connecte';
    const powerClass = isPowered ? 'text-ok' : powerState === 'unpowered' ? 'text-error' : undefined;

    rows = (
      <>
        <StatRow icon={Zap} label="Energie" value={powerLabel} valueClass={powerClass} />
        {logistics?.badInput ? (
          <StatRow icon={Activity} label="Erreur" value="mauvais input" valueClass="text-error" />
        ) : null}
        <div className="mt-1">
          <span className="label text-ink-muted">Recette</span>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {recipes.map((recipe) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                active={recipe.id === activeRecipeId}
                lockHint={lockedHint(engine, 'recipes', recipe.id)}
                onClick={() => {
                  engine.setProcessorRecipe(
                    building.id,
                    recipe.id === activeRecipeId ? null : recipe.id,
                  );
                }}
              />
            ))}
          </div>
        </div>
      </>
    );
  }

  if (!rows) return null;

  return (
    <div className="flex flex-col gap-1 pt-0.5">
      <div className="h-px bg-border" />
      {rows}
    </div>
  );
});

function StatRow({
  icon,
  label,
  value,
  valueClass,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon icon={icon} size={11} className="text-ink-muted" />
      <span className="label text-ink-muted">{label}</span>
      <span className={`ml-auto text-xs font-medium tabular-nums ${valueClass ?? 'text-ink'}`}>{value}</span>
    </div>
  );
}

function ResourceStockCard({ sprite, alt, count }: { sprite: string; alt: string; count: number }) {
  return (
    <div className="rounded-sm border border-border bg-surface-2/60 px-1.5 py-1.5">
      <div className="relative flex min-h-11 items-center justify-center">
        <span className="absolute top-0 left-0 rounded-sm border border-border bg-surface px-1 text-[10px] tabular-nums text-ink">
          {count}
        </span>
        <img src={sprite} className="h-8 w-8 object-contain" alt={alt} />
      </div>
      <div className="mt-1 text-center text-[11px] leading-tight text-ink">{alt}</div>
    </div>
  );
}

function RecipeCard({
  recipe,
  active,
  lockHint,
  onClick,
}: {
  recipe: Recipe;
  active: boolean;
  /** Set when the recipe is locked (campaign): shown instead of the inputs. */
  lockHint: string | null;
  onClick: () => void;
}) {
  const outputLabel = resourceTypeLabel(recipe.output.resourceType);
  const inputLabel = formatRecipeInputs(recipe);
  const sprite = getResourceSprite(recipe.output.resourceType);
  const locked = lockHint !== null;

  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      aria-label={locked ? `Recette ${outputLabel}, verrouillée` : `Recette ${outputLabel}`}
      aria-pressed={active}
      aria-disabled={locked || undefined}
      title={lockHint ?? undefined}
      className={cn(
        'rounded-sm border px-1.5 py-1.5 text-left transition-colors',
        locked
          ? 'cursor-not-allowed border-border bg-surface text-ink-muted'
          : active
            ? 'border-accent bg-accent/10 text-ink'
            : 'border-border bg-surface-2/60 text-ink-muted hover:bg-surface-2',
      )}
    >
      <div className={cn('relative flex min-h-11 items-center justify-center', locked && 'opacity-30 grayscale')}>
        <span className="absolute top-0 left-0 rounded-sm border border-border bg-surface px-1 text-[10px] tabular-nums text-ink">
          {recipe.output.amount}x
        </span>
        {sprite ? (
          <img src={sprite} className="h-8 w-8 object-contain" alt={outputLabel} />
        ) : (
          <div aria-hidden="true" className="h-8 w-8" />
        )}
      </div>
      <div className="mt-1 text-center text-[11px] leading-tight text-ink">{outputLabel}</div>
      <div className="mt-1 text-[10px] leading-snug text-ink-muted">
        {locked ? (
          <span className="flex items-start gap-1">
            <Icon icon={Lock} size={10} className="mt-px" aria-hidden="true" />
            {lockHint}
          </span>
        ) : (
          inputLabel
        )}
      </div>
    </button>
  );
}

function formatRecipeInputs(recipe: Recipe): string {
  return recipe.inputs.map((i) => `${i.amount}x ${resourceTypeLabel(i.resourceType)}`).join(' + ');
}
