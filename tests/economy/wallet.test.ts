import { describe, expect, it } from 'vitest';
import { canAfford, mergeCosts, missingFor, refund, spend } from '@/game/economy/wallet';
import type { ResourceInventory } from '@/game/engine/GameEngine';
import { ResourceType } from '@/game/types';

function inventory(partial: Partial<ResourceInventory> = {}): ResourceInventory {
  return {
    regolith: 0, hydrogen: 0, oxygen: 0,
    ironOxide: 0, aluminumOxide: 0, siliconDioxide: 0, nitrogenGas: 0,
    water: 0, methane: 0, carbonDioxide: 0, ammonia: 0, ceramicPlates: 0,
    ...partial,
  };
}

const regolith = (amount: number) => ({ resourceType: ResourceType.Regolith, amount });
const oxygen = (amount: number) => ({ resourceType: ResourceType.Oxygen, amount });

describe('wallet', () => {
  it('merges costs per resource type', () => {
    expect(mergeCosts([[regolith(1)], [regolith(2), oxygen(3)], []])).toEqual([regolith(3), oxygen(3)]);
  });

  it('sums availability across inventories', () => {
    const wallet = [inventory({ regolith: 4 }), inventory({ regolith: 6 })];

    expect(canAfford(wallet, [regolith(10)])).toBe(true);
    expect(canAfford(wallet, [regolith(11)])).toBe(false);
    expect(missingFor(wallet, [regolith(11), oxygen(2)])).toEqual([regolith(1), oxygen(2)]);
  });

  it('draws from inventories in order', () => {
    const first = inventory({ regolith: 4 });
    const second = inventory({ regolith: 6 });

    expect(spend([first, second], [regolith(7)])).toBe(true);
    expect(first.regolith).toBe(0);
    expect(second.regolith).toBe(3);
  });

  it('is atomic when a cost is not fully available', () => {
    const wallet = [inventory({ regolith: 50, oxygen: 1 })];

    expect(spend(wallet, [regolith(10), oxygen(5)])).toBe(false);
    expect(wallet[0]).toEqual(inventory({ regolith: 50, oxygen: 1 }));
  });

  it('refunds into the target inventory', () => {
    const target = inventory({ regolith: 1 });

    refund(target, [regolith(4), oxygen(2)]);

    expect(target).toEqual(inventory({ regolith: 5, oxygen: 2 }));
  });

  it('accepts an empty cost anywhere', () => {
    expect(canAfford([], [])).toBe(true);
    expect(spend([], [])).toBe(true);
  });
});
