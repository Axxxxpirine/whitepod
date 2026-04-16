import { GRID_SIZE } from '@/game/constants';
import { GameEngine, type SerializedGameWorld } from '@/game/engine/GameEngine';
import { Direction, type SelectedTool } from '@/game/types';

export const WORLD_STORAGE_KEY = 'whitepod:session:world:v3';
export const VIEW_STORAGE_KEY = 'whitepod:session:view:v2';
export const LEGACY_WORLD_STORAGE_KEY = 'whitepod:session:world:v2';
export const LEGACY_VIEW_STORAGE_KEY = 'whitepod:session:view:v2';

const WORLD_STORAGE_VERSION = 3;
const WORLD_IDLE_VERSION = 1;
const VIEW_STORAGE_VERSION = 2;
const GRID_MIN_BYTE_LENGTH = GRID_SIZE * 3;

interface PersistedWorldStateV3 {
  readonly version: number;
  readonly storageVersion: number;
  readonly idleVersion: number;
  readonly sessionId: string;
  readonly mapSeed: number;
  readonly gridBase64: string;
  readonly buildings: SerializedGameWorld['buildings'];
  readonly connections: SerializedGameWorld['connections'];
  readonly energyLinks?: readonly { readonly a: number; readonly b: number }[];
  readonly playerStock?: { readonly coal: number; readonly ironOre: number; readonly copperOre: number };
  readonly simulationTime?: number;
  readonly batteryCharges?: readonly { readonly id: number; readonly charge: number }[];
  readonly lastSavedAtMs: number;
}

interface PersistedWorldStateV2 {
  readonly version: number;
  readonly sessionId: string;
  readonly mapSeed: number;
  readonly gridBase64: string;
  readonly buildings: SerializedGameWorld['buildings'];
  readonly connections: SerializedGameWorld['connections'];
  readonly energyLinks?: readonly { readonly a: number; readonly b: number }[];
  readonly playerStock?: { readonly coal: number; readonly ironOre: number; readonly copperOre: number };
  readonly simulationTime?: number;
  readonly batteryCharges?: readonly { readonly id: number; readonly charge: number }[];
}

interface PersistedViewState {
  readonly version: number;
  readonly sessionId: string;
  readonly viewport: {
    readonly centerX: number;
    readonly centerY: number;
    readonly zoom: number;
  };
  readonly selectedTool: SelectedTool;
}

interface LoadedSession {
  readonly engine: GameEngine;
  readonly selectedTool: SelectedTool;
  readonly sessionId: string;
  readonly lastSavedAtMs: number | null;
}

function isStorageLike(value: unknown): value is Storage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Storage).getItem === 'function' &&
    typeof (value as Storage).setItem === 'function' &&
    typeof (value as Storage).removeItem === 'function'
  );
}

function getWorldStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  if (isStorageLike(window.localStorage)) return window.localStorage;
  if (isStorageLike(window.sessionStorage)) return window.sessionStorage;
  return null;
}

function getViewStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  if (isStorageLike(window.sessionStorage)) return window.sessionStorage;
  return null;
}

function getLegacyWorldStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  if (isStorageLike(window.sessionStorage)) return window.sessionStorage;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidDirection(value: unknown): value is number {
  return (Object.values(Direction) as number[]).includes(value as number);
}

function isSelectedTool(value: unknown): value is SelectedTool {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'select') return true;
  if (value.kind === 'belt') return true;
  if (value.kind === 'building') return typeof value.buildingType === 'string';
  if (value.kind === 'energy_link') return true;
  return false;
}

function isSerializedBuildingRegistry(value: unknown): value is SerializedGameWorld['buildings'] {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.version) || !isFiniteNumber(value.nextId) || !Array.isArray(value.buildings)) {
    return false;
  }

  return value.buildings.every((building) => {
    if (!isRecord(building)) return false;
    if (!isFiniteNumber(building.id)) return false;
    if (typeof building.typeId !== 'string') return false;
    if (!isValidDirection(building.rotation)) return false;
    if (!isRecord(building.origin)) return false;
    return isFiniteNumber(building.origin.x) && isFiniteNumber(building.origin.y);
  });
}

function isSerializedConnectionRegistry(value: unknown): value is SerializedGameWorld['connections'] {
  if (!isRecord(value)) return false;
  if (!isFiniteNumber(value.version) || !isFiniteNumber(value.nextId) || !Array.isArray(value.connections)) {
    return false;
  }

  return value.connections.every((connection) => {
    if (!isRecord(connection) || !isFiniteNumber(connection.id)) return false;
    if (!isRecord(connection.from) || !isRecord(connection.to)) return false;
    return (
      isFiniteNumber(connection.from.building) &&
      typeof connection.from.port === 'string' &&
      isFiniteNumber(connection.to.building) &&
      typeof connection.to.port === 'string'
    );
  });
}

