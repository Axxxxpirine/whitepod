import { describe, expect, it } from 'vitest';
import { GRID_HEIGHT, GRID_WIDTH, MAP_CENTER, TILE_SIZE } from '@/game/constants';
import { getAllBuildingTypes } from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine, type ResourceStock } from '@/game/engine/GameEngine';
import { ResourceType, TileType, type BuildingId, type Direction } from '@/game/types';
import { mulberry32 } from '@/game/data/SeededRNG';
import { comparableSnapshot, findInvariantViolations } from './invariants';

/**
 * Playtests by player type: each plays the real engine the way that kind of
 * player would, and checks what that player would notice going wrong.
 */

const NOON = 0.5;

function flatSandbox(): GameEngine {
  const engine = new GameEngine(1280, 720, { gameMode: GameMode.Sandbox });
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.setSimulationTime(NOON);
  return engine;
}

function place(engine: GameEngine, typeId: string, x: number, y: number, rotation: Direction = 0): BuildingId {
  const id = engine.placeBuilding(typeId, { x, y }, rotation, { emitSfx: false });
  if (id === null) throw new Error(`${typeId} refused at ${x},${y}: ${JSON.stringify(engine.canPlaceBuilding(typeId, { x, y }))}`);
  return id;
}

function belt(engine: GameEngine, from: [BuildingId, string], to: [BuildingId, string]): readonly BuildingId[] {
  const result = engine.placeBelt({ building: from[0], port: from[1] }, { building: to[0], port: to[1] });
  if (!result.ok) throw new Error(`belt ${from[1]} -> ${to[1]} refused: ${result.reason}`);
  return result.segmentIds;
}

function extractorOn(engine: GameEngine, resource: ResourceType, x: number, y: number, typeId = 'extractor_basic'): BuildingId {
  engine.placeResource(x, y, resource);
  return place(engine, typeId, x, y);
}

/** A row of linked solar panels feeding `consumers`. */
function power(engine: GameEngine, consumers: readonly BuildingId[], panels: number, x: number, y: number): void {
  const first = place(engine, 'solar_panel', x, y);
  for (let index = 1; index < panels; index++) engine.connectBuildings(first, place(engine, 'solar_panel', x + index, y));
  for (const id of consumers) engine.connectBuildings(first, id);
}

/** Plays `minutes` at noon and returns what the stock gained per minute. */
function measuredPerMinute(engine: GameEngine, minutes: number): ResourceStock {
  const before = engine.getResourceCounts();
  for (let second = 0; second < minutes * 60; second++) {
    engine.setSimulationTime(NOON);
    engine.update(1, { emitSfx: false });
  }
  const after = engine.getResourceCounts();
  const gained = { ...after };
  for (const key of Object.keys(after) as (keyof ResourceStock)[]) gained[key] = (after[key] - before[key]) / minutes;
  return gained;
}

/** The rates the HUD shows, after a warm-up, must be what the stock then gains. */
function expectShownRatesToBeReal(engine: GameEngine): ResourceStock {
  for (let second = 0; second < 30; second++) {
    engine.setSimulationTime(NOON);
    engine.update(1, { emitSfx: false });
  }
  const shown = engine.getResourceRates();
  const real = measuredPerMinute(engine, 4);
  for (const key of Object.keys(shown) as (keyof ResourceStock)[]) {
    expect(real[key], `${key}: HUD shows ${shown[key]}/min`).toBeCloseTo(shown[key], 0);
  }
  return shown;
}

