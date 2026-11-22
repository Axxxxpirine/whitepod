import type { GameEngine, ResourceStock } from '../engine/GameEngine';
import { buildIdleSummary, computeElapsedMs, type IdleCatchupResult } from './IdleCatchup';

interface OfflineSessionHooks {
  checkpoint(pausedSince: number | null): void;
  busy(replaying: boolean): void;
  completed(summary: IdleCatchupResult): void;
}

/** Owns the wall-clock interval between live ticks. A checkpoint always pairs the
 * current world with just the time that world still needs to simulate. */
export class OfflineSession {
  private suspended = false;
  private pausedSince: number | null = null;
  private remainingMs = 0;
  private summary: { before: ResourceStock; appliedMs: number; capped: boolean } | null = null;
  private timer?: ReturnType<typeof setTimeout>;

  private readonly engine: GameEngine;
  private readonly hooks: OfflineSessionHooks;

  constructor(engine: GameEngine, hooks: OfflineSessionHooks) {
    this.engine = engine;
    this.hooks = hooks;
  }

  get active(): boolean {
    return !this.suspended && this.remainingMs === 0;
  }

  restore(pausedSince: number): void {
    this.suspended = true;
    this.pausedSince = pausedSince;
  }

  suspend(shouldAdvance: boolean): void {
    if (this.suspended) return;
    const since = this.timestampForCheckpoint(shouldAdvance);
    this.cancelReplay();
    this.suspended = true;
    this.pausedSince = since;
    this.hooks.checkpoint(since);
  }

  checkpointForExit(shouldAdvance: boolean): void {
    this.hooks.checkpoint(this.timestampForCheckpoint(shouldAdvance));
  }

  private timestampForCheckpoint(shouldAdvance: boolean): number | null {
    if (this.suspended) return this.pausedSince;
    return shouldAdvance ? Date.now() - this.remainingMs : null;
  }

  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    const { elapsedMs, capped } = computeElapsedMs(Date.now(), this.pausedSince);
    this.pausedSince = null;
    if (!elapsedMs) return;

    this.remainingMs = elapsedMs;
    const summary = this.summary ??= { before: this.engine.getResourceCounts(), appliedMs: 0, capped: false };
    summary.capped ||= capped;
    this.hooks.busy(true);
    const advance = () => {
      const deadline = performance.now() + 6;
      this.engine.runWithoutNotifications(() => {
        // Limit both elapsed CPU time and steps per task, even on coarse clocks.
        for (let steps = 0; steps < 120 && this.remainingMs > 0; steps++) {
          const dtMs = Math.min(1000, this.remainingMs);
          this.engine.update(dtMs / 1000, { emitSfx: false });
          this.remainingMs -= dtMs;
          summary.appliedMs += dtMs;
          if (performance.now() >= deadline) break;
        }
      });
      if (this.remainingMs > 0) {
        this.timer = setTimeout(advance, 0);
        return;
      }
      this.timer = undefined;
      this.hooks.checkpoint(null);
      this.hooks.completed(buildIdleSummary(summary.before, this.engine.getResourceCounts(), summary.appliedMs / 1000, summary.capped));
      this.summary = null;
      this.hooks.busy(false);
    };
    this.timer = setTimeout(advance, 0);
  }

  destroy(): void {
    this.cancelReplay();
  }

  private cancelReplay(): void {
    if (this.timer === undefined) return;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.remainingMs = 0;
    this.hooks.busy(false);
  }
}
