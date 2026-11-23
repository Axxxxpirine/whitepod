import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { OfflineSession } from '@/game/idle/OfflineSession';
import { ActionLogger, MAX_STORED_ACTIONS } from '@/game/persistence/actionLogger';
import { ACTION_LOG_KEY } from '@/game/persistence/sessionSlots';
import {
  WORLD_STORAGE_KEY,
  hasSavedWorld,
  loadPersistedSession,
  readSavedSessionSummary,
  saveWorldSession,
} from '@/game/persistence/sessionStorage';
import { ResourceType, TileType } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

type RawWorld = {
  gridBase64: string;
  buildings: { buildings: { id: number; typeId: string; origin: { x: number; y: number }; rotation: number }[] };
  connections: { connections: unknown[] };
  processorStates: { id: number; cycleProgress: unknown; recipeId: unknown }[];
  storageInventories: { id: number; inventory: Record<string, unknown> }[];
  producerOutputBuffers: { id: number; buffer: unknown }[];
};

function damageSave(damage: (world: RawWorld) => void): string {
  const world = JSON.parse(window.localStorage.getItem(WORLD_STORAGE_KEY)!) as RawWorld;
  damage(world);
  const raw = JSON.stringify(world);
  window.localStorage.setItem(WORLD_STORAGE_KEY, raw);
  return raw;
}

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('a campaign save the game recognises but cannot rebuild', () => {
  it.each<[string, (world: RawWorld) => void]>([
    ['a building type retired from the catalog', (w) => { w.buildings.buildings.push({ id: 900, typeId: 'retired_building', origin: { x: 3, y: 3 }, rotation: 0 }); }],
    ['a connection to a missing building', (w) => { w.connections.connections.push({ id: 900, from: { building: 4242, port: 'out' }, to: { building: 1, port: 'in_west_1' } }); }],
    ['a truncated grid', (w) => { w.gridBase64 = w.gridBase64.slice(0, 4000); }],
  ])('%s: is never erased by trying to continue it', (_name, damage) => {
    const engine = new GameEngine(1280, 720, { gameMode: GameMode.Campaign });
    engine.generateMap(7);
    saveWorldSession(engine, 'campaign');
    const raw = damageSave(damage);

    // The start screen still offers it; the player clicks Continue.
    expect(readSavedSessionSummary()).not.toBeNull();
    expect(loadPersistedSession(1280, 720)).toBeNull();

    // GameCanvas reads this to go back to the start screen instead of creating a world over the save.
    expect(hasSavedWorld()).toBe(true);
    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).toBe(raw);
  });

  it('has no saved world once a payload of another format was purged, or without a save', () => {
    expect(hasSavedWorld()).toBe(false);
    window.localStorage.setItem(WORLD_STORAGE_KEY, '{"version":1,"oops":true}');
    expect(loadPersistedSession(640, 480)).toBeNull();
    expect(hasSavedWorld()).toBe(false);
  });

  it('tells the player on the start screen and keeps the save until a new game is confirmed', () => {
    useGameStore.getState().leaveUnreadableSave();
    expect(useGameStore.getState()).toMatchObject({ saveUnreadable: true, startScreenOpen: true, sessionStarted: false, engine: null });

    useGameStore.getState().resumeSession();
    expect(useGameStore.getState().saveUnreadable).toBe(false);
    useGameStore.setState({ sessionStarted: false, startScreenOpen: true });
  });
});

