import { ResourceType, type ResourceType as ResourceTypeT } from '@/game/types';
import type { GameEngine } from '@/game/engine/GameEngine';

export interface ResourceRates {
  regolith: number;
  hydrogen: number;
  oxygen: number;
  ironOxide: number;
  aluminumOxide: number;
  siliconDioxide: number;
  nitrogenGas: number;
  water: number;
  methane: number;
  carbonDioxide: number;
  ammonia: number;
  ceramicPlates: number;
  carbon: number;
}

export function getNetProductionRates(engine: GameEngine): Map<ResourceTypeT, number> {
  const rates = engine.getResourceRates();

  const rateMap = new Map<ResourceTypeT, number>();
  rateMap.set(ResourceType.Regolith, rates.regolith ?? 0);
  rateMap.set(ResourceType.Hydrogen, rates.hydrogen ?? 0);
  rateMap.set(ResourceType.Oxygen, rates.oxygen ?? 0);
  rateMap.set(ResourceType.IronOxide, rates.ironOxide ?? 0);
  rateMap.set(ResourceType.AluminumOxide, rates.aluminumOxide ?? 0);
  rateMap.set(ResourceType.SiliconDioxide, rates.siliconDioxide ?? 0);
  rateMap.set(ResourceType.NitrogenGas, rates.nitrogenGas ?? 0);
  rateMap.set(ResourceType.Water, rates.water ?? 0);
  rateMap.set(ResourceType.Methane, rates.methane ?? 0);
  rateMap.set(ResourceType.CarbonDioxide, rates.carbonDioxide ?? 0);
  rateMap.set(ResourceType.Ammonia, rates.ammonia ?? 0);
  rateMap.set(ResourceType.CeramicPlates, rates.ceramicPlates ?? 0);
  rateMap.set(ResourceType.Carbon, rates.carbon ?? 0);

  return rateMap;
}

export function shouldThrottleExtractorPlacement(
  engine: GameEngine,
  resourceType: ResourceTypeT,
): boolean {
  const rates = getNetProductionRates(engine);
  const rate = rates.get(resourceType) ?? 0;

  return rate < 0;
}

export function detectResourceBottlenecks(engine: GameEngine): ResourceTypeT[] {
  const rates = getNetProductionRates(engine);
  const bottlenecks: ResourceTypeT[] = [];

  for (const [resource, rate] of rates.entries()) {
    if (rate < 0) bottlenecks.push(resource);
  }

  return bottlenecks;
}

export function getStockGrowthTrend(engine: GameEngine): Map<ResourceTypeT, number> {
  const stock = engine.getResourceCounts();

  const trendMap = new Map<ResourceTypeT, number>();
  trendMap.set(ResourceType.Regolith, stock.regolith ?? 0);
  trendMap.set(ResourceType.Hydrogen, stock.hydrogen ?? 0);
  trendMap.set(ResourceType.Oxygen, stock.oxygen ?? 0);
  trendMap.set(ResourceType.IronOxide, stock.ironOxide ?? 0);
  trendMap.set(ResourceType.AluminumOxide, stock.aluminumOxide ?? 0);

  return trendMap;
}

export function hasSufficientStock(
  engine: GameEngine,
  resourceType: ResourceTypeT,
  threshold: number,
): boolean {
  const stock = engine.getResourceCounts();

  switch (resourceType) {
    case ResourceType.Regolith:
      return (stock.regolith ?? 0) >= threshold;
    case ResourceType.Hydrogen:
      return (stock.hydrogen ?? 0) >= threshold;
    case ResourceType.Oxygen:
      return (stock.oxygen ?? 0) >= threshold;
    case ResourceType.IronOxide:
      return (stock.ironOxide ?? 0) >= threshold;
    case ResourceType.AluminumOxide:
      return (stock.aluminumOxide ?? 0) >= threshold;
    default:
      return false;
  }
}

export function canBuildSynthesizer(engine: GameEngine): boolean {
  const ironStock = engine.getResourceCounts().ironOxide ?? 0;
  const aluminumStock = engine.getResourceCounts().aluminumOxide ?? 0;

  return ironStock >= 50 && aluminumStock >= 50;
}

export function getExtractorCount(engine: GameEngine): number {
  let count = 0;

  for (const [, building] of engine.getBuildings()) {
    if (building.typeId === 'extractor_basic') {
      count++;
    }
  }

  return count;
}

export function shouldDeferExpansion(engine: GameEngine): boolean {
  const rates = getNetProductionRates(engine);
  const regolithRate = rates.get(ResourceType.Regolith) ?? 0;

  return regolithRate < -10;
}

export function getProcessingCapacity(engine: GameEngine): {
  converters: number;
  synthesizers: number;
  activeRecipes: number;
} {
  let converters = 0;
  let synthesizers = 0;
  let activeRecipes = 0;

  for (const [id, building] of engine.getBuildings()) {
    const state = engine.getProcessorState(id);
    if (!state) continue;

    if (building.typeId === 'converter_basic') {
      converters++;
      if (state.recipeId !== null) activeRecipes++;
    } else if (building.typeId === 'synthesizer_basic') {
      synthesizers++;
      if (state.recipeId !== null) activeRecipes++;
    }
  }

  return { converters, synthesizers, activeRecipes };
}
