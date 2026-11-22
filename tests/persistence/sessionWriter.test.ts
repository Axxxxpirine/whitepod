import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { ActionLogger, loadActionLog } from '@/game/persistence/actionLogger';
import {
  claimSessionWriter, clearPersistedSession, installPersistedSession, loadPersistedSession,
  readIdleSidecar, readSavedSessionSummary, SESSION_WRITER_KEY,
} from '@/game/persistence/sessionStorage';

function view(engine: GameEngine, sessionId: string, seedInput: string) {
  return { engine, sessionId, seedInput, selectedTool: { kind: 'select' as const }, selectedBotProfileId: 'connector' as const };
}

beforeEach(() => window.localStorage.clear());

describe('session write ownership', () => {
  it.each(['same', 'other'])('protects every passive save after another tab continues session %s', (sessionId) => {
    const engine = new GameEngine(640, 480);
    engine.generateMap(42);
    const older = claimSessionWriter();
    older.saveWorldSession(engine, 'same');
    const oldLog = new ActionLogger('same', older.isCurrent);
    oldLog.log('generate_map', { seed: 42 });
    oldLog.flush();

    const newer = claimSessionWriter();
    engine.generateMap(7);
    newer.saveWorldSession(engine, sessionId);
    newer.saveViewSession(view(engine, sessionId, '7'));
    newer.writeIdleSidecar(sessionId, 100);
    const newLog = new ActionLogger(sessionId, newer.isCurrent);
    newLog.log('generate_map', { seed: 7 });
    newLog.flush();

    engine.generateMap(99);
    older.saveWorldSession(engine, 'same');
    older.saveViewSession(view(engine, 'same', '99'));
    older.writeIdleSidecar('same', 200);
    older.clearIdleSidecar();
    oldLog.log('generate_map', { seed: 99 });
    oldLog.flush();

    expect(readSavedSessionSummary()?.mapSeed).toBe(7);
    expect(loadPersistedSession(640, 480)?.seedInput).toBe('7');
    expect(readIdleSidecar()?.pausedAtWallClockMs).toBe(100);
    expect(loadActionLog(sessionId)?.at(-1)?.payload).toEqual({ seed: 7 });
  });

  it('invalidates delayed saves immediately when clearing or installing another game', () => {
    const engine = new GameEngine(640, 480);
    const old = claimSessionWriter();
    clearPersistedSession();
    old.saveWorldSession(engine, 'stale');
    expect(readSavedSessionSummary()).toBeNull();
    const replaced = claimSessionWriter();
    installPersistedSession(view(engine, 'scenario', '42'));
    replaced.saveWorldSession(engine, 'stale');
    expect(loadPersistedSession(640, 480)?.sessionId).toBe('scenario');
  });

  it('signals takeover once and removes its storage listener on disposal', () => {
    const lost = vi.fn();
    const old = claimSessionWriter();
    const unsubscribe = old.onTakeover(lost);
    claimSessionWriter();
    const event = new StorageEvent('storage', { key: SESSION_WRITER_KEY });
    window.dispatchEvent(event);
    expect(lost).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.dispatchEvent(event);
    expect(lost).toHaveBeenCalledTimes(1);
  });
});

describe('action log continuity', () => {
  it('continues numbering after restoring a session and exports the entire history', () => {
    const original = new ActionLogger('resume');
    original.log('place_building', { typeId: 'solar_panel' });
    original.flush();
    const resumed = new ActionLogger('resume');
    resumed.log('remove_building', { typeId: 'solar_panel' });
    const exported = JSON.parse(resumed.exportToJson());
    expect(exported.actions.map((a: { sequence: number }) => a.sequence)).toEqual([0, 1]);
    expect(exported.actions[0]).toEqual(original.getActions()[0]);
  });
});

it('restores the bot choice to the HUD and subsequent view saves', async () => {
  const { createBotSession } = await import('@/game/bot/botSession');
  const { useGameStore } = await import('@/store/useGameStore');
  useGameStore.getState().setSelectedBotProfileId('master');
  const bot = createBotSession({ engine: new GameEngine(640, 480), initialProfileId: 'connector' });
  try {
    expect(useGameStore.getState().selectedBotProfileId).toBe('connector');
  } finally {
    bot.destroy();
  }
});

it('keeps the saved view and uses the default profile when a retired bot is restored', async () => {
  const { saveWorldSession, saveViewSession, VIEW_STORAGE_KEY } = await import('@/game/persistence/sessionStorage');
  const engine = new GameEngine(640, 480);
  saveWorldSession(engine, 'old-profile');
  saveViewSession(view(engine, 'old-profile', '77'));
  const raw = JSON.parse(window.localStorage.getItem(VIEW_STORAGE_KEY)!);
  window.localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ ...raw, selectedBotProfileId: 'fractal' }));
  expect(loadPersistedSession(640, 480)).toMatchObject({ selectedBotProfileId: 'master', seedInput: '77' });
});

