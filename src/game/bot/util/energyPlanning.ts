import { getDaylightFactor } from '@/game/renderer/DayNightOverlayRenderer';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  getBuildingType,
} from '@/game/data/buildingCatalog';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { TileCoord } from '@/game/types';

export interface EnergyClusterRequirements {
  solar: number;
  battery: number;
}

export function calculateRequiredSolar(extractorCount: number): number {
  const baseSolar = Math.ceil(extractorCount * 1.25);
  return Math.max(baseSolar, 1);
}

export function calculateRequiredBatteries(engine: GameEngine): number {
  const extractors = engine.getBuildings();
  let totalConsumption = 0;

  for (const [, building] of extractors) {
    const type = getBuildingType(building.typeId);
    if (!type) continue;

    if (building.typeId === EXTRACTOR_BUILDING_TYPE_ID) {
      totalConsumption += 4;
    } else if (building.typeId === CONVERTER_BUILDING_TYPE_ID) {
      totalConsumption += 6;
    }
  }

  const batteryNeeded = Math.max(1, Math.ceil(totalConsumption / 20));
  return batteryNeeded;
}

export function shouldPrioritizeBatteryOverSolar(engine: GameEngine): boolean {
  const batteryCharges = engine.batteryCharges;

  if (!batteryCharges || batteryCharges.size === 0) return true;

  const charges = Array.from(batteryCharges.values());
  const avgCharge = charges.reduce((sum, charge) => sum + charge, 0) / charges.length;
  return avgCharge < 50;
}

export function findEnergyHubForModule(engine: GameEngine, moduleCenter: TileCoord): number | null {
  const solarPanels: Array<{ id: number; distance: number }> = [];
  const batteries: Array<{ id: number; distance: number }> = [];

  for (const [id, building] of engine.getBuildings()) {
    const type = getBuildingType(building.typeId);
    if (!type) continue;

    const distance = Math.abs(building.origin.x - moduleCenter.x) + Math.abs(building.origin.y - moduleCenter.y);

    if (building.typeId === SOLAR_PANEL_BUILDING_TYPE_ID) {
      solarPanels.push({ id, distance });
    } else if (building.typeId === BATTERY_BASIC_BUILDING_TYPE_ID) {
      batteries.push({ id, distance });
    }
  }

  if (batteries.length > 0) {
    batteries.sort((a, b) => a.distance - b.distance || a.id - b.id);
    return batteries[0]!.id;
  }

  if (solarPanels.length > 0) {
    solarPanels.sort((a, b) => a.distance - b.distance || a.id - b.id);
    return solarPanels[0]!.id;
  }

  return null;
}

export function checkBatteryChargeState(engine: GameEngine): { chargedPercent: number; canSupportNight: boolean } {
  const batteryCharges = engine.batteryCharges;

  if (!batteryCharges || batteryCharges.size === 0) {
    return { chargedPercent: 0, canSupportNight: false };
  }

  const charges = Array.from(batteryCharges.values());
  const avgCharge = charges.reduce((sum, charge) => sum + charge, 0) / charges.length;
  const stats = engine.getEnergyStorageTotals();

  const nightConsumption = 100;
  const canSupportNight = stats.stored >= nightConsumption || avgCharge >= 50;

  return { chargedPercent: avgCharge, canSupportNight };
}

export function calculateLocalClusterRequirements(
  engine: GameEngine,
  moduleCenter: TileCoord,
  radius: number = 3,
): EnergyClusterRequirements {
  let extractorCount = 0;
  let converterCount = 0;

  for (const [, building] of engine.getBuildings()) {
    const distance = Math.abs(building.origin.x - moduleCenter.x) + Math.abs(building.origin.y - moduleCenter.y);
    if (distance > radius) continue;

    if (building.typeId === EXTRACTOR_BUILDING_TYPE_ID) {
      extractorCount++;
    } else if (building.typeId === CONVERTER_BUILDING_TYPE_ID) {
      converterCount++;
    }
  }

  const totalConsumption = extractorCount * 4 + converterCount * 6;
  const solarNeeded = Math.ceil(totalConsumption / 10);
  const batteryNeeded = Math.max(1, Math.ceil(totalConsumption * 0.5 / 10));

  return { solar: solarNeeded, battery: batteryNeeded };
}

export function getDaylightFactorForEngine(engine: GameEngine): number {
  return getDaylightFactor(engine.simulationTime);
}

export function isNightTime(engine: GameEngine): boolean {
  const daylight = getDaylightFactor(engine.simulationTime);
  return daylight < 0.3;
}

export function shouldAddBatteryBeforeSolar(engine: GameEngine, pendingNightPowerDeficit: boolean): boolean {
  const { chargedPercent, canSupportNight } = checkBatteryChargeState(engine);

  if (pendingNightPowerDeficit && !canSupportNight) {
    return true;
  }

  return chargedPercent < 50;
}

export function countEnergyBuildingsByType(
  engine: GameEngine,
  typeId: string,
  center: TileCoord,
  radius: number,
): number {
  let count = 0;

  for (const [, building] of engine.getBuildings()) {
    const type = getBuildingType(building.typeId);
    if (!type || type.id !== typeId) continue;

    const distance = Math.abs(building.origin.x - center.x) + Math.abs(building.origin.y - center.y);
    if (distance <= radius) {
      count++;
    }
  }

  return count;
}
