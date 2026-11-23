import { formatPower } from './numberPresentation';

/** How long before dusk the HUD warns about the night. */
export const NIGHT_WARNING_SECONDS = 30;

export interface NightWarning {
  readonly text: string;
  /** Some demand has no reserve for the night: shown in amber (DESIGN.md "not enough"). */
  readonly short: boolean;
}

/** "Nuit dans 25 s", plus the power left without reserve, shortly before dusk; null otherwise. */
export function nightWarning(outlook: { readonly secondsToNight: number | null; readonly uncoveredKw: number }): NightWarning | null {
  const { secondsToNight, uncoveredKw } = outlook;
  if (secondsToNight === null || secondsToNight > NIGHT_WARNING_SECONDS) return null;
  const seconds = Math.max(1, Math.ceil(secondsToNight - 1e-6));
  return Math.round(uncoveredKw * 10) > 0
    ? { text: `Nuit dans ${seconds} s · ${formatPower(uncoveredKw)} sans réserve`, short: true }
    : { text: `Nuit dans ${seconds} s`, short: false };
}
