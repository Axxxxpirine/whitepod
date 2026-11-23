import { CLOCK_HOURS_PER_CYCLE } from '../constants';

/** A number as the HUD prints it: one decimal at most, with the French decimal comma ("6,7"). */
export function formatDecimal(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  // `|| 0` turns the -0 a small negative rounds to into a plain 0.
  return String(rounded || 0).replace('.', ',');
}

/** Rates in the HUD, per minute ("6,7/min"), so a split line never prints 6.666666666666666. */
export function formatRate(perMinute: number): string {
  return `${formatDecimal(perMinute)}/min`;
}

/** Power in the HUD ("2,5 kW"). */
export function formatPower(kw: number): string {
  return `${formatDecimal(kw)} kW`;
}

/**
 * Stored energy as the player reads it against the clock, without its unit.
 * The engine counts one energy hour per day-night cycle; the clock counts
 * `CLOCK_HOURS_PER_CYCLE` in it, so a battery of 10 holds 240 kWh: 2 kW for
 * 120 h of clock. Whole numbers: at this scale a decimal only flickers.
 */
export function energyInClockHours(engineKwh: number): number {
  return Math.round(engineKwh * CLOCK_HOURS_PER_CYCLE) || 0;
}

/** Stored energy in the HUD ("240 kWh"). */
export function formatEnergy(engineKwh: number): string {
  return `${energyInClockHours(engineKwh)} kWh`;
}

/** Durations in the HUD: "45 s", "12 min", "2 h 15 min". */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < 60) return `${total} s`;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
