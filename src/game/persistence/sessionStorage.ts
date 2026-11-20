import { GRID_SIZE } from '@/game/constants';
import { isGameMode } from '@/game/data/gameMode';
import { GameEngine, type SerializedGameWorld } from '@/game/engine/GameEngine';
import { DEFAULT_BOT_PROFILE_ID } from '@/game/bot/botProfiles';
import type { BotProfileId } from '@/game/bot/botTypes';
import type { ViewportSnapshot } from '@/game/engine/Viewport';
import { Direction, type SelectedTool } from '@/game/types';
import { getLocalStorage } from './browserStorage';

export const WORLD_STORAGE_KEY = 'whitepod:session:world:v3';
export const VIEW_STORAGE_KEY = 'whitepod:session:view:v3';
export const LEGACY_WORLD_STORAGE_KEY = 'whitepod:session:world:v2';
export const LEGACY_VIEW_STORAGE_KEY = 'whitepod:session:view:v2';
export const IDLE_SIDECAR_KEY = 'whitepod:idle-sidecar:v1';

const WORLD_STORAGE_VERSION = 3;
const WORLD_IDLE_VERSION = 1;
const VIEW_STORAGE_VERSION = 3;
const IDLE_SIDECAR_VERSION = 1;
const GRID_MIN_BYTE_LENGTH = GRID_SIZE * 3;

export interface PersistedWorldStateV3 {
  readonly version: number;
  readonly storageVersion: number;
  readonly idleVersion: number;
  readonly sessionId: string;
  readonly mapSeed: number;
  readonly gameMode?: SerializedGameWorld['gameMode'];
  readonly gridBase64: string;
  readonly buildings: SerializedGameWorld['buildings'];
  readonly connections: SerializedGameWorld['connections'];
  readonly energyLinks?: readonly { readonly a: number; readonly b: number }[];
  readonly simulationTime?: number;
  readonly batteryCharges?: readonly { readonly id: number; readonly charge: number }[];
  readonly processorStates?: SerializedGameWorld['processorStates'];
  readonly storageInventories?: SerializedGameWorld['storageInventories'];
  readonly producerOutputBuffers?: SerializedGameWorld['producerOutputBuffers'];
  readonly processorReservations?: SerializedGameWorld['processorReservations'];
  readonly completedMilestones?: SerializedGameWorld['completedMilestones'];
}

export interface PersistedViewStateV3 {
  readonly version: number;
  readonly sessionId: string;
  readonly viewport: {
    readonly centerX: number;
    readonly centerY: number;
    readonly zoom: number;
  };
  readonly selectedTool: SelectedTool;
  readonly selectedBotProfileId: BotProfileId;
  readonly seedInput: string;
}

export interface PersistedViewStateV2 {
  readonly version: number;
  readonly sessionId: string;
  readonly viewport: {
    readonly centerX: number;
    readonly centerY: number;
    readonly zoom: number;
  };
  readonly selectedTool: SelectedTool;
}

export interface IdleSidecar {
  readonly version: number;
  readonly sessionId: string;
  readonly pausedAtWallClockMs: number;
}

interface LoadedSession {
  readonly engine: GameEngine;
  readonly selectedTool: SelectedTool;
  readonly selectedBotProfileId: BotProfileId;
  readonly seedInput: string;
  readonly sessionId: string;
  readonly idleSidecar: IdleSidecar | null;
}

export interface PersistedSessionPayloads {
  readonly world: PersistedWorldStateV3;
  readonly view: PersistedViewStateV3;
}

function getWorldStorage(): Storage | null {
  return getLocalStorage();
}

function getViewStorage(): Storage | null {
  return getLocalStorage();
}

function getSidecarStorage(): Storage | null {
  return getLocalStorage();
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

function areCompletedMilestonesValid(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((id) => typeof id === 'string'));
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
    (value.gameMode === undefined || isGameMode(value.gameMode)) &&
    areCompletedMilestonesValid(value.completedMilestones) &&
    typeof value.gridBase64 === 'string' &&
    value.gridBase64.length > 0 &&
    isSerializedBuildingRegistry(value.buildings) &&
    isSerializedConnectionRegistry(value.connections) &&
    areEnergyLinksValid(value.energyLinks) &&
    areBatteryChargesValid(value.batteryCharges) &&
    simulationTimeValid
  );
}

function isPersistedViewStateV3(value: unknown): value is PersistedViewStateV3 {
  if (!isRecord(value) || value.version !== VIEW_STORAGE_VERSION) return false;
  if (typeof value.sessionId !== 'string' || value.sessionId.length === 0) return false;
  if (!isRecord(value.viewport)) return false;
  return (
    isFiniteNumber(value.viewport.centerX) &&
    isFiniteNumber(value.viewport.centerY) &&
    isFiniteNumber(value.viewport.zoom) &&
    isSelectedTool(value.selectedTool) &&
      typeof value.selectedBotProfileId === 'string' &&
      (value.selectedBotProfileId === 'master' ||
        value.selectedBotProfileId === 'connector' ||
        value.selectedBotProfileId === 'greedy' ||
        value.selectedBotProfileId === 'fractal' ||
        value.selectedBotProfileId === 'explorer' ||
        value.selectedBotProfileId === 'balanced' ||
        value.selectedBotProfileId === 'logistics' ||
        value.selectedBotProfileId === 'speedrun' ||
        value.selectedBotProfileId === 'circuit') &&
    typeof value.seedInput === 'string'
  );
}

