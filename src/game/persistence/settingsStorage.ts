import { getLocalStorage } from './browserStorage';

const SETTINGS_STORAGE_KEY = 'whitepod:settings:v1';
const SETTINGS_VERSION = 2;

export interface PersistedSettings {
  readonly musicVolume: number;
  readonly sfxVolume: number;
}

interface PersistedSettingsV1Payload {
  readonly version: 1;
  readonly musicVolume: number;
}

interface PersistedSettingsV2Payload {
  readonly version: number;
  readonly musicVolume: number;
  readonly sfxVolume: number;
}

const DEFAULT_SETTINGS: PersistedSettings = {
  musicVolume: 0.5,
  sfxVolume: 0.7,
};

function getStorage(): Storage | null {
  return getLocalStorage();
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

function isPersistedSettingsV1Payload(value: unknown): value is PersistedSettingsV1Payload {
  return (
    isRecord(value) &&
    value.version === 1 &&
    typeof value.musicVolume === 'number' &&
    Number.isFinite(value.musicVolume)
  );
}

function isPersistedSettingsV2Payload(value: unknown): value is PersistedSettingsV2Payload {
  return (
    isRecord(value) &&
    value.version === SETTINGS_VERSION &&
    typeof value.musicVolume === 'number' &&
    Number.isFinite(value.musicVolume) &&
    typeof value.sfxVolume === 'number' &&
    Number.isFinite(value.sfxVolume)
  );
}

export function loadPersistedSettings(): PersistedSettings {
  const storage = getStorage();
  if (!storage) return DEFAULT_SETTINGS;

  const raw = storage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) return DEFAULT_SETTINGS;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (isPersistedSettingsV2Payload(parsed)) {
      return {
        musicVolume: clampMusicVolume(parsed.musicVolume),
        sfxVolume: clampSfxVolume(parsed.sfxVolume),
      };
    }

    if (isPersistedSettingsV1Payload(parsed)) {
      const migrated = {
        musicVolume: clampMusicVolume(parsed.musicVolume),
        sfxVolume: DEFAULT_SETTINGS.sfxVolume,
      };
      savePersistedSettings(migrated);
      return migrated;
    }

    if (!isPersistedSettingsV1Payload(parsed)) {
      storage.removeItem(SETTINGS_STORAGE_KEY);
      return DEFAULT_SETTINGS;
    }
  } catch {
    storage.removeItem(SETTINGS_STORAGE_KEY);
    return DEFAULT_SETTINGS;
  }

  return DEFAULT_SETTINGS;
}

export function savePersistedSettings(settings: PersistedSettings): void {
  const storage = getStorage();
  if (!storage) return;

  const payload: PersistedSettingsV2Payload = {
    version: SETTINGS_VERSION,
    musicVolume: clampMusicVolume(settings.musicVolume),
    sfxVolume: clampSfxVolume(settings.sfxVolume),
  };

  storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
}

export function getDefaultSettings(): PersistedSettings {
  return DEFAULT_SETTINGS;
}
