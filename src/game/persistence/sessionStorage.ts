import { GRID_SIZE } from '@/game/constants';
import { isGameMode, resolveGameMode, type GameMode } from '@/game/data/gameMode';
import { GameEngine, type SerializedGameWorld } from '@/game/engine/GameEngine';
import { DEFAULT_BOT_PROFILE_ID, getBotProfile } from '@/game/bot/botProfiles';
import type { BotProfileId } from '@/game/bot/botTypes';
import type { ViewportSnapshot } from '@/game/engine/Viewport';
import { Direction, type SelectedTool } from '@/game/types';
import { getLocalStorage } from './browserStorage';
import {
  claimSaveSlot, currentSaveGeneration, getActiveSaveStorage, replaceSaveSlot, SAVE_HANDOFF_LOCK,
  WORLD_STORAGE_KEY, VIEW_STORAGE_KEY, IDLE_SIDECAR_KEY, type SaveStorage,
} from './sessionSlots';
export { createSessionId, WORLD_STORAGE_KEY, VIEW_STORAGE_KEY, IDLE_SIDECAR_KEY, SESSION_WRITER_KEY } from './sessionSlots';

export const LEGACY_WORLD_STORAGE_KEY = 'whitepod:session:world:v2';
export const LEGACY_VIEW_STORAGE_KEY = 'whitepod:session:view:v2';


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
  readonly simulationRemainder?: number;
  readonly extractionAccumulator?: number;
  readonly dayNightCycleSeconds?: number;
  readonly beltTokens?: SerializedGameWorld['beltTokens'];
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
  if (value.kind === 'belt') return value.tier === undefined || value.tier === 'basic' || value.tier === 'fast';
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

function areBeltTokensValid(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((entry) => isRecord(entry) && isFiniteNumber(entry.id) && isFiniteNumber(entry.tokens)))
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
    simulationTimeValid &&
    (value.simulationRemainder === undefined || isFiniteNumber(value.simulationRemainder)) &&
    (value.extractionAccumulator === undefined || isFiniteNumber(value.extractionAccumulator)) &&
    (value.dayNightCycleSeconds === undefined || isFiniteNumber(value.dayNightCycleSeconds)) &&
    areBeltTokensValid(value.beltTokens)
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

function removeViewSession(storage: SaveStorage | null): void {
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
    simulationRemainder: value.simulationRemainder,
    extractionAccumulator: value.extractionAccumulator,
    dayNightCycleSeconds: value.dayNightCycleSeconds,
    batteryCharges: value.batteryCharges,
    processorStates: value.processorStates,
    storageInventories: value.storageInventories,
    producerOutputBuffers: value.producerOutputBuffers,
    processorReservations: value.processorReservations,
    completedMilestones: value.completedMilestones,
    beltTokens: value.beltTokens,
  };
}

