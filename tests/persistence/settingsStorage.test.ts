import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getDefaultSettings,
  loadPersistedSettings,
  savePersistedSettings,
} from '@/game/persistence/settingsStorage';

const STORAGE_KEY = 'whitepod:settings:v1';

function createStorageMock(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

describe('settingsStorage', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createStorageMock());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns defaults when no settings are persisted', () => {
    expect(loadPersistedSettings()).toEqual(getDefaultSettings());
  });

  it('persists and reloads music and sfx volumes', () => {
    savePersistedSettings({ musicVolume: 0.73, sfxVolume: 0.4 });
    expect(loadPersistedSettings()).toEqual({ musicVolume: 0.73, sfxVolume: 0.4 });
  });

  it('clamps out-of-range music volume values', () => {
    savePersistedSettings({ musicVolume: 3, sfxVolume: 0.5 });
    expect(loadPersistedSettings()).toEqual({ musicVolume: 1, sfxVolume: 0.5 });

    savePersistedSettings({ musicVolume: -2, sfxVolume: 0.5 });
    expect(loadPersistedSettings()).toEqual({ musicVolume: 0, sfxVolume: 0.5 });
  });

  it('clamps out-of-range sfx volume values', () => {
    savePersistedSettings({ musicVolume: 0.5, sfxVolume: 5 });
    expect(loadPersistedSettings()).toEqual({ musicVolume: 0.5, sfxVolume: 1 });

    savePersistedSettings({ musicVolume: 0.5, sfxVolume: -1 });
    expect(loadPersistedSettings()).toEqual({ musicVolume: 0.5, sfxVolume: 0 });
  });

  it('migrates V1 payload (no sfxVolume) to V2 with default sfxVolume', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, musicVolume: 0.6 }));

    const loaded = loadPersistedSettings();
    expect(loaded).toEqual({ musicVolume: 0.6, sfxVolume: getDefaultSettings().sfxVolume });

    // Migration should have persisted the upgraded payload
    const raw = window.localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.version).toBe(2);
    expect(parsed.sfxVolume).toBe(getDefaultSettings().sfxVolume);
  });

  it('clears invalid payloads and falls back to defaults', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, musicVolume: 0.8 }));

    expect(loadPersistedSettings()).toEqual(getDefaultSettings());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
