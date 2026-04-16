import { beforeEach, describe, expect, it } from 'vitest';
import {
  IDLE_SIDECAR_KEY,
  LEGACY_WORLD_STORAGE_KEY,
  VIEW_STORAGE_KEY,
  WORLD_STORAGE_KEY,
  buildPersistedSessionPayloads,
  clearIdleSidecar,
  clearPersistedSession,
  installPersistedSession,
  loadPersistedSession,
  readIdleSidecar,
  saveViewSession,
  saveWorldSession,
  writeIdleSidecar,
} from '@/game/persistence/sessionStorage';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';

function makeEngine() {
  const engine = new GameEngine(640, 480);
  engine.generateMap(99);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.grid.setResource(8, 8, ResourceType.Regolith);
  engine.placeBuilding('extractor_basic', { x: 8, y: 8 });
  return engine;
}

describe('persistent storage', () => {
  beforeEach(() => {
    clearPersistedSession();
    window.localStorage.clear();
  });

  it('saves and reloads the world and view state from localStorage', () => {
    const engine = makeEngine();
    engine.viewport.pan(120, 40);
    engine.viewport.zoomAt(320, 240, 1.3);

    saveWorldSession(engine, 'session-a');
    saveViewSession({
      engine,
      selectedTool: { kind: 'building', buildingType: 'extractor_basic' },
      sessionId: 'session-a',
    });

    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).not.toBeNull();
    const loaded = loadPersistedSession(640, 480);

    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe('session-a');
    expect(loaded?.selectedTool).toEqual({ kind: 'building', buildingType: 'extractor_basic' });
    expect(loaded?.engine.getResourceAt(8, 8)).toBe(ResourceType.Regolith);
    expect(loaded?.engine.getBuildingAt(8, 8)?.typeId).toBe('extractor_basic');
    expect(loaded?.engine.getViewportSnapshot()).toEqual(engine.getViewportSnapshot());
  });

  it('accepts belt as a persisted selected tool', () => {
    const engine = makeEngine();

    saveWorldSession(engine, 'session-a');
    saveViewSession({
      engine,
      selectedTool: { kind: 'belt' },
      sessionId: 'session-a',
    });

    const loaded = loadPersistedSession(640, 480);

    expect(loaded?.selectedTool).toEqual({ kind: 'belt' });
  });

  it('ignores a view snapshot with a mismatched session id', () => {
    const engine = makeEngine();
    saveWorldSession(engine, 'session-a');
    window.localStorage.setItem(
      VIEW_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        sessionId: 'session-b',
        viewport: { centerX: 10, centerY: 20, zoom: 2 },
        selectedTool: { kind: 'building', buildingType: 'extractor_basic' },
      }),
    );

    const loaded = loadPersistedSession(640, 480);

    expect(loaded?.selectedTool).toEqual({ kind: 'select' });
    expect(loaded?.engine.getViewportSnapshot()).toEqual(new GameEngine(640, 480).getViewportSnapshot());
    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
  });

  it('purges invalid world payloads and returns null', () => {
    window.localStorage.setItem(WORLD_STORAGE_KEY, '{"version":1,"oops":true}');
    window.localStorage.setItem(VIEW_STORAGE_KEY, '{"version":1,"oops":true}');

    const loaded = loadPersistedSession(640, 480);

    expect(loaded).toBeNull();
    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
  });

  it('migrates a legacy v2 world payload to the durable store', () => {
    const engine = makeEngine();
    saveWorldSession(engine, 'session-legacy');
    const v3Payload = window.localStorage.getItem(WORLD_STORAGE_KEY);
    expect(v3Payload).not.toBeNull();

    window.localStorage.removeItem(WORLD_STORAGE_KEY);
    window.localStorage.setItem(LEGACY_WORLD_STORAGE_KEY, v3Payload!.replace('"version":3', '"version":2'));

    const loaded = loadPersistedSession(640, 480);
    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe('session-legacy');
    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(LEGACY_WORLD_STORAGE_KEY)).toBeNull();
  });

  it('builds and installs aligned world/view payloads from shared helpers', () => {
    const engine = makeEngine();
    engine.viewport.pan(120, 40);

    const payloads = buildPersistedSessionPayloads({
      engine,
      selectedTool: { kind: 'belt' },
      sessionId: 'session-shared',
    });

    expect(payloads.world.sessionId).toBe('session-shared');
    expect(payloads.view.sessionId).toBe('session-shared');
    expect(payloads.view.selectedTool).toEqual({ kind: 'belt' });

    installPersistedSession({
      engine,
      selectedTool: { kind: 'belt' },
      sessionId: 'session-shared',
    });

    const loaded = loadPersistedSession(640, 480);
    expect(loaded?.sessionId).toBe('session-shared');
    expect(loaded?.selectedTool).toEqual({ kind: 'belt' });
    expect(loaded?.engine.getViewportSnapshot()).toEqual(engine.getViewportSnapshot());
  });

});

describe('idle sidecar', () => {
  beforeEach(() => {
    clearPersistedSession();
    window.localStorage.clear();
  });

  it('writes, reads, and clears the sidecar in localStorage', () => {
    writeIdleSidecar('session-x', 1_234_567);
    expect(window.localStorage.getItem(IDLE_SIDECAR_KEY)).not.toBeNull();

    const sidecar = readIdleSidecar();
    expect(sidecar).not.toBeNull();
    expect(sidecar?.sessionId).toBe('session-x');
    expect(sidecar?.pausedAtWallClockMs).toBe(1_234_567);

    clearIdleSidecar();
    expect(window.localStorage.getItem(IDLE_SIDECAR_KEY)).toBeNull();
  });

  it('ignores a sidecar with a mismatched sessionId on load', () => {
    const engine = makeEngine();
    saveWorldSession(engine, 'session-owner');
    writeIdleSidecar('session-different', 99_999);

    const loaded = loadPersistedSession(640, 480);

    expect(loaded).not.toBeNull();
    expect(loaded?.idleSidecar).toBeNull();
    expect(window.localStorage.getItem(IDLE_SIDECAR_KEY)).toBeNull();
  });

  it('returns a matching sidecar on load', () => {
    const engine = makeEngine();
    saveWorldSession(engine, 'session-owner');
    writeIdleSidecar('session-owner', 12_345);

    const loaded = loadPersistedSession(640, 480);

    expect(loaded?.idleSidecar).not.toBeNull();
    expect(loaded?.idleSidecar?.pausedAtWallClockMs).toBe(12_345);
  });
});
