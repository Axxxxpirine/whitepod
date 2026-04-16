import { ResourceType, type ResourceType as ResourceTypeValue } from '../types';
import type { ResourceStock } from '../engine/GameEngine';

export interface ResourceMeta {
  readonly type: ResourceTypeValue;
  readonly key: keyof ResourceStock;
  readonly sprite: string;
  readonly tier: 0 | 1 | 2;
}

/**
 * Ordered list of all resource types with their UI metadata.
 * Base (tier 0) → Converter outputs (tier 1) → Synthesizer outputs (tier 1–2).
 */
export const RESOURCE_ENTRIES: readonly ResourceMeta[] = [
  // Tier 0 — raw resources (extracted)
  { type: ResourceType.Regolith, key: 'regolith', sprite: 'sprites/regolith.png', tier: 0 },
  { type: ResourceType.Hydrogen, key: 'hydrogen', sprite: 'sprites/hydrogen.png', tier: 0 },
  { type: ResourceType.Oxygen, key: 'oxygen', sprite: 'sprites/oxygen.png', tier: 0 },
  // Tier 1 — converter outputs
  { type: ResourceType.IronOxide, key: 'ironOxide', sprite: 'sprites/iron_oxide.png', tier: 1 },
  { type: ResourceType.AluminumOxide, key: 'aluminumOxide', sprite: 'sprites/aluminum_oxide.png', tier: 1 },
  { type: ResourceType.SiliconDioxide, key: 'siliconDioxide', sprite: 'sprites/silicon_dioxide.png', tier: 1 },
  { type: ResourceType.NitrogenGas, key: 'nitrogenGas', sprite: 'sprites/nitrogen_gas.png', tier: 1 },
  // Tier 1 — synthesizer outputs
  { type: ResourceType.Water, key: 'water', sprite: 'sprites/water.png', tier: 1 },
  { type: ResourceType.Methane, key: 'methane', sprite: 'sprites/methane.png', tier: 1 },
  { type: ResourceType.CarbonDioxide, key: 'carbonDioxide', sprite: 'sprites/carbon_dioxide.png', tier: 1 },
  { type: ResourceType.Ammonia, key: 'ammonia', sprite: 'sprites/ammonia.png', tier: 1 },
  // Tier 2 — advanced synthesizer output
  { type: ResourceType.CeramicPlates, key: 'ceramicPlates', sprite: 'sprites/ceramic_plates.png', tier: 2 },
];

const spriteByType = new Map<ResourceTypeValue, string>(
  RESOURCE_ENTRIES.map((r) => [r.type, r.sprite]),
);

export function getResourceSprite(type: ResourceTypeValue): string | undefined {
  return spriteByType.get(type);
}
