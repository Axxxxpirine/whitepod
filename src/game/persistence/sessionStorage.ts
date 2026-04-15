import { GRID_SIZE } from '@/game/constants';
import { GameEngine, type SerializedGameWorld } from '@/game/engine/GameEngine';
import {
  Direction,
  type SelectedTool,
} from '@/game/types';

export const WORLD_STORAGE_KEY = 'whitepod:session:world:v1';
export const VIEW_STORAGE_KEY = 'whitepod:session:view:v1';
const STORAGE_VERSION = 1;
const GRID_BYTE_LENGTH = GRID_SIZE * 4;

interface PersistedWorldState {
  readonly version: number;
  readonly sessionId: string;
  readonly mapSeed: number;
  readonly gridBase64: string;
  readonly buildings: SerializedGameWorld['buildings'];
  readonly connections: SerializedGameWorld['connections'];
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
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
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
  if (value.kind === 'select') {
    return true;
  }
  if (value.kind === 'belt') {
    return true;
  }
  if (value.kind === 'building') {
    return typeof value.buildingType === 'string';
  }
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

function isPersistedWorldState(value: unknown): value is PersistedWorldState {
  if (!isRecord(value)) return false;
  return (
    value.version === STORAGE_VERSION &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    isFiniteNumber(value.mapSeed) &&
    typeof value.gridBase64 === 'string' &&
    value.gridBase64.length > 0 &&
    isSerializedBuildingRegistry(value.buildings) &&
    isSerializedConnectionRegistry(value.connections)
  );
}

function isPersistedViewState(value: unknown): value is PersistedViewState {
  if (!isRecord(value) || value.version !== STORAGE_VERSION) return false;
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
  getStorage()?.removeItem(VIEW_STORAGE_KEY);
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
  const storage = getStorage();
  storage?.removeItem(WORLD_STORAGE_KEY);
  storage?.removeItem(VIEW_STORAGE_KEY);
}

export function saveWorldSession(engine: GameEngine, sessionId: string): void {
  const storage = getStorage();
  if (!storage) return;

  const snapshot = engine.serializeWorld();
  const payload: PersistedWorldState = {
    version: STORAGE_VERSION,
    sessionId,
    mapSeed: snapshot.mapSeed,
    gridBase64: arrayBufferToBase64(snapshot.grid),
    buildings: snapshot.buildings,
    connections: snapshot.connections,
  };

  storage.setItem(WORLD_STORAGE_KEY, JSON.stringify(payload));
}

export function saveViewSession(args: {
  readonly engine: GameEngine;
  readonly selectedTool: SelectedTool;
  readonly sessionId: string;
}): void {
  const storage = getStorage();
  if (!storage) return;

  const payload: PersistedViewState = {
    version: STORAGE_VERSION,
    sessionId: args.sessionId,
    viewport: args.engine.getViewportSnapshot(),
    selectedTool: args.selectedTool,
  };

  storage.setItem(VIEW_STORAGE_KEY, JSON.stringify(payload));
}

export function loadPersistedSession(screenWidth: number, screenHeight: number): LoadedSession | null {
  const storage = getStorage();
  if (!storage) return null;

  const rawWorld = storage.getItem(WORLD_STORAGE_KEY);
  if (!rawWorld) return null;

  try {
    const parsedWorld: unknown = JSON.parse(rawWorld);
    if (!isPersistedWorldState(parsedWorld)) {
      clearPersistedSession();
      return null;
    }

    const grid = base64ToArrayBuffer(parsedWorld.gridBase64);
    if (grid.byteLength !== GRID_BYTE_LENGTH) {
      clearPersistedSession();
      return null;
    }

    const engine = GameEngine.fromSnapshot(
      {
        version: STORAGE_VERSION,
        mapSeed: parsedWorld.mapSeed,
        grid,
        buildings: parsedWorld.buildings,
        connections: parsedWorld.connections,
      },
      screenWidth,
      screenHeight,
    );

    const rawView = storage.getItem(VIEW_STORAGE_KEY);
    if (!rawView) {
      return {
        engine,
        selectedTool: { kind: 'select' },
        sessionId: parsedWorld.sessionId,
      };
    }

    const parsedView: unknown = JSON.parse(rawView);
    if (!isPersistedViewState(parsedView)) {
      removeViewSession();
      return {
        engine,
        selectedTool: { kind: 'select' },
        sessionId: parsedWorld.sessionId,
      };
    }

    if (parsedView.sessionId !== parsedWorld.sessionId) {
      removeViewSession();
      return {
        engine,
        selectedTool: { kind: 'select' },
        sessionId: parsedWorld.sessionId,
      };
    }

    engine.viewport.restore(parsedView.viewport);

    return {
      engine,
      selectedTool: parsedView.selectedTool,
      sessionId: parsedWorld.sessionId,
    };
  } catch {
    clearPersistedSession();
    return null;
  }
}
