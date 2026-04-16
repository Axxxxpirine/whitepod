import { memo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Activity, Battery, GitMerge, Pickaxe, Sun, Zap } from 'lucide-react';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
  isBeltTypeId,
  resourceTypeLabel,
} from '@/game/data/buildingCatalog';
import type { GameEngine } from '@/game/engine/GameEngine';
import { PortKind, type Building } from '@/game/types';
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
  if (isBeltTypeId(building.typeId)) return <BeltFlowStats building={building} engine={engine} />;

  let rows: React.ReactNode = null;

  if (building.typeId === EXTRACTOR_BUILDING_TYPE_ID) {
    const resource = engine.getResourceAt(building.origin.x, building.origin.y);
    const powerState = engine.getBuildingPowerState(building.id);
    const isPowered = powerState === 'powered';
    const powerLabel = isPowered ? 'Alimente' : powerState === 'unpowered' ? 'Non alimente' : 'Non connecte';
    const powerClass = isPowered ? 'text-ok' : powerState === 'unpowered' ? 'text-error' : undefined;
    const rate = isPowered ? EXTRACTOR_RATE_PER_MIN : 0;

    rows = (
      <>
        <StatRow icon={Pickaxe} label="Ressource" value={resourceTypeLabel(resource)} />
        <StatRow icon={Zap} label="Energie" value={powerLabel} valueClass={powerClass} />
        <StatRow
          icon={Activity}
          label="Debit"
          value={`${rate}/min`}
          valueClass={isPowered ? 'text-ink' : 'text-ink-muted'}
        />
      </>
    );
  } else if (building.typeId === STORAGE_BUILDING_TYPE_ID) {
    const stock = engine.getResourceCounts();

    rows = (
      <div className="flex justify-around py-0.5">
        <ResourceStockRow sprite="sprites/coal.png" alt="Charbon" count={stock.coal} />
        <ResourceStockRow sprite="sprites/iron-ore.png" alt="Fer" count={stock.ironOre} />
        <ResourceStockRow sprite="sprites/copper-ore.png" alt="Cuivre" count={stock.copperOre} />
      </div>
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
                {Math.round(charge * 10) / 10} / {batterySpec.capacity} kWh
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
  } else if (building.typeId === MERGER_BASIC_BUILDING_TYPE_ID) {
    const buildingType = getBuildingType(building.typeId);
    const totalInputs = buildingType?.ports.filter((p) => p.kind === PortKind.Input).length ?? 3;
    const connections = engine.getConnectionsOf(building.id);
    const connectedInputs = connections.filter((c) => c.to.building === building.id).length;

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
        if (upstream.typeId === EXTRACTOR_BUILDING_TYPE_ID) {
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
        <StatRow icon={GitMerge} label="Entrees" value={`${connectedInputs}/${totalInputs}`} />
        <StatRow icon={Activity} label="Ressources" value={resourceList} />
      </>
    );
  } else if (building.typeId === SOLAR_PANEL_BUILDING_TYPE_ID) {
    const production = getBuildingType(building.typeId)?.energy?.production ?? 0;
    const network = engine.getEnergyNetworkForBuilding(building.id);
    const bilanValue = network !== null ? `${Math.round(network.remaining)} kW` : 'Reseau isole';
    const bilanClass =
      network === null ? 'text-ink-muted' : network.remaining >= 0 ? 'text-ok' : 'text-error';

    rows = (
      <>
        <StatRow icon={Sun} label="Production" value={`+${production} kW`} />
        <StatRow icon={Zap} label="Bilan reseau" value={bilanValue} valueClass={bilanClass} />
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

function ResourceStockRow({ sprite, alt, count }: { sprite: string; alt: string; count: number }) {
  return (
    <div className="flex items-center gap-1">
      <img src={sprite} className="h-3.5 w-3.5 object-contain" alt={alt} />
      <span className="text-xs font-medium tabular-nums text-ink">{count}</span>
    </div>
  );
}