function isPersistedViewStateV2(value: unknown): value is PersistedViewStateV2 {
  if (!isRecord(value) || value.version !== 2) return false;
  if (typeof value.sessionId !== 'string' || value.sessionId.length === 0) return false;
  if (!isRecord(value.viewport)) return false;
  return (
    isFiniteNumber(value.viewport.centerX) &&
    isFiniteNumber(value.viewport.centerY) &&
    isFiniteNumber(value.viewport.zoom) &&
    isSelectedTool(value.selectedTool)
  );
}

function isIdleSidecar(value: unknown): value is IdleSidecar {
  return (
    isRecord(value) &&
    value.version === IDLE_SIDECAR_VERSION &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    isFiniteNumber(value.pausedAtWallClockMs)
  );
}

function removeViewSession(): void {
  const storage = getViewStorage();
  storage?.removeItem(VIEW_STORAGE_KEY);
  storage?.removeItem(LEGACY_VIEW_STORAGE_KEY);
}

function toSnapshotInput(value: PersistedWorldStateV3): SerializedGameWorld {
  return {
    version: 3,
    mapSeed: value.mapSeed,
    gameMode: value.gameMode,
    grid: base64ToArrayBuffer(value.gridBase64),
    buildings: value.buildings,
    connections: value.connections,
    energyLinks: value.energyLinks,
    simulationTime: value.simulationTime,
    batteryCharges: value.batteryCharges,
    processorStates: value.processorStates,
    storageInventories: value.storageInventories,
    producerOutputBuffers: value.producerOutputBuffers,
    processorReservations: value.processorReservations,
    completedMilestones: value.completedMilestones,
  };
}

function readViewState(): PersistedViewStateV3 | PersistedViewStateV2 | null {
  const storage = getViewStorage();
  if (!storage) return null;

  const keys = [VIEW_STORAGE_KEY, LEGACY_VIEW_STORAGE_KEY];

  for (const key of keys) {
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isPersistedViewStateV3(parsed) || isPersistedViewStateV2(parsed)) {
        return parsed;
      }
      storage.removeItem(key);
    } catch {
      storage.removeItem(key);
    }
  }

  return null;
}

