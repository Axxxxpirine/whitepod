import { describe, expect, it } from 'vitest';
import { formatDuration, formatRate } from '@/game/ui/numberPresentation';

describe('number presentation', () => {
  it('rounds a rate to one decimal at most', () => {
    expect(formatRate(30)).toBe('30/min');
    // A 20/min recipe behind a three-way splitter.
    expect(formatRate(20 / 3)).toBe('6.7/min');
    expect(formatRate(0)).toBe('0/min');
  });

  it('writes a duration with its units', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(60)).toBe('1 min');
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(2 * 3600 + 15 * 60 + 12)).toBe('2 h 15 min');
    expect(formatDuration(-5)).toBe('0 s');
  });
});
