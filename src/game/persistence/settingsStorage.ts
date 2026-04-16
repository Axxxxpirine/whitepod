const SETTINGS_STORAGE_KEY = 'whitepod:settings:v1';
const SETTINGS_VERSION = 2;

export interface PersistedSettings {
  readonly musicVolume: number;
  readonly sfxVolume: number;
}

interface PersistedSettingsPayloadV2 {
  readonly version: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
}

interface PersistedSettingsPayloadV1 {
  readonly version: 1;
  readonly musicVolume: number;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  musicVolume: 0.5,
  sfxVolume: 1.0,
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

function clampSfxVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPersistedSettingsPayloadV2(value: unknown): value is PersistedSettingsPayloadV2 {
  return (
    isRecord(value) &&
    value.version === SETTINGS_VERSION &&
    typeof value.musicVolume === 'number' &&
    Number.isFinite(value.musicVolume) &&
    typeof value.sfxVolume === 'number' &&
    Number.isFinite(value.sfxVolume)
  );
}

function isPersistedSettingsPayloadV1(value: unknown): value is PersistedSettingsPayloadV1 {
  return (
    isRecord(value) &&
    value.version === 1 &&
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
    if (isPersistedSettingsPayloadV2(parsed)) {
      return {
        musicVolume: clampMusicVolume(parsed.musicVolume),
        sfxVolume: clampSfxVolume(parsed.sfxVolume),
      };
    }

    if (isPersistedSettingsPayloadV1(parsed)) {
      const migrated = {
        musicVolume: clampMusicVolume(parsed.musicVolume),
        sfxVolume: DEFAULT_SETTINGS.sfxVolume,
      };
      savePersistedSettings(migrated);
      return migrated;
    }

    storage.removeItem(SETTINGS_STORAGE_KEY);
    return DEFAULT_SETTINGS;
  } catch {
    storage.removeItem(SETTINGS_STORAGE_KEY);
    return DEFAULT_SETTINGS;
  }
}

export function savePersistedSettings(settings: PersistedSettings): void {
  const storage = getStorage();
  if (!storage) return;

  const payload: PersistedSettingsPayloadV2 = {
    version: SETTINGS_VERSION,
    musicVolume: clampMusicVolume(settings.musicVolume),
    sfxVolume: clampSfxVolume(settings.sfxVolume),
  };

  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}

export function getDefaultSettings(): PersistedSettings {
  return DEFAULT_SETTINGS;
}
