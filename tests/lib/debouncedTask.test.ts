import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedTask } from '@/lib/debouncedTask';

describe('createDebouncedTask', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs once after a pause in a burst of requests', () => {
    const task = vi.fn();
    const debounced = createDebouncedTask(task, 150);

    debounced.schedule();
    vi.advanceTimersByTime(100);
    debounced.schedule();
    vi.advanceTimersByTime(100);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('is not starved by requests that never pause (fast-forwarded simulation)', () => {
    const task = vi.fn();
    const debounced = createDebouncedTask(task, 150, 2000);

    // A request every 50 ms for 10 s: a plain debounce would never run.
    for (let elapsed = 0; elapsed < 10_000; elapsed += 50) {
      debounced.schedule();
      vi.advanceTimersByTime(50);
    }

    expect(task).toHaveBeenCalledTimes(5);
  });

  it('runs a lazy request within its window without being pushed back by the next ones', () => {
    const task = vi.fn();
    const debounced = createDebouncedTask(task, 150, 2000);

    for (let elapsed = 0; elapsed < 5000; elapsed += 100) {
      debounced.scheduleWithin(5000);
      vi.advanceTimersByTime(100);
    }

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('lets an edit bring a lazy run forward, and a lazy request never delays an edit', () => {
    const task = vi.fn();
    const debounced = createDebouncedTask(task, 150, 2000);

    debounced.scheduleWithin(5000);
    vi.advanceTimersByTime(1000);
    debounced.schedule();
    debounced.scheduleWithin(5000);
    vi.advanceTimersByTime(150);

    expect(task).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it('flushes at once and cancels a pending run', () => {
    const task = vi.fn();
    const debounced = createDebouncedTask(task, 150);

    debounced.schedule();
    debounced.flush();
    expect(task).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledTimes(1);

    debounced.schedule();
    debounced.cancel();
    vi.advanceTimersByTime(1000);
    expect(task).toHaveBeenCalledTimes(1);
  });
});