function writeWorldState(payload: PersistedWorldStateV3): void {
  const storage = getWorldStorage();
  if (!storage) return;

  try {
    storage.setItem(WORLD_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode — drop the save, engine state stays in memory
  }
}

function writeViewState(payload: PersistedViewStateV3): void {
  const storage = getViewStorage();
  if (!storage) return;

  try {
    storage.setItem(VIEW_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // best effort
  }
}

export function readIdleSidecar(): IdleSidecar | null {
  const storage = getSidecarStorage();
  if (!storage) return null;
  const raw = storage.getItem(IDLE_SIDECAR_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isIdleSidecar(parsed)) return parsed;
    storage.removeItem(IDLE_SIDECAR_KEY);
  } catch {
    storage.removeItem(IDLE_SIDECAR_KEY);
  }
  return null;
}

export function writeIdleSidecar(sessionId: string, pausedAtWallClockMs: number): void {
  const storage = getSidecarStorage();
  if (!storage) return;
  if (!Number.isFinite(pausedAtWallClockMs)) return;
  const payload: IdleSidecar = {
    version: IDLE_SIDECAR_VERSION,
    sessionId,
    pausedAtWallClockMs,
  };
  try {
    storage.setItem(IDLE_SIDECAR_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode — best effort only
  }
}

export function clearIdleSidecar(): void {
  getSidecarStorage()?.removeItem(IDLE_SIDECAR_KEY);
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
  const storage = getLocalStorage();
  storage?.removeItem(WORLD_STORAGE_KEY);
  storage?.removeItem(LEGACY_WORLD_STORAGE_KEY);
  storage?.removeItem(VIEW_STORAGE_KEY);
  storage?.removeItem(LEGACY_VIEW_STORAGE_KEY);

  clearIdleSidecar();
}

export function buildPersistedWorldState(engine: GameEngine, sessionId: string): PersistedWorldStateV3 {
  const snapshot = engine.serializeWorld();
  return {
    version: WORLD_STORAGE_VERSION,
    storageVersion: WORLD_STORAGE_VERSION,
    idleVersion: WORLD_IDLE_VERSION,
    sessionId,
    mapSeed: snapshot.mapSeed,
    gameMode: snapshot.gameMode,
    gridBase64: arrayBufferToBase64(snapshot.grid),
    buildings: snapshot.buildings,
    connections: snapshot.connections,
    energyLinks: snapshot.energyLinks,
    simulationTime: snapshot.simulationTime,
    batteryCharges: snapshot.batteryCharges,
    processorStates: snapshot.processorStates,
    storageInventories: snapshot.storageInventories,
    producerOutputBuffers: snapshot.producerOutputBuffers,
    processorReservations: snapshot.processorReservations,
    completedMilestones: snapshot.completedMilestones,
  };
}

export function saveWorldSession(engine: GameEngine, sessionId: string): void {
  writeWorldState(buildPersistedWorldState(engine, sessionId));
}

export function buildPersistedViewState(args: {
  readonly engine: GameEngine;
  readonly selectedTool: SelectedTool;
  readonly selectedBotProfileId: BotProfileId;
  readonly seedInput: string;
  readonly sessionId: string;
  readonly viewport?: ViewportSnapshot;
}): PersistedViewStateV3 {
  return {
    version: VIEW_STORAGE_VERSION,
    sessionId: args.sessionId,
    viewport: args.viewport ?? args.engine.getViewportSnapshot(),
    selectedTool: args.selectedTool,
    selectedBotProfileId: args.selectedBotProfileId,
    seedInput: args.seedInput,
  };
}

export function saveViewSession(args: {
  readonly engine: GameEngine;
  readonly selectedTool: SelectedTool;
  readonly selectedBotProfileId: BotProfileId;
  readonly seedInput: string;
  readonly sessionId: string;
  readonly viewport?: ViewportSnapshot;
}): void {
  writeViewState(buildPersistedViewState(args));
}

export function buildPersistedSessionPayloads(args: {
  readonly engine: GameEngine;
  readonly selectedTool: SelectedTool;
  readonly selectedBotProfileId: BotProfileId;
  readonly seedInput: string;
  readonly sessionId: string;
  readonly viewport?: ViewportSnapshot;
}): PersistedSessionPayloads {
  return {
    world: buildPersistedWorldState(args.engine, args.sessionId),
    view: buildPersistedViewState(args),
  };
}

export function installPersistedSession(args: {
  readonly engine: GameEngine;
  readonly selectedTool: SelectedTool;
  readonly selectedBotProfileId: BotProfileId;
  readonly seedInput: string;
  readonly sessionId: string;
  readonly viewport?: ViewportSnapshot;
}): void {
  const payloads = buildPersistedSessionPayloads(args);
  writeWorldState(payloads.world);
  writeViewState(payloads.view);
  clearIdleSidecar();
}

export function loadPersistedSession(screenWidth: number, screenHeight: number): LoadedSession | null {
  const worldStorage = getWorldStorage();
  if (!worldStorage) return null;

  const rawWorldV3 = worldStorage.getItem(WORLD_STORAGE_KEY);

  let worldState: PersistedWorldStateV3 | null = null;

  if (rawWorldV3) {
    try {
      const parsed: unknown = JSON.parse(rawWorldV3);
      if (isPersistedWorldStateV3(parsed)) {
        worldState = parsed;
      } else {
        clearPersistedSession();
        return null;
      }
    } catch {
      clearPersistedSession();
      return null;
    }
  } else {
    const rawLegacy = worldStorage.getItem(LEGACY_WORLD_STORAGE_KEY);
    if (rawLegacy) {
      clearPersistedSession();
    }
    return null;
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

    if (viewState && viewState.sessionId === worldState.sessionId) {
      engine.viewport.restore(viewState.viewport);
    } else if (viewState && viewState.sessionId !== worldState.sessionId) {
      removeViewSession();
    }

    const sidecar = readIdleSidecar();
    const idleSidecar = sidecar && sidecar.sessionId === worldState.sessionId ? sidecar : null;
    if (sidecar && !idleSidecar) {
      clearIdleSidecar();
    }

    const selectedTool =
      viewState && viewState.sessionId === worldState.sessionId
        ? viewState.selectedTool
        : { kind: 'select' as const };

    const selectedBotProfileId =
      viewState && viewState.sessionId === worldState.sessionId && 'selectedBotProfileId' in viewState
        ? viewState.selectedBotProfileId
        : DEFAULT_BOT_PROFILE_ID;

    const seedInput =
      viewState && viewState.sessionId === worldState.sessionId && 'seedInput' in viewState
        ? viewState.seedInput
        : String(worldState.mapSeed);

    if (worldState.version === 2) {
      saveWorldSession(engine, worldState.sessionId);
      worldStorage.removeItem(LEGACY_WORLD_STORAGE_KEY);
    }

    return {
      engine,
      selectedTool,
      selectedBotProfileId,
      seedInput,
      sessionId: worldState.sessionId,
      idleSidecar,
    };
  } catch {
    clearPersistedSession();
    return null;
  }
}