describe('damaged values in a save', () => {
  /** Extractor -> converter (iron oxide) -> storage, powered, saved after 30 s. */
  function savedLine() {
    const engine = new GameEngine(800, 600, { dayNightCycleSeconds: 1e9 });
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    engine.setSimulationTime(0.5);
    engine.placeResource(4, 10, ResourceType.Regolith);
    const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 4, y: 10 })!;
    const panel = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 2, y: 6 })!;
    const panel2 = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 2, y: 2 })!;
    const converter = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 9 })!;
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 18, y: 9 })!;
    engine.setProcessorRecipe(converter, 'iron_oxide');
    for (const id of [panel2, extractor, converter]) engine.connectBuildings(panel, id);
    expect(engine.placeBelt({ building: extractor, port: 'out_east' }, { building: converter, port: 'in' }).ok).toBe(true);
    expect(engine.placeBelt({ building: converter, port: 'out' }, { building: storage, port: 'in_west' }).ok).toBe(true);
    for (let i = 0; i < 300; i++) engine.update(0.1);
    saveWorldSession(engine, 's');
    return { extractor, converter, storage };
  }

  function reloadWith(damage: (world: RawWorld) => void): GameEngine {
    damageSave(damage);
    const loaded = loadPersistedSession(800, 600);
    expect(loaded).not.toBeNull();
    for (let i = 0; i < 600; i++) loaded!.engine.update(0.1);
    return loaded!.engine;
  }

  const stockOf = (world: RawWorld, id: number) => world.storageInventories.find((entry) => entry.id === id)!.inventory;

  it('does not concatenate onto a stock saved as text, nor accept a negative one', () => {
    const { storage } = savedLine();
    const engine = reloadWith((w) => {
      stockOf(w, storage).ironOxide = '5';
      stockOf(w, storage).regolith = -50;
    });

    expect(typeof engine.getResourceCounts().ironOxide).toBe('number');
    expect(engine.getStorageInventory(storage)!.ironOxide).toBeGreaterThan(0);
    expect(engine.getStorageInventory(storage)!.regolith).toBe(0);
  });

  it('keeps a machine producing whatever its saved cycle counter or recipe says', () => {
    const { converter, storage } = savedLine();
    const engine = reloadWith((w) => {
      stockOf(w, storage).ironOxide = 0;
      w.processorStates.find((entry) => entry.id === converter)!.cycleProgress = -1e9;
    });
    expect(engine.getStorageInventory(storage)!.ironOxide).toBeGreaterThan(0);

    const unknownRecipe = reloadWith((w) => {
      w.processorStates.find((entry) => entry.id === converter)!.recipeId = 'retired_recipe';
    });
    expect(unknownRecipe.getProcessorState(converter)).toEqual({ recipeId: null, cycleProgress: 0 });
  });

  it('keeps an extractor producing when its saved output buffer is empty or unknown', () => {
    const { extractor, storage } = savedLine();
    const engine = reloadWith((w) => {
      stockOf(w, storage).ironOxide = 0;
      w.producerOutputBuffers = [{ id: extractor, buffer: null }, { id: extractor, buffer: { resourceType: 999, amount: 1 } }];
    });
    expect(engine.getStorageInventory(storage)!.ironOxide).toBeGreaterThan(0);
  });
});

describe('a full localStorage', () => {
  it('still changes the volume', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    });

    expect(() => useGameStore.getState().setMusicVolume(0.2)).not.toThrow();
    expect(useGameStore.getState().musicVolume).toBe(0.2);
    expect(() => useGameStore.getState().setSfxVolume(0.1)).not.toThrow();
    expect(useGameStore.getState().sfxVolume).toBe(0.1);
  });

  it('is not filled by the action log, game after game', () => {
    for (let game = 1; game <= 6; game++) {
      const logger = new ActionLogger(`game-${game}`, () => true, window.localStorage);
      for (let index = 0; index < 900; index++) logger.log('place_building', { typeId: 'solar_panel', index });
      logger.flush();
    }

    const stored = JSON.parse(window.localStorage.getItem(ACTION_LOG_KEY)!) as Record<string, unknown[]>;
    const total = Object.values(stored).reduce((sum, log) => sum + log.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_STORED_ACTIONS);
    // The session being played is kept whole, older ones make room, most recent first.
    expect(stored['game-6']).toHaveLength(900);
    expect(Object.keys(stored)).toEqual(['game-5', 'game-6']);
  });

  it('keeps the latest actions of a session longer than the log', () => {
    const logger = new ActionLogger('marathon', () => true, window.localStorage);
    for (let index = 0; index < MAX_STORED_ACTIONS + 500; index++) logger.log('place_building', { index });
    logger.flush();

    const stored = JSON.parse(window.localStorage.getItem(ACTION_LOG_KEY)!) as Record<string, { sequence: number }[]>;
    expect(stored.marathon).toHaveLength(MAX_STORED_ACTIONS);
    expect(stored.marathon!.at(-1)!.sequence).toBe(MAX_STORED_ACTIONS + 499);
    // The session in memory still exports everything it logged.
    expect(logger.getActions()).toHaveLength(MAX_STORED_ACTIONS + 500);
  });
});

describe('a system clock set back while the tab was hidden', () => {
  it('clears the pause marker when play resumes with nothing to replay', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000_000);
    const checkpoint = vi.fn();
    const session = new OfflineSession(new GameEngine(640, 480), { checkpoint, completed: vi.fn(), busy: vi.fn() });

    session.suspend(true);
    expect(checkpoint).toHaveBeenLastCalledWith(1_000_000_000);

    vi.setSystemTime(1_000_000_000 - 3_600_000);
    session.resume();

    expect(session.active).toBe(true);
    expect(checkpoint).toHaveBeenLastCalledWith(null);
  });
});
