export interface DebouncedTask {
  /** Runs the task `delayMs` after the last call, but never more than `maxWaitMs` after the first one. */
  schedule(): void;
  /** Makes sure the task runs within `withinMs`, without bringing forward or pushing back a run already due sooner. */
  scheduleWithin(withinMs: number): void;
  /** Runs the task now. */
  flush(): void;
  /** Drops the pending run. */
  cancel(): void;
}

/**
 * A task that follows bursts of requests (e.g. saving after edits): it waits
 * for a pause of `delayMs`, yet a steady stream of requests cannot starve it
 * beyond `maxWaitMs`.
 */
export function createDebouncedTask(task: () => void, delayMs: number, maxWaitMs = Number.POSITIVE_INFINITY): DebouncedTask {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  /** When the pending run fires. */
  let dueAt = Number.POSITIVE_INFINITY;
  /** Latest moment the pending run may be pushed back to. */
  let deadline = Number.POSITIVE_INFINITY;

  const clear = () => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    timeoutId = null;
    dueAt = Number.POSITIVE_INFINITY;
    deadline = Number.POSITIVE_INFINITY;
  };
  const run = () => {
    clear();
    task();
  };
  const arm = (at: number, now: number) => {
    if (timeoutId !== null) clearTimeout(timeoutId);
    dueAt = at;
    timeoutId = setTimeout(run, Math.max(0, at - now));
  };

  return {
    schedule() {
      const now = Date.now();
      deadline = Math.min(deadline, now + maxWaitMs);
      arm(Math.min(now + delayMs, deadline), now);
    },
    scheduleWithin(withinMs) {
      const now = Date.now();
      deadline = Math.min(deadline, now + withinMs);
      if (now + withinMs < dueAt) arm(now + withinMs, now);
    },
    flush: run,
    cancel: clear,
  };
}
