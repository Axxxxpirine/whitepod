import { getLocalStorage } from './browserStorage';

export const WORLD_STORAGE_KEY = 'whitepod:session:world:v3';
export const VIEW_STORAGE_KEY = 'whitepod:session:view:v3';
export const IDLE_SIDECAR_KEY = 'whitepod:idle-sidecar:v1';
export const ACTION_LOG_KEY = 'whitepod:actions:v1';
export const SESSION_WRITER_KEY = 'whitepod:session:writer:v1';
export const SAVE_HANDOFF_LOCK = 'whitepod:save-handoff';
const EPOCH_KEY = 'whitepod:session:generation:v1';
const SLOT_PREFIX = 'whitepod:session:slot:';
const tokenPattern = /^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)?$/;
const keys = [WORLD_STORAGE_KEY, VIEW_STORAGE_KEY, IDLE_SIDECAR_KEY, ACTION_LOG_KEY];

export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Slot {
  token: string;
  inherited: Record<string, string>;
}

export function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function currentSaveGeneration(): string | null {
  return getLocalStorage()?.getItem(EPOCH_KEY) ?? null;
}

function writerKey(epoch: string | null): string {
  return epoch ? `${SESSION_WRITER_KEY}:${epoch}` : SESSION_WRITER_KEY;
}

function slotKey(slot: Slot, key: string): string {
  return `${SLOT_PREFIX}${slot.token}:${key}`;
}

function readSlot(storage: Storage, key: string): Slot | null {
  try {
    const slot = JSON.parse(storage.getItem(key) ?? 'null');
    if (typeof slot?.token !== 'string' || !tokenPattern.test(slot.token)) return null;
    if (!slot.inherited || typeof slot.inherited !== 'object') return null;
    const inherited: Record<string, string> = {};
    for (const logical of keys) {
      const ref = slot.inherited[logical];
      if (ref === logical) inherited[logical] = logical;
      else if (typeof ref === 'string' && ref.startsWith(SLOT_PREFIX) && ref.endsWith(`:${logical}`)) {
        const token = ref.slice(SLOT_PREFIX.length, -(logical.length + 1));
        if (tokenPattern.test(token)) inherited[logical] = ref;
      }
    }
    return { token: slot.token, inherited };
  } catch {
    return null;
  }
}

function existingKey(storage: Storage, slot: Slot | null, key: string): string {
  if (!slot) return key;
  const own = slotKey(slot, key);
  return storage.getItem(own) !== null ? own : slot.inherited[key] ?? key;
}

function bindSlot(storage: Storage, slot: Slot, isCurrent: () => boolean): SaveStorage {
  function write(key: string, value: string) {
    if (!isCurrent()) return;
    const own = slotKey(slot, key);
    storage.setItem(own, value);
    if (!isCurrent()) {
      // In-flight write after another tab published its own checkpoint. Keep
      // this key only if the new tab is still inheriting it.
      const active = readSlot(storage, writerKey(storage.getItem(EPOCH_KEY)));
      if (existingKey(storage, active, key) !== own) storage.removeItem(own);
      return;
    }
    // After a successful first checkpoint, the previous copy is unnecessary.
    const previous = slot.inherited[key];
    if (previous && previous !== slotKey(slot, key)) {
      delete slot.inherited[key];
      // A concurrent handoff may still be capturing the inherited key. Only
      // retire it inside that same short lock. Without locks the next claim
      // collects it, bounding storage to this checkpoint and its predecessor.
      if (navigator.locks && storage.getItem(previous) !== null) {
        void navigator.locks.request(SAVE_HANDOFF_LOCK, () => {
          if (isCurrent()) storage.removeItem(previous);
        }).catch(() => {});
      }
    }
  }
  return {
    getItem(key) {
      const own = storage.getItem(slotKey(slot, key));
      if (own !== null) return own || null;
      return storage.getItem(slot.inherited[key] ?? key) || null;
    },
    setItem: write,
    // A tombstone prevents an inherited pause marker from resurfacing.
    removeItem(key) { write(key, ''); },
  };
}

export function getActiveSaveStorage(): SaveStorage | null {
  const storage = getLocalStorage();
  if (!storage) return null;
  const epoch = storage.getItem(EPOCH_KEY);
  const ownerKey = writerKey(epoch);
  const slot = readSlot(storage, ownerKey);
  return slot ? bindSlot(storage, slot, () => storage.getItem(EPOCH_KEY) === epoch &&
    readSlot(storage, ownerKey)?.token === slot.token) : storage;
}

