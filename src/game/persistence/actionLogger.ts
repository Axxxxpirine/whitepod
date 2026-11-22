import { ACTION_LOG_KEY, getActiveSaveStorage, type SaveStorage } from './sessionSlots';

export type ActionKind = 
  | 'place_building'
  | 'remove_building'
  | 'connect_buildings'
  | 'disconnect_buildings'  
  | 'place_belt'
  | 'set_processor_recipe'
  | 'place_resource'
  | 'remove_resource'
  | 'generate_map';

export interface LoggedAction {
  sequence: number;
  timestampMs: number;
  kind: ActionKind;
  payload: Record<string, unknown>;
}

export interface ActionLogSession {
  sessionId: string;
  startedAtMs: number;
  actions: LoggedAction[];
}

export class ActionLogger {
  private readonly storage: SaveStorage | null;
  private readonly canWrite: () => boolean;
  private sessionId: string;
  private sequence: number;
  private actions: LoggedAction[];

  constructor(sessionId: string, canWrite: () => boolean = () => true, storage = getActiveSaveStorage()) {
    this.storage = storage;
    this.canWrite = canWrite;
    this.sessionId = sessionId;
    this.actions = loadActionLog(sessionId, storage) ?? [];
    this.sequence = (this.actions.at(-1)?.sequence ?? -1) + 1;
  }

  log(kind: ActionKind, payload: Record<string, unknown>): void {
    this.actions.push({
      sequence: this.sequence++,
      timestampMs: Date.now(),
      kind,
      payload,
    });

    if (this.actions.length % 10 === 0) {
      this.flush();
    }
  }

  flush(): void {
    if (this.canWrite()) saveActionLog(this.sessionId, this.actions, this.storage);
  }

  getActions(): LoggedAction[] {
    return [...this.actions];
  }

  exportToJson(): string {
    const payload: ActionLogSession = {
      sessionId: this.sessionId,
      startedAtMs: this.actions[0]?.timestampMs ?? Date.now(),
      actions: this.actions,
    };
    return JSON.stringify(payload, null, 2);
  }

  exportToNdjson(): string {
    return this.actions.map(a => JSON.stringify(a)).join('\n');
  }

  clear(): void {
    this.actions = [];
    this.sequence = 0;
    if (this.canWrite()) clearSessionLog(this.sessionId, this.storage);
  }

  bindAutoSave(): () => void {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        this.flush();
      }
    };
    document.addEventListener('visibilitychange', handler);
    
    const unloadHandler = () => {
      this.flush();
    };
    window.addEventListener('beforeunload', unloadHandler);
    window.addEventListener('pagehide', unloadHandler);

    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('beforeunload', unloadHandler);
      window.removeEventListener('pagehide', unloadHandler);
    };
  }
}

function saveActionLog(sessionId: string, actions: LoggedAction[], storage: SaveStorage | null): void {
  if (!storage) return;

  try {
    const existingRaw = storage.getItem(ACTION_LOG_KEY);
    let allLogs: Record<string, LoggedAction[]> = {};
    
    if (existingRaw) {
      try {
        allLogs = JSON.parse(existingRaw);
      } catch {
        // Start fresh if corrupted
      }
    }

    allLogs[sessionId] = actions;
    storage.setItem(ACTION_LOG_KEY, JSON.stringify(allLogs));
  } catch {
    // quota exceeded or private mode
  }
}

export function loadActionLog(sessionId: string, storage = getActiveSaveStorage()): LoggedAction[] | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(ACTION_LOG_KEY);
    if (!raw) return null;

    const allLogs: Record<string, LoggedAction[]> = JSON.parse(raw);
    const entries = allLogs[sessionId];
    if (!Array.isArray(entries)) return null;
    return entries.filter((action) => action && Number.isSafeInteger(action.sequence) &&
      Number.isFinite(action.timestampMs) && typeof action.kind === 'string' &&
      typeof action.payload === 'object' && action.payload !== null);
  } catch {
    return null;
  }
}

function clearSessionLog(sessionId: string, storage: SaveStorage | null): void {
  if (!storage) return;

  try {
    const raw = storage.getItem(ACTION_LOG_KEY);
    if (!raw) return;

    const allLogs: Record<string, LoggedAction[]> = JSON.parse(raw);
    delete allLogs[sessionId];
    storage.setItem(ACTION_LOG_KEY, JSON.stringify(allLogs));
  } catch {
    // best effort
  }
}

export function clearAllActionLogs(): void {
  const storage = getActiveSaveStorage();
  storage?.removeItem(ACTION_LOG_KEY);
}

export function loadAllActionLogs(): Record<string, LoggedAction[]> {
  const storage = getActiveSaveStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(ACTION_LOG_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
