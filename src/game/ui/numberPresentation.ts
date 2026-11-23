/** Rates in the HUD, per minute: one decimal at most ("6.7/min"), so a split line never prints 6.666666666666666. */
export function formatRate(perMinute: number): string {
  return `${Math.round(perMinute * 10) / 10}/min`;
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