function areEnergyLinksValid(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (link) =>
          isRecord(link) && isFiniteNumber(link.a) && isFiniteNumber(link.b),
      ))
  );
}

function areBatteryChargesValid(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every(
        (entry) =>
          isRecord(entry) && isFiniteNumber(entry.id) && isFiniteNumber(entry.charge),
      ))
  );
}

function isPersistedWorldStateV3(value: unknown): value is PersistedWorldStateV3 {
  if (!isRecord(value)) return false;
  const simulationTimeValid = value.simulationTime === undefined || isFiniteNumber(value.simulationTime);

  return (
    value.version === WORLD_STORAGE_VERSION &&
    value.storageVersion === WORLD_STORAGE_VERSION &&
    value.idleVersion === WORLD_IDLE_VERSION &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    isFiniteNumber(value.mapSeed) &&
    typeof value.gridBase64 === 'string' &&
    value.gridBase64.length > 0 &&
    isSerializedBuildingRegistry(value.buildings) &&
    isSerializedConnectionRegistry(value.connections) &&
    areEnergyLinksValid(value.energyLinks) &&
    areBatteryChargesValid(value.batteryCharges) &&
    simulationTimeValid &&
    isFiniteNumber(value.lastSavedAtMs)
  );
}

function isPersistedWorldStateV2(value: unknown): value is PersistedWorldStateV2 {
  if (!isRecord(value)) return false;
  const simulationTimeValid = value.simulationTime === undefined || isFiniteNumber(value.simulationTime);

  return (
    value.version === 2 &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    isFiniteNumber(value.mapSeed) &&
    typeof value.gridBase64 === 'string' &&
    value.gridBase64.length > 0 &&
    isSerializedBuildingRegistry(value.buildings) &&
    isSerializedConnectionRegistry(value.connections) &&
    areEnergyLinksValid(value.energyLinks) &&
    areBatteryChargesValid(value.batteryCharges) &&
    simulationTimeValid
  );
}

function isPersistedViewState(value: unknown): value is PersistedViewState {
  if (!isRecord(value) || value.version !== VIEW_STORAGE_VERSION) return false;
  if (typeof value.sessionId !== 'string' || value.sessionId.length === 0) return false;
  if (!isRecord(value.viewport)) return false;
  return (
    isFiniteNumber(value.viewport.centerX) &&
    isFiniteNumber(value.viewport.centerY) &&
    isFiniteNumber(value.viewport.zoom) &&
    isSelectedTool(value.selectedTool)
  );
}

function removeViewSession(): void {
  const storage = getViewStorage();
  storage?.removeItem(VIEW_STORAGE_KEY);
  if (LEGACY_VIEW_STORAGE_KEY !== VIEW_STORAGE_KEY) {
    storage?.removeItem(LEGACY_VIEW_STORAGE_KEY);
  }
}

function toSnapshotInput(value: PersistedWorldStateV3 | PersistedWorldStateV2): SerializedGameWorld {
  return {
    version: 2,
    mapSeed: value.mapSeed,
    grid: base64ToArrayBuffer(value.gridBase64),
    buildings: value.buildings,
    connections: value.connections,
    energyLinks: value.energyLinks,
    playerStock: value.playerStock,
    simulationTime: value.simulationTime,
    batteryCharges: value.batteryCharges,
  };
}

function toValidLastSavedAtMs(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

function readViewState(): PersistedViewState | null {
  const storage = getViewStorage();
  if (!storage) return null;

  const keys = VIEW_STORAGE_KEY === LEGACY_VIEW_STORAGE_KEY
    ? [VIEW_STORAGE_KEY]
    : [VIEW_STORAGE_KEY, LEGACY_VIEW_STORAGE_KEY];

  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isPersistedViewState(parsed)) {
        return parsed;
      }
      storage.removeItem(key);
    } catch {
      storage.removeItem(key);
    }
  }

  return null;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

export function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function clearPersistedSession(): void {
  getWorldStorage()?.removeItem(WORLD_STORAGE_KEY);
  const legacyWorldStorage = getLegacyWorldStorage();
  legacyWorldStorage?.removeItem(LEGACY_WORLD_STORAGE_KEY);

  const viewStorage = getViewStorage();
  viewStorage?.removeItem(VIEW_STORAGE_KEY);
  if (LEGACY_VIEW_STORAGE_KEY !== VIEW_STORAGE_KEY) {
    viewStorage?.removeItem(LEGACY_VIEW_STORAGE_KEY);
  }
}

