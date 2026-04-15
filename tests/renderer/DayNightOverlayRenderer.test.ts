import { describe, expect, it } from 'vitest';
import {
  getDaylightBoostAlpha,
  getDaylightFactor,
  getNightOverlayAlpha,
} from '@/game/renderer/DayNightOverlayRenderer';

describe('DayNightOverlayRenderer helpers', () => {
  it('computes expected daylight factors over the cycle', () => {
    // midnight: full dark
    expect(getDaylightFactor(0)).toBe(0);
    // 05:00: dawn just starting
    expect(getDaylightFactor(5 / 24)).toBeCloseTo(0, 6);
    // 06:00: mid-dawn
    expect(getDaylightFactor(0.25)).toBeCloseTo(0.5, 1);
    // 07:00: full day
    expect(getDaylightFactor(7 / 24)).toBeCloseTo(1, 6);
    // noon: full day
    expect(getDaylightFactor(0.5)).toBeCloseTo(1, 6);
    // 17:00: still full day (dusk just starting)
    expect(getDaylightFactor(17 / 24)).toBeCloseTo(1, 6);
    // 18:00: mid-dusk
    expect(getDaylightFactor(0.75)).toBeCloseTo(0.5, 1);
    // 19:00: full night
    expect(getDaylightFactor(19 / 24)).toBeCloseTo(0, 6);
  });

  it('makes night darker than day', () => {
    const night = getNightOverlayAlpha(0);
    const noon = getNightOverlayAlpha(0.5);
    expect(night).toBeGreaterThan(noon);
    expect(night).toBeLessThanOrEqual(1);
    expect(noon).toBeGreaterThanOrEqual(0);
  });

  it('applies a daylight boost at noon and none at night', () => {
    expect(getDaylightBoostAlpha(0)).toBeCloseTo(0, 6);
    expect(getDaylightBoostAlpha(0.5)).toBeGreaterThan(0.05);
  });
});