it('keeps a takeover committed while the previous browser process was writing', () => {
  const engine = new GameEngine(640, 480);
  const stale = claimSessionWriter();
  engine.generateMap(11);
  stale.saveWorldSession(engine, 'same');
  const set = window.localStorage.setItem.bind(window.localStorage);
  const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce((key, raw) => {
    const current = claimSessionWriter();
    engine.generateMap(55);
    current.saveWorldSession(engine, 'same');
    set(key, raw);
  });
  try {
    stale.saveWorldSession(engine, 'same');
    expect(readSavedSessionSummary()?.mapSeed).toBe(55);
  } finally {
    spy.mockRestore();
  }
});

it('reports a failed checkpoint and retains the previous recoverable world', () => {
  const engine = new GameEngine(640, 480);
  const first = claimSessionWriter();
  engine.generateMap(42);
  first.saveWorldSession(engine, 'same');
  const next = claimSessionWriter();
  engine.generateMap(7);
  const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementationOnce(() => {
    throw new DOMException('Full', 'QuotaExceededError');
  });
  try {
    expect(next.saveWorldSession(engine, 'same')).toBe(false);
    expect(readSavedSessionSummary()?.mapSeed).toBe(42);
    expect(next.saveWorldSession(engine, 'same')).toBe(true);
    expect(readSavedSessionSummary()?.mapSeed).toBe(7);
  } finally {
    spy.mockRestore();
  }
});

it('does not claim a newer generation while a mount waits for another tab to finish its handoff', async () => {
  const { acquireSessionWriter } = await import('@/game/persistence/sessionStorage');
  let enter!: () => void;
  const wait = new Promise<void>((resolve) => { enter = resolve; });
  const locks = { request: async (_key: string, callback: () => unknown) => { await wait; return callback(); } };
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
  try {
    const oldRequest = acquireSessionWriter(() => false);
    clearPersistedSession();
    enter();
    expect(await oldRequest).toBeNull();
  } finally {
    Reflect.deleteProperty(navigator, 'locks');
  }
});

it('saves the final actions on pagehide and releases the unload hooks on disposal', () => {
  const logger = new ActionLogger('exit');
  const unbind = logger.bindAutoSave();
  logger.log('place_building', { typeId: 'extractor_basic' });
  window.dispatchEvent(new Event('pagehide'));
  expect(loadActionLog('exit')).toHaveLength(1);
  unbind();
  logger.log('remove_building', { typeId: 'extractor_basic' });
  window.dispatchEvent(new Event('pagehide'));
  expect(loadActionLog('exit')).toHaveLength(1);
});

it('ignores a corrupt inherited key and preserves unrelated browser storage', () => {
  const storage = window.localStorage;
  storage.setItem('another-app:world', 'private-value');
  storage.setItem(SESSION_WRITER_KEY, JSON.stringify({
    token: 'broken', inherited: { 'whitepod:session:world:v3': 'another-app:world' },
  }));
  const writer = claimSessionWriter();
  const manifest = JSON.parse(storage.getItem(SESSION_WRITER_KEY)!);
  expect(Object.values(manifest.inherited)).not.toContain('another-app:world');
  writer.saveWorldSession(new GameEngine(640, 480), 'safe');
  expect(storage.getItem('another-app:world')).toBe('private-value');
});

it('keeps the current game and writer when the browser cannot stage a replacement scenario', () => {
  const engine = new GameEngine(640, 480);
  const writer = claimSessionWriter();
  engine.generateMap(42);
  writer.saveWorldSession(engine, 'original');
  const save = window.localStorage.setItem.bind(window.localStorage);
  const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, raw) => {
    if (key.includes('world:v3')) throw new DOMException('Full', 'QuotaExceededError');
    save(key, raw);
  });
  try {
    engine.generateMap(7);
    expect(installPersistedSession(view(engine, 'scenario', '7'))).toBe(false);
    expect(writer.isCurrent()).toBe(true);
    expect(readSavedSessionSummary()?.mapSeed).toBe(42);
  } finally {
    spy.mockRestore();
  }
});

it('never collects a scenario being staged when an old-generation tab mounts concurrently', () => {
  const engine = new GameEngine(640, 480);
  const old = claimSessionWriter();
  old.saveWorldSession(engine, 'old');
  const set = window.localStorage.setItem.bind(window.localStorage);
  let mounted = false;
  const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, raw) => {
    set(key, raw);
    if (!mounted && key.endsWith('world:v3')) {
      mounted = true;
      claimSessionWriter();
    }
  });
  try {
    engine.generateMap(73);
    expect(installPersistedSession(view(engine, 'scenario', '73'))).toBe(true);
    expect(mounted).toBe(true);
    expect(loadPersistedSession(640, 480)).toMatchObject({ sessionId: 'scenario', seedInput: '73' });
    expect(readSavedSessionSummary()?.mapSeed).toBe(73);
  } finally {
    spy.mockRestore();
  }
});
