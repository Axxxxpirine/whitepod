import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BotController } from '@/game/bot/BotController';
import { DEFAULT_BOT_PROFILE_ID } from '@/game/bot/botProfiles';
import { DEFAULT_GAME_MODE, GameMode, isGameMode, resolveGameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import {
  WORLD_STORAGE_KEY,
  clearPersistedSession,
  loadPersistedSession,
  saveWorldSession,
} from '@/game/persistence/sessionStorage';
import { getScenarioDefinition } from '@/game/scenarios/catalog';
import { getScenarioGeneratorDefinition, listScenarioGenerators } from '@/game/scenarios/generatorCatalog';
import { runScenario } from '@/game/scenarios/runScenario';

describe('game mode values', () => {
  it('defaults to sandbox so existing worlds keep free building', () => {
    expect(DEFAULT_GAME_MODE).toBe(GameMode.Sandbox);
  });

  it('accepts only known modes', () => {
    expect(isGameMode('campaign')).toBe(true);
    expect(isGameMode('sandbox')).toBe(true);
    expect(isGameMode('Campaign')).toBe(false);
    expect(isGameMode(undefined)).toBe(false);
    expect(isGameMode(1)).toBe(false);
  });

  it('resolves unknown values to the default mode', () => {
    expect(resolveGameMode('campaign')).toBe(GameMode.Campaign);
    expect(resolveGameMode('hardcore')).toBe(DEFAULT_GAME_MODE);
    expect(resolveGameMode(null)).toBe(DEFAULT_GAME_MODE);
  });
});

describe('GameEngine game mode', () => {
  it('creates sandbox worlds by default', () => {
    expect(new GameEngine(640, 480).gameMode).toBe(GameMode.Sandbox);
  });

  it('creates campaign worlds on request', () => {
    expect(new GameEngine(640, 480, { gameMode: GameMode.Campaign }).gameMode).toBe(GameMode.Campaign);
  });

  it('keeps the mode through a snapshot round trip', () => {
    const engine = new GameEngine(640, 480, { gameMode: GameMode.Campaign });
    const world = engine.serializeWorld();

    expect(world.gameMode).toBe(GameMode.Campaign);
    expect(GameEngine.fromSnapshot(world, 640, 480).gameMode).toBe(GameMode.Campaign);
  });

  it('restores snapshots written before game modes existed as sandbox', () => {
    const legacy = { ...new GameEngine(640, 480, { gameMode: GameMode.Campaign }).serializeWorld() };
    delete (legacy as { gameMode?: unknown }).gameMode;

    expect(GameEngine.fromSnapshot(legacy, 640, 480).gameMode).toBe(GameMode.Sandbox);
  });
});

describe('game mode persistence', () => {
  beforeEach(() => {
    clearPersistedSession();
    window.localStorage.clear();
  });

  it('saves and reloads a campaign world', () => {
    saveWorldSession(new GameEngine(640, 480, { gameMode: GameMode.Campaign }), 'session-campaign');

    expect(loadPersistedSession(640, 480)?.engine.gameMode).toBe(GameMode.Campaign);
  });

  it('loads a saved world without mode as sandbox', () => {
    saveWorldSession(new GameEngine(640, 480, { gameMode: GameMode.Campaign }), 'session-legacy');
    const stored = JSON.parse(window.localStorage.getItem(WORLD_STORAGE_KEY)!) as Record<string, unknown>;
    delete stored.gameMode;
    window.localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify(stored));

    expect(loadPersistedSession(640, 480)?.engine.gameMode).toBe(GameMode.Sandbox);
  });

  it('rejects a saved world with an unknown mode', () => {
    saveWorldSession(new GameEngine(640, 480), 'session-invalid');
    const stored = JSON.parse(window.localStorage.getItem(WORLD_STORAGE_KEY)!) as Record<string, unknown>;
    stored.gameMode = 'hardcore';
    window.localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify(stored));

    expect(loadPersistedSession(640, 480)).toBeNull();
  });
});

describe('dev tools run in sandbox', () => {
  it('builds dev scenarios as sandbox worlds', () => {
    const result = runScenario(getScenarioDefinition('bootstrap-energy-grid'), 640, 480);

    expect(result.engine.gameMode).toBe(GameMode.Sandbox);
  });

  it.each(listScenarioGenerators().map((generator) => generator.id))(
    'builds the %s generator as a sandbox world',
    (id) => {
      const result = getScenarioGeneratorDefinition(id).generate(640, 480);

      expect(result.engine.gameMode).toBe(GameMode.Sandbox);
    },
  );

  it('runs bots in sandbox worlds only', () => {
    const onStatusChange = vi.fn();
    const sandbox = new BotController(new GameEngine(640, 480), onStatusChange, DEFAULT_BOT_PROFILE_ID);
    const campaign = new BotController(
      new GameEngine(640, 480, { gameMode: GameMode.Campaign }),
      onStatusChange,
      DEFAULT_BOT_PROFILE_ID,
    );

    expect(sandbox.isAvailable).toBe(true);
    expect(campaign.isAvailable).toBe(false);

    campaign.start();
    expect(onStatusChange).not.toHaveBeenCalled();

    sandbox.destroy();
    campaign.destroy();
  });
});
