import { beforeEach, describe, expect, it } from 'vitest';
import { BATTERY_BASIC_BUILDING_TYPE_ID, CONVERTER_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import type { GameEngine } from '@/game/engine/GameEngine';
import { applyIdleCatchup } from '@/game/idle/IdleCatchup';
import {
  WORLD_STORAGE_KEY,
  clearPersistedSession,
  loadPersistedSession,
  saveWorldSession,
} from '@/game/persistence/sessionStorage';
import { ResourceType } from '@/game/types';
import { ScriptedCampaignPlayer } from '../balance/scriptedCampaignPlayer';

/**
 * A campaign in progress saved to localStorage and loaded back, as on a page
 * reload: the restored world must be the same world and keep behaving like it,
 * live and through the offline catch-up.
 */

/** A campaign a minute in: first milestone done, oxygen and regolith lines running, a battery bought. */
function campaignInProgress(): GameEngine {
  const player = new ScriptedCampaignPlayer(42);
  player.deliveryLine(ResourceType.Oxygen);
  player.deliveryLine(ResourceType.Oxygen);
  player.waitForMilestone('landing_first_extraction');
  player.deliveryLine(ResourceType.Regolith);
  player.advance(20);
  return player.engine;
}

function reload(engine: GameEngine): GameEngine {
  saveWorldSession(engine, 'session-campaign-save');
  const loaded = loadPersistedSession(1280, 720);
  expect(loaded).not.toBeNull();
  return loaded!.engine;
}

function simulate(engine: GameEngine, seconds: number, step = 0.25): void {
  for (let t = 0; t < seconds; t += step) engine.update(step);
}

describe('campaign save', () => {
  beforeEach(() => {
    clearPersistedSession();
    window.localStorage.clear();
  });

  it('restores a campaign in progress identically: mode, hub, stock, milestones, unlocks, time', () => {
    const engine = campaignInProgress();
    expect(engine.getCompletedMilestoneIds()).toEqual(['landing_first_extraction']);

    const restored = reload(engine);

    expect(restored.serializeWorld()).toEqual(engine.serializeWorld());
    expect(restored.gameMode).toBe(GameMode.Campaign);
    expect(restored.getHubId()).toBe(engine.getHubId());
    expect(restored.getHubInventory()).toEqual(engine.getHubInventory());
    expect(restored.getMilestoneProgress()).toEqual(engine.getMilestoneProgress());
    expect(restored.isBuildingUnlocked(BATTERY_BASIC_BUILDING_TYPE_ID)).toBe(true);
    expect(restored.isBuildingUnlocked(CONVERTER_BUILDING_TYPE_ID)).toBe(false);
  });

  it('keeps running exactly like the world it was saved from', () => {
    const engine = campaignInProgress();
    const restored = reload(engine);

    simulate(engine, 90);
    simulate(restored, 90);

    expect(restored.serializeWorld()).toEqual(engine.serializeWorld());
  });

  it('does not credit the starting kit again on load', () => {
    const engine = campaignInProgress();
    const regolith = engine.getHubInventory()!.regolith;

    const restored = reload(engine);
    restored.generateMap(restored.mapSeed);

    expect(restored.getHubInventory()!.regolith).toBe(regolith);
  });

  it('delivers to the hub during the offline catch-up, and leaves completing milestones to the player', () => {
    const engine = campaignInProgress();
    const restored = reload(engine);
    const before = restored.getHubInventory()!.oxygen;

    const summary = applyIdleCatchup(restored, 10 * 60 * 1000);
    // The catch-up replays one-second steps: the same steps live give the same world.
    simulate(engine, 10 * 60, 1);

    expect(restored.getHubInventory()!.oxygen).toBeGreaterThan(before);
    expect(summary.resourceDelta.oxygen).toBe(restored.getHubInventory()!.oxygen - before);
    expect(restored.getCompletedMilestoneIds()).toEqual(['landing_first_extraction']);
    expect(restored.getHubInventory()).toEqual(engine.getHubInventory());
  });

  it('loads a save written before campaigns existed (no mode, no milestones) as sandbox', () => {
    saveWorldSession(campaignInProgress(), 'session-before-campaigns');
    const stored = JSON.parse(window.localStorage.getItem(WORLD_STORAGE_KEY)!) as Record<string, unknown>;
    delete stored.gameMode;
    delete stored.completedMilestones;
    window.localStorage.setItem(WORLD_STORAGE_KEY, JSON.stringify(stored));

    const loaded = loadPersistedSession(1280, 720)!.engine;

    expect(loaded.gameMode).toBe(GameMode.Sandbox);
    expect(loaded.getCompletedMilestoneIds()).toEqual([]);
    expect(loaded.getActiveMilestone()).toBeNull();
    expect(loaded.chargesConstruction).toBe(false);
  });
});
