import { describe, expect, it } from 'vitest';
import { formatDecimal, formatDuration, formatEnergy, formatPower, formatRate } from '@/game/ui/numberPresentation';

describe('number presentation', () => {
  it('rounds a rate to one decimal at most', () => {
    expect(formatRate(30)).toBe('30/min');
    // A 20/min recipe behind a three-way splitter.
    expect(formatRate(20 / 3)).toBe('6,7/min');
    expect(formatRate(0)).toBe('0/min');
  });

  it('writes decimals the French way, one at most', () => {
    expect(formatDecimal(1.25)).toBe('1,3');
    expect(formatDecimal(12)).toBe('12');
    expect(formatDecimal(-0.04)).toBe('0');
    expect(formatPower(2.5)).toBe('2,5 kW');
    expect(formatPower(-2)).toBe('-2 kW');
  });

  it('counts stored energy in hours of the game clock', () => {
    // The engine counts one energy hour per day-night cycle, 24 h on the clock:
    // a full basic battery (10) feeds 2 kW for five days, 120 h.
    expect(formatEnergy(10)).toBe('240 kWh');
    expect(formatEnergy(1.7)).toBe('41 kWh');
    expect(formatEnergy(0)).toBe('0 kWh');
  });

  it('writes a duration with its units', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(2 * 3600 + 15 * 60 + 12)).toBe('2 h 15 min');
    expect(formatDuration(-5)).toBe('0 s');
  });
});