/** Snapshot garbage candidates before the handoff, excluding any future writer's keys. */
function physicalKeys(storage: Storage, epoch: string | null): string[] {
  const prefix = `${SLOT_PREFIX}${epoch ?? 'legacy'}.`;
  const result: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(prefix)) result.push(key);
  }
  return result;
}

function collectSlots(storage: Storage, candidates: string[], keep: Set<string>) {
  for (const key of candidates) {
    if (!keep.has(key)) storage.removeItem(key);
  }
}

export function isWorldStorageEvent(key: string | null): boolean {
  return key === null || key === EPOCH_KEY || key === WORLD_STORAGE_KEY ||
    (key.startsWith(SLOT_PREFIX) && key.endsWith(WORLD_STORAGE_KEY));
}

/** A new game never inherits a late write from a writer in the previous generation. */
export function replaceSaveSlot(initial?: { world: string; view: string }): boolean {
  const storage = getLocalStorage();
  if (!storage) return false;
  const oldEpoch = storage.getItem(EPOCH_KEY);
  const candidates = physicalKeys(storage, oldEpoch);
  const oldOwnerKey = writerKey(oldEpoch);
  const old = readSlot(storage, oldOwnerKey);
  const logKey = existingKey(storage, old, ACTION_LOG_KEY);
  const epoch = createSessionId();
  const slot: Slot = { token: `${epoch}.${epoch}`, inherited: { [ACTION_LOG_KEY]: logKey } };
  // World, view and idle start empty, even while an old tab is still writing.
  for (const key of keys) {
    if (key !== ACTION_LOG_KEY) slot.inherited[key] = slotKey(slot, key);
  }
  try {
    // Publish the new game only after both parts fit. Unload in the middle of
    // staging leaves the previous generation selected.
    if (initial) {
      storage.setItem(slotKey(slot, WORLD_STORAGE_KEY), initial.world);
      storage.setItem(slotKey(slot, VIEW_STORAGE_KEY), initial.view);
    }
    storage.setItem(writerKey(epoch), JSON.stringify(slot));
    storage.setItem(EPOCH_KEY, epoch);
  } catch {
    storage.removeItem(writerKey(epoch));
    if (initial) {
      storage.removeItem(slotKey(slot, WORLD_STORAGE_KEY));
      storage.removeItem(slotKey(slot, VIEW_STORAGE_KEY));
      return false;
    }
    // Revoking the owner also protects an explicit reset if metadata cannot grow.
  }
  storage.removeItem(oldOwnerKey);
  collectSlots(storage, candidates, new Set([logKey]));
  return true;
}

/**
 * Each mounted tab writes only its own physical keys. Even a write already
 * running in another browser process cannot replace the new writer's data.
 * The manifest shares existing payloads until their first successful rewrite.
 */
export function claimSaveSlot() {
  const storage = getLocalStorage();
  const epoch = storage?.getItem(EPOCH_KEY) ?? null;
  const ownerKey = writerKey(epoch);
  const token = `${epoch ?? 'legacy'}.${createSessionId()}`;
  const candidates = storage ? physicalKeys(storage, epoch) : [];
  const previous = storage ? readSlot(storage, ownerKey) : null;
  const inherited: Record<string, string> = {};
  if (storage) {
    for (const key of keys) inherited[key] = existingKey(storage, previous, key);
  }
  const slot = { token, inherited };
  const manifest = JSON.stringify(slot);
  let claimed = false;
  if (storage) {
    try {
      storage.setItem(ownerKey, manifest);
      claimed = true;
      if (storage.getItem(EPOCH_KEY) === epoch && storage.getItem(ownerKey) === manifest) {
        collectSlots(storage, candidates, new Set(Object.values(inherited)));
      }
    } catch {
      // Storage-restricted browsers still run the game in memory.
    }
  }
  function isCurrent(): boolean {
    return claimed && !!storage && storage.getItem(EPOCH_KEY) === epoch && storage.getItem(ownerKey) === manifest;
  }
  return {
    storage: storage ? bindSlot(storage, slot, isCurrent) : null,
    isCurrent,
    isSuperseded: () => claimed && !isCurrent(),
    onTakeover(callback: () => void) {
      const handleChange = (event: StorageEvent) => {
        if (event.key !== ownerKey && event.key !== EPOCH_KEY && event.key !== null) return;
        if (claimed && !isCurrent()) {
          window.removeEventListener('storage', handleChange);
          callback();
        }
      };
      window.addEventListener('storage', handleChange);
      return () => window.removeEventListener('storage', handleChange);
    },
  };
}
