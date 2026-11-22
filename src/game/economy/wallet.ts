import { resourceStockKey } from '../data/resourceStock';
import type { ResourceInventory } from '../engine/GameEngine';
import type { ResourceCost } from '../types';

/**
 * Construction wallet: pure operations over storage inventories.
 *
 * The engine decides which inventories form the wallet and in which order
 * they are drawn from (decision D2: hub first, then every storage). Nothing
 * here knows about buildings or game modes.
 */

/** Sums several costs into one, one entry per resource type, in first-seen order. */
export function mergeCosts(costs: Iterable<readonly ResourceCost[]>): ResourceCost[] {
  const totals = new Map<ResourceCost['resourceType'], number>();
  for (const cost of costs) {
    for (const { resourceType, amount } of cost) {
      totals.set(resourceType, (totals.get(resourceType) ?? 0) + amount);
    }
  }
  return [...totals].filter(([, amount]) => amount > 0).map(([resourceType, amount]) => ({ resourceType, amount }));
}

/** What is still missing to pay `cost` from `inventories` (empty when affordable). */
export function missingFor(inventories: readonly ResourceInventory[], cost: readonly ResourceCost[]): ResourceCost[] {
  const missing: ResourceCost[] = [];
  for (const { resourceType, amount } of mergeCosts([cost])) {
    const key = resourceStockKey(resourceType);
    const available = key ? inventories.reduce((sum, inventory) => sum + inventory[key], 0) : 0;
    if (available < amount) missing.push({ resourceType, amount: amount - available });
  }
  return missing;
}

export function canAfford(inventories: readonly ResourceInventory[], cost: readonly ResourceCost[]): boolean {
  return missingFor(inventories, cost).length === 0;
}

/**
 * Deducts `cost`, drawing from `inventories` in order. Atomic: returns false
 * and changes nothing when the total is not available.
 */
export function spend(inventories: readonly ResourceInventory[], cost: readonly ResourceCost[]): boolean {
  if (!canAfford(inventories, cost)) return false;
  for (const { resourceType, amount } of mergeCosts([cost])) {
    const key = resourceStockKey(resourceType)!;
    let remaining = amount;
    for (const inventory of inventories) {
      if (remaining === 0) break;
      const taken = Math.min(inventory[key], remaining);
      inventory[key] -= taken;
      remaining -= taken;
    }
  }
  return true;
}

/** Credits `cost` into `target`. */
export function refund(target: ResourceInventory, cost: readonly ResourceCost[]): void {
  for (const { resourceType, amount } of mergeCosts([cost])) {
    const key = resourceStockKey(resourceType);
    if (key) target[key] += amount;
  }
}