describe('the tinkerer, who rebuilds the same line all evening', () => {
  it('can still build after placing and removing more buildings than there are ids', () => {
    const engine = flatSandbox();
    const extractor = extractorOn(engine, ResourceType.Regolith, 20, 20);
    const storage = place(engine, 'storage_basic', 30, 19);

    // 9 belt segments and 10 connections each time: 65,535 ids are gone after ~7,000 rounds.
    for (let round = 0; round < 8000; round++) {
      const segments = belt(engine, [extractor, 'out_east'], [storage, 'in_west']);
      expect(engine.removeBelt(segments[0]!)).toBe(true);
    }

    expect(engine.canPlaceBuilding('solar_panel', { x: 5, y: 5 })).toEqual({ ok: true });
    const segments = belt(engine, [extractor, 'out_east'], [storage, 'in_west']);
    power(engine, [extractor], 1, 20, 24);
    for (let second = 0; second < 20; second++) engine.update(1, { emitSfx: false });
    expect(engine.getResourceCounts().regolith).toBeGreaterThan(0);
    expect(new Set(segments).size).toBe(segments.length);
    expect(findInvariantViolations(engine)).toEqual([]);

    // The save of such a world reloads and keeps building.
    const reloaded = GameEngine.fromSnapshot(structuredClone(engine.serializeWorld()), 1280, 720);
    expect(reloaded.placeBuilding('solar_panel', { x: 5, y: 5 }, 0, { emitSfx: false })).not.toBeNull();
    expect(findInvariantViolations(reloaded)).toEqual([]);
  });
});

