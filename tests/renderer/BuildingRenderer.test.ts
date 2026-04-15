import { describe, expect, it } from 'vitest';
import { getPowerIndicatorColor } from '@/game/renderer/BuildingRenderer';

describe('BuildingRenderer power indicator color', () => {
  it('maps power states to indicator colors', () => {
    expect(getPowerIndicatorColor('powered')).toBe(0x22c55e);
    expect(getPowerIndicatorColor('unpowered')).toBe(0xef4444);
    expect(getPowerIndicatorColor('neutral')).toBeNull();
  });
});