function readViewState(storage: SaveStorage | null): PersistedViewStateV3 | PersistedViewStateV2 | null {
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

function writeWorldState(payload: PersistedWorldStateV3, storage = getActiveSaveStorage()): boolean {
  if (!storage) return false;

  try {
    storage.setItem(WORLD_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function writeViewState(payload: PersistedViewStateV3, storage = getActiveSaveStorage()): void {
  if (!storage) return;

  try {
    storage.setItem(VIEW_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // best effort
  }
}

export function readIdleSidecar(storage = getActiveSaveStorage()): IdleSidecar | null {
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

export function writeIdleSidecar(sessionId: string, pausedAtWallClockMs: number, storage = getActiveSaveStorage()): void {
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

export function clearIdleSidecar(storage = getActiveSaveStorage()): void {
  storage?.removeItem(IDLE_SIDECAR_KEY);
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

export function clearPersistedSession(): void {
  replaceSaveSlot();
  clearSessionData(getLocalStorage());
}

function clearSessionData(storage: SaveStorage | null): void {
  storage?.removeItem(WORLD_STORAGE_KEY);
  storage?.removeItem(LEGACY_WORLD_STORAGE_KEY);
  storage?.removeItem(VIEW_STORAGE_KEY);
  storage?.removeItem(LEGACY_VIEW_STORAGE_KEY);

  clearIdleSidecar(storage);
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
    simulationRemainder: snapshot.simulationRemainder,
    extractionAccumulator: snapshot.extractionAccumulator,
    dayNightCycleSeconds: snapshot.dayNightCycleSeconds,
    batteryCharges: snapshot.batteryCharges,
    processorStates: snapshot.processorStates,
    storageInventories: snapshot.storageInventories,
    producerOutputBuffers: snapshot.producerOutputBuffers,
    processorReservations: snapshot.processorReservations,
    completedMilestones: snapshot.completedMilestones,
    beltTokens: snapshot.beltTokens,
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
}): boolean {
  const payloads = buildPersistedSessionPayloads(args);
  const installed = replaceSaveSlot({
    world: JSON.stringify(payloads.world),
    view: JSON.stringify(payloads.view),
  });
  if (installed) clearSessionData(getLocalStorage());
  return installed;
}

/**
 * A fresh token belongs to one mounted engine, including when two tabs resume
 * the same session id. Recheck it on unload as storage events may be delayed
 * while a tab is suspended.
 */
export function claimSessionWriter() {
  const slot = claimSaveSlot();
  return {
    ...slot,
    saveWorldSession(engine: GameEngine, sessionId: string) {
      return slot.isCurrent() && writeWorldState(buildPersistedWorldState(engine, sessionId), slot.storage) && slot.isCurrent();
    },
    saveViewSession(args: Parameters<typeof saveViewSession>[0]) {
      if (slot.isCurrent()) writeViewState(buildPersistedViewState(args), slot.storage);
    },
    writeIdleSidecar(sessionId: string, pausedAtWallClockMs: number) {
      writeIdleSidecar(sessionId, pausedAtWallClockMs, slot.storage);
    },
    clearIdleSidecar() {
      clearIdleSidecar(slot.storage);
    },
  };
}

/** Serialize just the pointer handoff, never the gameplay or unload writes. */
export async function acquireSessionWriter(cancelled: () => boolean) {
  const generation = currentSaveGeneration();
  const claim = () => cancelled() || currentSaveGeneration() !== generation ? null : claimSessionWriter();
  if (!navigator.locks) return claim();
  try {
    return await navigator.locks.request(SAVE_HANDOFF_LOCK, claim);
  } catch {
    // Some embedded browsers expose the API but deny lock acquisition.
    return claim();
  }
}

/** What the start screen tells about the saved game, without rebuilding the world. */
export interface SavedSessionSummary {
  readonly gameMode: GameMode;
  readonly mapSeed: number;
  readonly completedMilestones: number;
}

/**
 * Summary of the saved world, or null when there is none or it would not load
 * (malformed or older format). Read-only: unlike loadPersistedSession, it
 * never clears a bad save.
 */
export function readSavedSessionSummary(): SavedSessionSummary | null {
  const raw = getActiveSaveStorage()?.getItem(WORLD_STORAGE_KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPersistedWorldStateV3(parsed)) return null;
  return {
    gameMode: resolveGameMode(parsed.gameMode),
    mapSeed: parsed.mapSeed,
    completedMilestones: parsed.completedMilestones?.length ?? 0,
  };
}

export function loadPersistedSession(screenWidth: number, screenHeight: number, worldStorage = getActiveSaveStorage()): LoadedSession | null {
  if (!worldStorage) return null;

  const rawWorldV3 = worldStorage.getItem(WORLD_STORAGE_KEY);

  let worldState: PersistedWorldStateV3 | null = null;

  if (rawWorldV3) {
    try {
      const parsed: unknown = JSON.parse(rawWorldV3);
      if (isPersistedWorldStateV3(parsed)) {
        worldState = parsed;
      } else {
        clearSessionData(worldStorage);
        return null;
      }
    } catch {
      clearSessionData(worldStorage);
      return null;
    }
  } else {
    const rawLegacy = worldStorage.getItem(LEGACY_WORLD_STORAGE_KEY);
    if (rawLegacy) {
      clearSessionData(worldStorage);
    }
    return null;
  }

  try {
    const grid = base64ToArrayBuffer(worldState.gridBase64);
    if (grid.byteLength < GRID_MIN_BYTE_LENGTH) {
      clearSessionData(worldStorage);
      return null;
    }

    const engine = GameEngine.fromSnapshot(
      toSnapshotInput(worldState),
      screenWidth,
      screenHeight,
    );

    const viewState = readViewState(worldStorage);

    if (viewState && viewState.sessionId === worldState.sessionId) {
      engine.viewport.restore(viewState.viewport);
    } else if (viewState && viewState.sessionId !== worldState.sessionId) {
      removeViewSession(worldStorage);
    }

    const sidecar = readIdleSidecar(worldStorage);
    const idleSidecar = sidecar && sidecar.sessionId === worldState.sessionId ? sidecar : null;
    if (sidecar && !idleSidecar) {
      clearIdleSidecar(worldStorage);
    }

    const selectedTool =
      viewState && viewState.sessionId === worldState.sessionId
        ? viewState.selectedTool
        : { kind: 'select' as const };

    const selectedBotProfileId =
      viewState && viewState.sessionId === worldState.sessionId && 'selectedBotProfileId' in viewState
        ? getBotProfile(viewState.selectedBotProfileId).id
        : DEFAULT_BOT_PROFILE_ID;

    const seedInput =
      viewState && viewState.sessionId === worldState.sessionId && 'seedInput' in viewState
        ? viewState.seedInput
        : String(worldState.mapSeed);

    return {
      engine,
      selectedTool,
      selectedBotProfileId,
      seedInput,
      sessionId: worldState.sessionId,
      idleSidecar,
    };
  } catch {
    clearSessionData(worldStorage);
    return null;
  }
}
