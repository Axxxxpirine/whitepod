export function parseSeedInput(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function formatSeedInput(seed: number): string {
  return Number.isFinite(seed) ? String(Math.trunc(seed)) : '';
}