describe('the accountant, who checks the numbers on screen', () => {
  it('one extractor to a storage', () => {
    const engine = flatSandbox();
    const extractor = extractorOn(engine, ResourceType.Regolith, 20, 20);
    belt(engine, [extractor, 'out_east'], [place(engine, 'storage_basic', 28, 19), 'in_west']);
    power(engine, [extractor], 1, 20, 24);

    expect(expectShownRatesToBeReal(engine).regolith).toBe(30);
  });

  it('three extractors merged onto one belt are capped by the belt', () => {
    const engine = flatSandbox();
    const extractors = [18, 20, 22].map((y) => extractorOn(engine, ResourceType.Regolith, 20, y));
    const merger = place(engine, 'merger_basic', 24, 20);
    belt(engine, [extractors[0]!, 'out_east'], [merger, 'in_north']);
    belt(engine, [extractors[1]!, 'out_east'], [merger, 'in_west']);
    belt(engine, [extractors[2]!, 'out_east'], [merger, 'in_south']);
    belt(engine, [merger, 'out_east'], [place(engine, 'storage_basic', 30, 19), 'in_west']);
    power(engine, extractors, 3, 20, 26);

    expect(expectShownRatesToBeReal(engine).regolith).toBe(60);
  });

  it('a splitter shares one line between two storages', () => {
    const engine = flatSandbox();
    const extractor = extractorOn(engine, ResourceType.Regolith, 20, 20);
    const splitter = place(engine, 'splitter_basic', 24, 20);
    belt(engine, [extractor, 'out_east'], [splitter, 'in_west']);
    belt(engine, [splitter, 'out_north'], [place(engine, 'storage_basic', 30, 15), 'in_west']);
    belt(engine, [splitter, 'out_south'], [place(engine, 'storage_basic', 30, 23), 'in_west']);
    power(engine, [extractor], 1, 20, 28);

    expect(expectShownRatesToBeReal(engine).regolith).toBe(30);
  });

  it('a converter and a two-input synthesizer count by what they deliver', () => {
    const engine = flatSandbox();
    const regolith = extractorOn(engine, ResourceType.Regolith, 20, 10);
    const converter = place(engine, 'converter_basic', 24, 9);
    belt(engine, [regolith, 'out_east'], [converter, 'in']);
    belt(engine, [converter, 'out'], [place(engine, 'storage_basic', 32, 9), 'in_west']);
    engine.setProcessorRecipe(converter, 'iron_oxide');

    const hydrogen = [18, 19].map((y) => extractorOn(engine, ResourceType.Hydrogen, 20, y));
    const oxygen = extractorOn(engine, ResourceType.Oxygen, 20, 23);
    const merger = place(engine, 'merger_basic', 23, 19);
    const synthesizer = place(engine, 'synthesizer_basic', 28, 18);
    belt(engine, [hydrogen[0]!, 'out_east'], [merger, 'in_north']);
    belt(engine, [hydrogen[1]!, 'out_east'], [merger, 'in_west']);
    belt(engine, [merger, 'out_east'], [synthesizer, 'in_1']);
    belt(engine, [oxygen, 'out_east'], [synthesizer, 'in_2']);
    belt(engine, [synthesizer, 'out'], [place(engine, 'storage_basic', 36, 19), 'in_west']);
    engine.setProcessorRecipe(synthesizer, 'water');
    power(engine, [regolith, converter, ...hydrogen, oxygen, synthesizer], 5, 20, 28);

    const shown = expectShownRatesToBeReal(engine);
    expect(shown.ironOxide).toBe(30);
    expect(shown.water).toBe(15);
  });

  it('a powered converter whose extractor has no power shows no production', () => {
    const engine = flatSandbox();
    const extractor = extractorOn(engine, ResourceType.Regolith, 20, 20);
    const converter = place(engine, 'converter_basic', 24, 19);
    const segments = belt(engine, [extractor, 'out_east'], [converter, 'in']);
    const output = belt(engine, [converter, 'out'], [place(engine, 'storage_basic', 32, 19), 'in_west']);
    engine.setProcessorRecipe(converter, 'iron_oxide');
    power(engine, [converter], 1, 20, 24);

    expect(expectShownRatesToBeReal(engine).ironOxide).toBe(0);
    // Same answer on the belts and for the machine itself: nothing moves.
    expect(engine.getProducerRatePerMinute(converter)).toBe(0);
    expect(segments.length + output.length).toBeGreaterThan(0);
  });

  it('a converter on an exhausted deposit shows no production (campaign)', () => {
    const engine = new GameEngine(1280, 720, { gameMode: GameMode.Campaign });
    engine.generateMap(42);
    const hubId = engine.getHubId()!;
    const hub = engine.getBuildings().get(hubId)!;
    const inventory = engine.storageInventories.get(hubId)!;
    inventory.regolith += 500;
    inventory.oxygen += 500;
    while (!engine.isBuildingUnlocked('converter_basic')) expect(engine.completeActiveMilestone()).toBe(true);
    inventory.regolith += 500;

    const spot = { x: hub.origin.x - 12, y: hub.origin.y + 2 };
    engine.grid.setResource(spot.x, spot.y, ResourceType.Regolith, 5);
    const extractor = place(engine, 'extractor_basic', spot.x, spot.y);
    const converter = place(engine, 'converter_basic', spot.x + 3, spot.y - 1);
    belt(engine, [extractor, 'out_east'], [converter, 'in']);
    belt(engine, [converter, 'out'], [hubId, 'in_west_1']);
    engine.setProcessorRecipe(converter, 'iron_oxide');
    power(engine, [extractor, converter], 2, spot.x, spot.y + 3);

    for (let second = 0; second < 60; second++) {
      engine.setSimulationTime(NOON);
      engine.update(1, { emitSfx: false });
    }
    expect(engine.getDepositRemaining(extractor)).toBe(0);
    expect(engine.getHubInventory()!.ironOxide).toBe(5);
    expect(engine.getResourceRates().ironOxide).toBe(0);
  });
});

