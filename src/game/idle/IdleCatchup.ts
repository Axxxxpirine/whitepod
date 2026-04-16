import type { GameEngine, ResourceStock } from '@/game/engine/GameEngine';

export interface IdleCatchupResult {
  appliedSeconds: number;
  capped: boolean;
  resourceDelta: ResourceStock;
}

const DEFAULT_OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
const DEFAULT_CATCHUP_STEP_SECONDS = 1;

const idleLastSavedAtByEngine = new WeakMap<GameEngine, number | null>();

function sanitizeFiniteNonNegative(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value;
}

export function setIdleLastSavedAtMs(engine: GameEngine, lastSavedAtMs: number | null): void {
  if (lastSavedAtMs === null) {
    idleLastSavedAtByEngine.set(engine, null);
    return;
  }
  idleLastSavedAtByEngine.set(engine, Number.isFinite(lastSavedAtMs) ? lastSavedAtMs : null);
}

export function getIdleLastSavedAtMs(engine: GameEngine): number | null {
  return idleLastSavedAtByEngine.get(engine) ?? null;
}

export function computeElapsedMs(nowMs: number, lastSavedAtMs: number | null, capMs: number = DEFAULT_OFFLINE_CAP_MS): {
  elapsedMs: number;
  capped: boolean;
} {
  if (!Number.isFinite(nowMs) || lastSavedAtMs === null || !Number.isFinite(lastSavedAtMs)) {
    return { elapsedMs: 0, capped: false };
  }

  const rawElapsedMs = Math.max(0, nowMs - lastSavedAtMs);
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
      engine.update(dt);
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
      coal: after.coal - before.coal,
      ironOre: after.ironOre - before.ironOre,
      copperOre: after.copperOre - before.copperOre,
    },
  };
}

export function applyIdleCatchup(engine: GameEngine, nowMs: number): IdleCatchupResult {
  const before = engine.getResourceCounts();
  const { elapsedMs, capped } = computeElapsedMs(nowMs, getIdleLastSavedAtMs(engine));
  const appliedSeconds = runExactCatchup(engine, elapsedMs / 1000);
  const after = engine.getResourceCounts();

  if (Number.isFinite(nowMs)) {
    setIdleLastSavedAtMs(engine, nowMs);
  }

  return buildIdleSummary(before, after, appliedSeconds, capped);
}
