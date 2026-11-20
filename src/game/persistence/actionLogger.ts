import { getLocalStorage } from './browserStorage';

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
  private sessionId: string;
  private sequence: number;
  private actions: LoggedAction[];

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.sequence = 0;
    this.actions = [];
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
    saveActionLog(this.sessionId, this.actions);
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
    clearSessionLog(this.sessionId);
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

    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('beforeunload', unloadHandler);
    };
  }
}

const ACTION_LOG_KEY = 'whitepod:actions:v1';

function saveActionLog(sessionId: string, actions: LoggedAction[]): void {
  const storage = getLocalStorage();
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

export function loadActionLog(sessionId: string): LoggedAction[] | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  try {
    const raw = storage.getItem(ACTION_LOG_KEY);
    if (!raw) return null;

    const allLogs: Record<string, LoggedAction[]> = JSON.parse(raw);
    return allLogs[sessionId] ?? null;
  } catch {
    return null;
  }
}

function clearSessionLog(sessionId: string): void {
  const storage = getLocalStorage();
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
  const storage = getLocalStorage();
  storage?.removeItem(ACTION_LOG_KEY);
}

export function loadAllActionLogs(): Record<string, LoggedAction[]> {
  const storage = getLocalStorage();
  if (!storage) return {};

  try {
    const raw = storage.getItem(ACTION_LOG_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
