import { ResourceType, type ResourceType as ResourceTypeValue } from '../types';
import type { ResourceStock } from '../engine/GameEngine';
import { RESOURCE_SPRITE_PATHS } from './spritePaths';

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
  { type: ResourceType.Regolith, key: 'regolith', sprite: resourceSprite(ResourceType.Regolith), tier: 0 },
  { type: ResourceType.Hydrogen, key: 'hydrogen', sprite: resourceSprite(ResourceType.Hydrogen), tier: 0 },
  { type: ResourceType.Oxygen, key: 'oxygen', sprite: resourceSprite(ResourceType.Oxygen), tier: 0 },
  // Tier 1 — converter outputs
  { type: ResourceType.IronOxide, key: 'ironOxide', sprite: resourceSprite(ResourceType.IronOxide), tier: 1 },
  { type: ResourceType.AluminumOxide, key: 'aluminumOxide', sprite: resourceSprite(ResourceType.AluminumOxide), tier: 1 },
  { type: ResourceType.SiliconDioxide, key: 'siliconDioxide', sprite: resourceSprite(ResourceType.SiliconDioxide), tier: 1 },
  { type: ResourceType.NitrogenGas, key: 'nitrogenGas', sprite: resourceSprite(ResourceType.NitrogenGas), tier: 1 },
  // Tier 1 — synthesizer outputs
  { type: ResourceType.Water, key: 'water', sprite: resourceSprite(ResourceType.Water), tier: 1 },
  { type: ResourceType.Methane, key: 'methane', sprite: resourceSprite(ResourceType.Methane), tier: 1 },
  { type: ResourceType.CarbonDioxide, key: 'carbonDioxide', sprite: resourceSprite(ResourceType.CarbonDioxide), tier: 1 },
  { type: ResourceType.Ammonia, key: 'ammonia', sprite: resourceSprite(ResourceType.Ammonia), tier: 1 },
  // Tier 2 — advanced synthesizer output
  { type: ResourceType.CeramicPlates, key: 'ceramicPlates', sprite: resourceSprite(ResourceType.CeramicPlates), tier: 2 },
];

const spriteByType = new Map<ResourceTypeValue, string>(
  RESOURCE_ENTRIES.map((r) => [r.type, r.sprite]),
);

export function getResourceSprite(type: ResourceTypeValue): string | undefined {
  return spriteByType.get(type);
}

function resourceSprite(type: ResourceTypeValue): string {
  return RESOURCE_SPRITE_PATHS.get(type) ?? 'sprites/regolith.png';
}
