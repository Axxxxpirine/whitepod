import type { LucideIcon } from 'lucide-react';
import { Activity, Battery, Pickaxe, Sun, Zap } from 'lucide-react';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
  isBeltTypeId,
  resourceTypeLabel,
} from '@/game/data/buildingCatalog';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { Building } from '@/game/types';

interface BuildingStatsPanelProps {
  building: Building;
  engine: GameEngine;
}

export function BuildingStatsPanel({ building, engine }: BuildingStatsPanelProps) {
  if (isBeltTypeId(building.typeId)) return null;

  let rows: React.ReactNode = null;

  if (building.typeId === EXTRACTOR_BUILDING_TYPE_ID) {
    const resource = engine.getResourceAt(building.origin.x, building.origin.y);
    const powerState = engine.getBuildingPowerState(building.id);
    const isPowered = powerState === 'powered';
    const powerLabel = isPowered ? 'Alimente' : powerState === 'unpowered' ? 'Non alimente' : 'Non connecte';
    const powerClass = isPowered ? 'text-emerald-300' : powerState === 'unpowered' ? 'text-red-300' : undefined;
    const rate = isPowered ? EXTRACTOR_RATE_PER_MIN : 0;

    rows = (
      <>
        <StatRow icon={Pickaxe} label="Ressource" value={resourceTypeLabel(resource)} />
        <StatRow icon={Zap} label="Energie" value={powerLabel} valueClass={powerClass} />
        <StatRow
          icon={Activity}
          label="Debit"
          value={`${rate}/min`}
          valueClass={isPowered ? 'text-white/90' : 'text-white/40'}
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

      rows = (
        <>
          <StatRow icon={Battery} label="Charge" value={`${percent}%`} />
          <StatRow icon={Zap} label="Stockage" value={`${Math.round(charge * 10) / 10} / ${batterySpec.capacity} kWh`} />
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-teal-400 transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </>
      );
    }
  } else if (building.typeId === SOLAR_PANEL_BUILDING_TYPE_ID) {
    const production = getBuildingType(building.typeId)?.energy?.production ?? 0;
    const network = engine.getEnergyNetworkForBuilding(building.id);
    const bilanValue = network !== null ? `${network.remaining} kWh` : 'Reseau isole';
    const bilanClass =
      network === null ? 'text-white/50' : network.remaining >= 0 ? 'text-emerald-300' : 'text-red-300';

    rows = (
      <>
        <StatRow icon={Sun} label="Production" value={`+${production} kWh`} />
        <StatRow icon={Zap} label="Bilan reseau" value={bilanValue} valueClass={bilanClass} />
      </>
    );
  }

  if (!rows) return null;

  return (
    <div className="flex flex-col gap-1 pt-0.5">
      <div className="h-px bg-white/10" />
      {rows}
    </div>
  );
}

function StatRow({
  icon: Icon,
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
      <Icon size={11} className="shrink-0 text-white/40" />
      <span className="text-xs text-white/50">{label}</span>
      <span className={`ml-auto text-xs font-medium ${valueClass ?? 'text-white/90'}`}>{value}</span>
    </div>
  );
}

function ResourceStockRow({ sprite, alt, count }: { sprite: string; alt: string; count: number }) {
  return (
    <div className="flex items-center gap-1">
      <img src={sprite} className="h-3.5 w-3.5 object-contain" alt={alt} />
      <span className="text-xs font-medium text-white/90">{count}</span>
    </div>
  );
}
