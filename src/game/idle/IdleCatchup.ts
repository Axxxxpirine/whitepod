import type { GameEngine, ResourceStock } from '@/game/engine/GameEngine';

export interface IdleCatchupResult {
  appliedSeconds: number;
  capped: boolean;
  resourceDelta: ResourceStock;
}

export const DEFAULT_OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
const DEFAULT_CATCHUP_STEP_SECONDS = 1;

function sanitizeFiniteNonNegative(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export function computeElapsedMs(
  nowMs: number,
  pausedAtMs: number | null,
  capMs: number = DEFAULT_OFFLINE_CAP_MS,
): { elapsedMs: number; capped: boolean } {
  if (!Number.isFinite(nowMs) || pausedAtMs === null || !Number.isFinite(pausedAtMs)) {
    return { elapsedMs: 0, capped: false };
  }

  const rawElapsedMs = Math.max(0, nowMs - pausedAtMs);
  const safeCapMs = sanitizeFiniteNonNegative(capMs);
  if (safeCapMs <= 0) {
    return { elapsedMs: rawElapsedMs, capped: false };
  }

  return {
    elapsedMs: Math.min(rawElapsedMs, safeCapMs),
    capped: rawElapsedMs > safeCapMs,
  };
}

export function runExactCatchup(
  engine: GameEngine,
  elapsedSeconds: number,
  stepSeconds: number = DEFAULT_CATCHUP_STEP_SECONDS,
): number {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;

  const safeStepSeconds = sanitizeFiniteNonNegative(stepSeconds);
  const step = safeStepSeconds > 0 ? safeStepSeconds : DEFAULT_CATCHUP_STEP_SECONDS;

  let remaining = elapsedSeconds;
  engine.runWithoutNotifications(() => {
    while (remaining > 0) {
      const dt = remaining >= step ? step : remaining;
      engine.update(dt, { emitSfx: false });
      remaining -= dt;
    }
  });

  return elapsedSeconds;
}

export function buildIdleSummary(
  before: ResourceStock,
  after: ResourceStock,
  appliedSeconds: number,
  capped: boolean,
): IdleCatchupResult {
  return {
    appliedSeconds,
    capped,
    resourceDelta: {
      regolith: after.regolith - before.regolith,
      hydrogen: after.hydrogen - before.hydrogen,
      oxygen: after.oxygen - before.oxygen,
      ironOxide: after.ironOxide - before.ironOxide,
      aluminumOxide: after.aluminumOxide - before.aluminumOxide,
      siliconDioxide: after.siliconDioxide - before.siliconDioxide,
      nitrogenGas: after.nitrogenGas - before.nitrogenGas,
      water: after.water - before.water,
      methane: after.methane - before.methane,
      carbonDioxide: after.carbonDioxide - before.carbonDioxide,
      ammonia: after.ammonia - before.ammonia,
      ceramicPlates: after.ceramicPlates - before.ceramicPlates,
    },
  };
}

export function applyIdleCatchup(
  engine: GameEngine,
  elapsedMs: number,
  capMs: number = DEFAULT_OFFLINE_CAP_MS,
): IdleCatchupResult {
  const safeCapMs = sanitizeFiniteNonNegative(capMs);
  const rawElapsedMs = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const cappedElapsedMs = safeCapMs > 0 ? Math.min(rawElapsedMs, safeCapMs) : rawElapsedMs;
  const capped = safeCapMs > 0 && rawElapsedMs > safeCapMs;

  const before = engine.getResourceCounts();
  const appliedSeconds = runExactCatchup(engine, cappedElapsedMs / 1000);
  const after = engine.getResourceCounts();

  return buildIdleSummary(before, after, appliedSeconds, capped);
}