export function saveWorldSession(engine: GameEngine, sessionId: string, nowMs: number = Date.now()): number {
  const storage = getWorldStorage();
  if (!storage) return nowMs;

  const safeNowMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  const snapshot = engine.serializeWorld();
  const payload: PersistedWorldStateV3 = {
    version: WORLD_STORAGE_VERSION,
    storageVersion: WORLD_STORAGE_VERSION,
    idleVersion: WORLD_IDLE_VERSION,
    sessionId,
    mapSeed: snapshot.mapSeed,
    gridBase64: arrayBufferToBase64(snapshot.grid),
    buildings: snapshot.buildings,
    connections: snapshot.connections,
    energyLinks: snapshot.energyLinks,
    playerStock: snapshot.playerStock,
    simulationTime: snapshot.simulationTime,
    batteryCharges: snapshot.batteryCharges,
    lastSavedAtMs: safeNowMs,
  };

  storage.setItem(WORLD_STORAGE_KEY, JSON.stringify(payload));
  return safeNowMs;
}

export function saveViewSession(args: {
  readonly engine: GameEngine;
  readonly selectedTool: SelectedTool;
  readonly sessionId: string;
}): void {
  const storage = getViewStorage();
  if (!storage) return;

  const payload: PersistedViewState = {
    version: VIEW_STORAGE_VERSION,
    sessionId: args.sessionId,
    viewport: args.engine.getViewportSnapshot(),
    selectedTool: args.selectedTool,
  };

  storage.setItem(VIEW_STORAGE_KEY, JSON.stringify(payload));
}

export function loadPersistedSession(screenWidth: number, screenHeight: number): LoadedSession | null {
  const worldStorage = getWorldStorage();
  const legacyWorldStorage = getLegacyWorldStorage();

  const rawWorldV3 = worldStorage?.getItem(WORLD_STORAGE_KEY) ?? null;

  let worldState: PersistedWorldStateV3 | PersistedWorldStateV2 | null = null;
  let isLegacyWorld = false;

  if (rawWorldV3) {
    try {
      const parsed: unknown = JSON.parse(rawWorldV3);
      if (!isPersistedWorldStateV3(parsed)) {
        clearPersistedSession();
        return null;
      }
      worldState = parsed;
    } catch {
      clearPersistedSession();
      return null;
    }
  } else {
    const rawLegacy = legacyWorldStorage?.getItem(LEGACY_WORLD_STORAGE_KEY) ?? null;
    if (!rawLegacy) return null;

    try {
      const parsedLegacy: unknown = JSON.parse(rawLegacy);
      if (!isPersistedWorldStateV2(parsedLegacy)) {
        clearPersistedSession();
        return null;
      }
      worldState = parsedLegacy;
      isLegacyWorld = true;
    } catch {
      clearPersistedSession();
      return null;
    }
  }

  try {
    const grid = base64ToArrayBuffer(worldState.gridBase64);
    if (grid.byteLength < GRID_MIN_BYTE_LENGTH) {
      clearPersistedSession();
      return null;
    }

    const engine = GameEngine.fromSnapshot(
      toSnapshotInput(worldState),
      screenWidth,
      screenHeight,
    );

    const viewState = readViewState();

    if (!viewState || viewState.sessionId !== worldState.sessionId) {
      if (viewState && viewState.sessionId !== worldState.sessionId) {
        removeViewSession();
      }
    } else {
      engine.viewport.restore(viewState.viewport);
    }

    const loadedSession: LoadedSession = {
      engine,
      selectedTool:
        viewState && viewState.sessionId === worldState.sessionId
          ? viewState.selectedTool
          : { kind: 'select' },
      sessionId: worldState.sessionId,
      lastSavedAtMs:
        'lastSavedAtMs' in worldState
          ? toValidLastSavedAtMs(worldState.lastSavedAtMs)
          : null,
    };

    if (isLegacyWorld) {
      const migratedAt = saveWorldSession(engine, worldState.sessionId, Date.now());
      legacyWorldStorage?.removeItem(LEGACY_WORLD_STORAGE_KEY);
      return { ...loadedSession, lastSavedAtMs: migratedAt };
    }

    return loadedSession;
  } catch {
    clearPersistedSession();
    return null;
  }
}