describe('the explorer, who goes to the edges', () => {
  it('builds every building in each corner of the map without breaking the world', () => {
    const engine = flatSandbox();
    const corners = [
      { x: 0, y: 0 },
      { x: GRID_WIDTH - 1, y: 0 },
      { x: 0, y: GRID_HEIGHT - 1 },
      { x: GRID_WIDTH - 1, y: GRID_HEIGHT - 1 },
    ];
    for (const corner of corners) {
      engine.placeResource(corner.x, corner.y, ResourceType.Regolith);
      for (const type of getAllBuildingTypes()) {
        for (const rotation of [0, 1, 2, 3] as const) {
          // Flush in the corner, and hanging over the edge.
          for (const origin of [corner, { x: corner.x - type.footprint.w + 1, y: corner.y - type.footprint.h + 1 }, { x: corner.x - 1, y: corner.y + 1 }]) {
            const id = engine.placeBuilding(type.id, origin, rotation, { emitSfx: false });
            if (id !== null) expect(engine.removeBuilding(id, { emitSfx: false })).toBe(!type.permanent);
          }
        }
      }
    }
    expect(engine.canPlaceBuilding('solar_panel', { x: -1, y: 0 })).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect(engine.canPlaceBuilding('storage_basic', { x: GRID_WIDTH - 2, y: 10 })).toEqual({ ok: false, reason: 'out_of_bounds' });
    expect(findInvariantViolations(engine)).toEqual([]);
  });

  it('runs a belt along the edge of the map and delivers through it', () => {
    const engine = flatSandbox();
    const extractor = extractorOn(engine, ResourceType.Oxygen, 0, 0);
    const storage = place(engine, 'storage_basic', GRID_WIDTH - 3, 0);
    const segments = belt(engine, [extractor, 'out_east'], [storage, 'in_west']);
    power(engine, [extractor], 1, 0, 3);

    expect(segments.length).toBeGreaterThanOrEqual(GRID_WIDTH - 4);
    for (let second = 0; second < 10; second++) engine.update(1, { emitSfx: false });
    expect(engine.getStorageInventory(storage)!.oxygen).toBeGreaterThan(0);
  });

  it('keeps the camera on the map whatever is zoomed or panned', () => {
    const engine = flatSandbox();
    const { viewport } = engine;
    const random = mulberry32(7);
    for (let step = 0; step < 2000; step++) {
      if (random() < 0.5) viewport.pan((random() - 0.5) * 4000, (random() - 0.5) * 4000);
      else viewport.zoomAt(random() < 0.5 ? 0 : viewport.screenWidth, random() < 0.5 ? 0 : viewport.screenHeight, random() < 0.5 ? 1.1 : 0.9);
      expect(viewport.centerX).toBeGreaterThanOrEqual(0);
      expect(viewport.centerX).toBeLessThanOrEqual(GRID_WIDTH * TILE_SIZE);
      expect(viewport.centerY).toBeGreaterThanOrEqual(0);
      expect(viewport.centerY).toBeLessThanOrEqual(GRID_HEIGHT * TILE_SIZE);
      expect(viewport.zoom).toBeGreaterThanOrEqual(0.25);
      expect(viewport.zoom).toBeLessThanOrEqual(4);
      const visible = engine.getVisibleTiles();
      expect(visible.x0).toBeLessThanOrEqual(visible.x1);
      expect(visible.y0).toBeLessThanOrEqual(visible.y1);
    }
  });
});

