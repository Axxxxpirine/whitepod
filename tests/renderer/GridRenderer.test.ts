import { describe, expect, it } from 'vitest';
import {
  getAxonometricGuideLineAlpha,
  getGridLineAlpha,
  getGridLineWorldWidth,
  getOrthographicGridLineAlpha,
} from '@/game/renderer/GridRenderer';

describe('GridRenderer helpers', () => {
  it('fades grid hairlines out before moire-prone zoom levels', () => {
    expect(getGridLineAlpha(0.39)).toBe(0);
    expect(getGridLineAlpha(0.4)).toBeCloseTo(0.35);
    expect(getGridLineAlpha(0.5)).toBeGreaterThan(0.35);
    expect(getGridLineAlpha(1)).toBe(1);
    expect(getGridLineAlpha(2.5)).toBe(1);
  });

  it('keeps grid hairlines one physical pixel wide after viewport scaling', () => {
    expect(getGridLineWorldWidth(1)).toBe(1);
    expect(getGridLineWorldWidth(0.5) * 0.5).toBeCloseTo(1);
    expect(getGridLineWorldWidth(2.5) * 2.5).toBeCloseTo(1);
  });

  it('uses axonometric guide lines as the visible terrain grid across active zoom levels', () => {
    expect(getAxonometricGuideLineAlpha(0.39)).toBe(0);
    expect(getAxonometricGuideLineAlpha(0.5)).toBeGreaterThan(0.14);
    expect(getAxonometricGuideLineAlpha(1)).toBeGreaterThan(0.18);
    expect(getAxonometricGuideLineAlpha(2.5)).toBeGreaterThan(getAxonometricGuideLineAlpha(0.5));
    expect(getAxonometricGuideLineAlpha(2.5)).toBeGreaterThan(0);
  });

  it('keeps orthographic placement lines hidden so the terrain grid reads as diamonds only', () => {
    expect(getOrthographicGridLineAlpha(0.5)).toBe(0);
    expect(getOrthographicGridLineAlpha(1)).toBe(0);
    expect(getOrthographicGridLineAlpha(2.5)).toBe(0);
  });
});
