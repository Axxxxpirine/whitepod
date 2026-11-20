import { ResourceType, type ResourceType as ResourceTypeValue } from '../types';
import type { ResourceStock } from '../engine/GameEngine';

/** Inventory key of each storable resource type. Single source of truth for type → key. */
export const RESOURCE_STOCK_KEY: Readonly<Record<number, keyof ResourceStock>> = {
  [ResourceType.Regolith]: 'regolith',
  [ResourceType.Hydrogen]: 'hydrogen',
  [ResourceType.Oxygen]: 'oxygen',
  [ResourceType.IronOxide]: 'ironOxide',
  [ResourceType.AluminumOxide]: 'aluminumOxide',
  [ResourceType.SiliconDioxide]: 'siliconDioxide',
  [ResourceType.NitrogenGas]: 'nitrogenGas',
  [ResourceType.Water]: 'water',
  [ResourceType.Methane]: 'methane',
  [ResourceType.CarbonDioxide]: 'carbonDioxide',
  [ResourceType.Ammonia]: 'ammonia',
  [ResourceType.CeramicPlates]: 'ceramicPlates',
};

export function resourceStockKey(type: ResourceTypeValue): keyof ResourceStock | undefined {
  return RESOURCE_STOCK_KEY[type];
}