describe('the beginner, who tries things in the wrong order', () => {
  it('is always told why a placement is refused', () => {
    const engine = new GameEngine(1280, 720, { gameMode: GameMode.Campaign });
    engine.generateMap(42);
    const hub = engine.getBuildings().get(engine.getHubId()!)!;

    expect(engine.canPlaceBuilding('solar_panel', { x: 2, y: 2 })).toEqual({ ok: false, reason: 'tile_fogged' });
    expect(engine.canPlaceBuilding('solar_panel', hub.origin)).toEqual({ ok: false, reason: 'tile_occupied' });
    expect(engine.canPlaceBuilding('battery_basic', { x: hub.origin.x - 4, y: hub.origin.y })).toEqual({ ok: false, reason: 'locked' });
    expect(engine.canPlaceBuilding('extractor_basic', { x: hub.origin.x - 2, y: hub.origin.y })).toEqual({ ok: false, reason: 'resource_required' });
    expect(engine.canPlaceBuilding('hub_lander', { x: hub.origin.x - 8, y: hub.origin.y })).toEqual({ ok: false, reason: 'system_placed' });
    expect(engine.removeBuilding(hub.id)).toBe(false);
    expect(engine.completeActiveMilestone()).toBe(false);
  });

  it('gets everything back after spending the whole starting kit on the wrong things', () => {
    const engine = new GameEngine(1280, 720, { gameMode: GameMode.Campaign });
    engine.generateMap(42);
    const hub = engine.getBuildings().get(engine.getHubId()!)!;
    const kit = engine.getResourceCounts().regolith;

    // Panels and storages everywhere, until nothing is affordable: not even an extractor.
    const built: BuildingId[] = [];
    for (let index = 0; engine.canAfford(engine.getBuildingCost('solar_panel')); index++) {
      const id = engine.placeBuilding('solar_panel', { x: hub.origin.x - 3 - (index % 6), y: hub.origin.y + 7 + Math.floor(index / 6) }, 0, { emitSfx: false });
      if (id !== null) built.push(id);
      if (index > 200) break;
    }
    expect(engine.canAfford(engine.getBuildingCost('extractor_basic'))).toBe(false);
    expect(built.length).toBeGreaterThan(0);

    // Removing refunds in full: no soft lock.
    for (const id of built) expect(engine.removeBuilding(id, { emitSfx: false })).toBe(true);
    expect(engine.getResourceCounts().regolith).toBe(kit);
    expect(engine.canAfford(engine.getBuildingCost('extractor_basic'))).toBe(true);
  });
});

describe('the absent player and the one in fast-forward', () => {
  it('ends in the same world whatever the frame rate or the speed', () => {
    const build = () => {
      const engine = flatSandbox();
      const extractors = [18, 20, 22].map((y) => extractorOn(engine, ResourceType.Regolith, 20, y));
      const merger = place(engine, 'merger_basic', 24, 20);
      const converter = place(engine, 'converter_basic', 28, 19);
      const storage = place(engine, 'storage_basic', 36, 19);
      const battery = place(engine, 'battery_basic', 20, 30);
      belt(engine, [extractors[0]!, 'out_east'], [merger, 'in_north']);
      belt(engine, [extractors[1]!, 'out_east'], [merger, 'in_west']);
      belt(engine, [extractors[2]!, 'out_east'], [merger, 'in_south']);
      belt(engine, [merger, 'out_east'], [converter, 'in']);
      belt(engine, [converter, 'out'], [storage, 'in_west']);
      engine.setProcessorRecipe(converter, 'carbon');
      power(engine, [...extractors, converter, battery], 4, 20, 26);
      return engine;
    };

    const seconds = 2 * 240; // two full day-night cycles
    const steady = build();
    for (let tick = 0; tick < seconds * 10; tick++) steady.update(0.1, { emitSfx: false });

    const oneJump = build();
    oneJump.update(seconds, { emitSfx: false });

    const fastForward = build();
    for (let frame = 0; frame < seconds * 3; frame++) fastForward.update(20 / 60, { emitSfx: false });

    const jittery = build();
    const random = mulberry32(99);
    let elapsed = 0;
    while (elapsed < seconds - 1) {
      const dt = 0.004 + random() * 0.05;
      jittery.update(dt, { emitSfx: false });
      elapsed += dt;
    }
    jittery.update(seconds - elapsed, { emitSfx: false });

    const expected = steady.getResourceCounts();
    expect(expected.carbon).toBeGreaterThan(0);
    expect(oneJump.getResourceCounts()).toEqual(expected);
    expect(fastForward.getResourceCounts()).toEqual(expected);
    expect(jittery.getResourceCounts()).toEqual(expected);
    expect(JSON.stringify(comparableSnapshot(oneJump))).toBe(JSON.stringify(comparableSnapshot(steady)));
  });

  it('centres the first view on the map', () => {
    const engine = flatSandbox();
    expect(engine.screenToTile(640, 360)).toEqual(MAP_CENTER);
  });
});
