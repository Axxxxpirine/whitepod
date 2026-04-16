const SETTINGS_STORAGE_KEY = 'whitepod:settings:v1';
const SETTINGS_VERSION = 1;

export interface PersistedSettings {
  readonly musicVolume: number;
}

interface PersistedSettingsPayload {
  readonly version: number;
  readonly musicVolume: number;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  musicVolume: 0.5,
};

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  const storage = window.localStorage;
  if (
    !storage ||
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    return null;
  }
  return storage;
}

function clampMusicVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPersistedSettingsPayload(value: unknown): value is PersistedSettingsPayload {
  return (
    isRecord(value) &&
    value.version === SETTINGS_VERSION &&
    typeof value.musicVolume === 'number' &&
    Number.isFinite(value.musicVolume)
  );
}

export function loadPersistedSettings(): PersistedSettings {
  const storage = getStorage();
  if (!storage) return DEFAULT_SETTINGS;

  const raw = storage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPersistedSettingsPayload(parsed)) {
      storage.removeItem(SETTINGS_STORAGE_KEY);
      return DEFAULT_SETTINGS;
    }

    return {
      musicVolume: clampMusicVolume(parsed.musicVolume),
    };
  } catch {
    storage.removeItem(SETTINGS_STORAGE_KEY);
    return DEFAULT_SETTINGS;
  }
}

export function savePersistedSettings(settings: PersistedSettings): void {
  const storage = getStorage();
  if (!storage) return;

  const payload: PersistedSettingsPayload = {
    version: SETTINGS_VERSION,
    musicVolume: clampMusicVolume(settings.musicVolume),
  };

  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}

export function getDefaultSettings(): PersistedSettings {
  return DEFAULT_SETTINGS;
}
