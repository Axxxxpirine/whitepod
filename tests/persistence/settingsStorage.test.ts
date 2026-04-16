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

  it('persists and reloads music volume', () => {
    savePersistedSettings({ musicVolume: 0.73 });
    expect(loadPersistedSettings()).toEqual({ musicVolume: 0.73 });
  });

  it('clamps out-of-range music volume values', () => {
    savePersistedSettings({ musicVolume: 3 });
    expect(loadPersistedSettings()).toEqual({ musicVolume: 1 });

    savePersistedSettings({ musicVolume: -2 });
    expect(loadPersistedSettings()).toEqual({ musicVolume: 0 });
  });

  it('clears invalid payloads and falls back to defaults', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, musicVolume: 0.8 }));

    expect(loadPersistedSettings()).toEqual(getDefaultSettings());
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
