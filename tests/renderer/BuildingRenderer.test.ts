import { describe, expect, it } from 'vitest';
import { getPowerIndicatorColor } from '@/game/renderer/BuildingRenderer';
import { PIXI } from '@/design/tokens';

describe('BuildingRenderer power indicator color', () => {
  it('maps power states to indicator colors', () => {
    expect(getPowerIndicatorColor('powered')).toBe(PIXI.ok);
    expect(getPowerIndicatorColor('unpowered')).toBe(PIXI.error);
    expect(getPowerIndicatorColor('neutral')).toBeNull();
  });
});
