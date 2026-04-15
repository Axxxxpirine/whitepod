import { beforeEach, describe, expect, it } from 'vitest';
import {
  VIEW_STORAGE_KEY,
  WORLD_STORAGE_KEY,
  clearPersistedSession,
  loadPersistedSession,
  saveViewSession,
  saveWorldSession,
} from '@/game/persistence/sessionStorage';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';

function makeEngine() {
  const engine = new GameEngine(640, 480);
  engine.generateMap(99);
  engine.grid.fill(TileType.Ground);
  engine.grid.setResource(8, 8, ResourceType.Coal);
  engine.placeBuilding('extractor_basic', { x: 8, y: 8 });
  return engine;
}

describe('sessionStorage persistence', () => {
  beforeEach(() => {
    clearPersistedSession();
  });

  it('saves and reloads the world and view state', () => {
    const engine = makeEngine();
    engine.viewport.pan(120, 40);
    engine.viewport.zoomAt(320, 240, 1.3);

    saveWorldSession(engine, 'session-a');
    saveViewSession({
      engine,
      selectedTool: { kind: 'building', buildingType: 'extractor_basic' },
      sessionId: 'session-a',
    });

    const loaded = loadPersistedSession(640, 480);

    expect(loaded).not.toBeNull();
    expect(loaded?.sessionId).toBe('session-a');
    expect(loaded?.selectedTool).toEqual({ kind: 'building', buildingType: 'extractor_basic' });
    expect(loaded?.engine.getResourceAt(8, 8)).toBe(ResourceType.Coal);
    expect(loaded?.engine.getBuildingAt(8, 8)?.typeId).toBe('extractor_basic');
    expect(loaded?.engine.getViewportSnapshot()).toEqual(engine.getViewportSnapshot());
  });

  it('ignores a view snapshot with a mismatched session id', () => {
    const engine = makeEngine();
    saveWorldSession(engine, 'session-a');
    window.sessionStorage.setItem(
      VIEW_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        sessionId: 'session-b',
        viewport: { centerX: 10, centerY: 20, zoom: 2 },
        selectedTool: { kind: 'building', buildingType: 'extractor_basic' },
      }),
    );

    const loaded = loadPersistedSession(640, 480);

    expect(loaded?.selectedTool).toEqual({ kind: 'select' });
    expect(loaded?.engine.getViewportSnapshot()).toEqual(new GameEngine(640, 480).getViewportSnapshot());
    expect(window.sessionStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
  });

  it('purges invalid world payloads and returns null', () => {
    window.sessionStorage.setItem(WORLD_STORAGE_KEY, '{"version":1,"oops":true}');
    window.sessionStorage.setItem(VIEW_STORAGE_KEY, '{"version":1,"oops":true}');

    const loaded = loadPersistedSession(640, 480);

    expect(loaded).toBeNull();
    expect(window.sessionStorage.getItem(WORLD_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
  });
});
