import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import {
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { ResourceType, TileType } from '@/game/types';

function makeEngine() {
  const engine = new GameEngine(800, 600, { dayNightCycleSeconds: 1e9 });
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.setSimulationTime(0.5);
  return engine;
}

function simulate(engine: GameEngine, totalSeconds: number, step = 0.1) {
  let elapsed = 0;
  while (elapsed < totalSeconds) {
    const dt = Math.min(step, totalSeconds - elapsed);
    engine.update(dt);
    elapsed += dt;
  }
}

function placePoweredSolar(engine: GameEngine, x: number, y: number) {
  return engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x, y })!;
}

function powerBuilding(engine: GameEngine, buildingId: number, solarCount = 2, anchorX = 1, anchorY = 1) {
  const solarIds: number[] = [];
  for (let index = 0; index < solarCount; index += 1) {
    solarIds.push(placePoweredSolar(engine, anchorX + index, anchorY));
  }
  for (const solarId of solarIds) {
    engine.connectBuildings(solarId, buildingId);
  }
}

function placeExtractor(engine: GameEngine, x: number, y: number, resourceType: ResourceType) {
  engine.placeResource(x, y, resourceType);
  return engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x, y })!;
}

function placeStorage(engine: GameEngine, x: number, y: number) {
  return engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x, y })!;
}

function placeConverter(engine: GameEngine, x: number, y: number, recipeId?: string) {
  const id = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x, y })!;
  powerBuilding(engine, id, 1, x, y - 3);
  if (recipeId) engine.setProcessorRecipe(id, recipeId);
  return id;
}

function placeSynth(engine: GameEngine, x: number, y: number, recipeId?: string) {
  const id = engine.placeBuilding(SYNTHESIZER_BUILDING_TYPE_ID, { x, y })!;
  powerBuilding(engine, id, 2, x, y - 3);
  if (recipeId) engine.setProcessorRecipe(id, recipeId);
  return id;
}

function placeMerger(engine: GameEngine, x: number, y: number) {
  return engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x, y })!;
}

function belt(engine: GameEngine, from: { building: number; port: string }, to: { building: number; port: string }) {
  const result = engine.placeBelt(from, to);
  expect(result.ok).toBe(true);
}

describe('connected processor logistics', () => {
  it('starts storage inventories empty', () => {
    const engine = makeEngine();
    const storage = placeStorage(engine, 6, 6);

    expect(engine.getStorageInventory(storage)).toEqual({
      regolith: 0,
      hydrogen: 0,
      oxygen: 0,
      ironOxide: 0,
      aluminumOxide: 0,
      siliconDioxide: 0,
      nitrogenGas: 0,
      water: 0,
      methane: 0,
      carbonDioxide: 0,
      ammonia: 0,
      ceramicPlates: 0,
    });
  });

  it('flushes extractor output into connected storage and aggregates world counts from storages', () => {
    const engine = makeEngine();
    const extractor = placeExtractor(engine, 2, 4, ResourceType.Regolith);
    powerBuilding(engine, extractor, 1, 2, 1);
    const storage = placeStorage(engine, 6, 3);

    belt(engine, { building: extractor, port: 'out_east' }, { building: storage, port: 'in_west' });
    simulate(engine, 6.1);

    expect(engine.getStorageInventory(storage)?.regolith).toBeGreaterThanOrEqual(3);
    expect(engine.getResourceCounts().regolith).toBe(engine.getStorageInventory(storage)?.regolith ?? 0);
    expect(engine.getProducerOutputBuffer(extractor)).toBeNull();
  });

  it('keeps extractor output buffered when no downstream sink exists', () => {
    const engine = makeEngine();
    const extractor = placeExtractor(engine, 3, 4, ResourceType.Hydrogen);
    powerBuilding(engine, extractor, 1, 3, 1);

    simulate(engine, 8.1);

    expect(engine.getProducerOutputBuffer(extractor)).toEqual({
      resourceType: ResourceType.Hydrogen,
      amount: 1,
    });
    expect(engine.getResourceCounts().hydrogen).toBe(0);
  });

  it('delivers the unit held while unbelted once a belt reaches a storage, then keeps extracting', () => {
    const engine = makeEngine();
    const extractor = placeExtractor(engine, 3, 30, ResourceType.Oxygen);
    powerBuilding(engine, extractor, 1, 3, 27);
    simulate(engine, 4.1);
    expect(engine.getProducerOutputBuffer(extractor)).not.toBeNull();

    const storage = placeStorage(engine, 7, 29);
    belt(engine, { building: extractor, port: 'out_east' }, { building: storage, port: 'in_west' });
    simulate(engine, 6.1);

    expect(engine.getStorageInventory(storage)?.oxygen).toBeGreaterThanOrEqual(3);
  });

  it('delivers a processor output finished while its output belt was removed, once rebuilt', () => {
    const engine = makeEngine();
    const extractor = placeExtractor(engine, 2, 80, ResourceType.Regolith);
    powerBuilding(engine, extractor, 1, 2, 77);
    const converter = placeConverter(engine, 8, 79, 'iron_oxide');
    belt(engine, { building: extractor, port: 'out_east' }, { building: converter, port: 'in' });
    const storage = placeStorage(engine, 14, 79);
    const output = engine.placeBelt({ building: converter, port: 'out' }, { building: storage, port: 'in_west' });
    expect(output.ok).toBe(true);

    // Remove the output belt mid-cycle: the cycle finishes into the converter's buffer.
    simulate(engine, 3);
    expect(engine.getProcessorState(converter)?.cycleProgress).toBeGreaterThan(0);
    engine.removeBelt(output.ok ? output.segmentIds[0]! : 0);
    simulate(engine, 2);
    expect(engine.getProducerOutputBuffer(converter)).not.toBeNull();
    const delivered = engine.getStorageInventory(storage)!.ironOxide;

    belt(engine, { building: converter, port: 'out' }, { building: storage, port: 'in_west' });
    simulate(engine, 6.1);

    expect(engine.getProducerOutputBuffer(converter)).toBeNull();
    expect(engine.getStorageInventory(storage)!.ironOxide).toBeGreaterThanOrEqual(delivered + 2);
  });

  it('holds extractor output for a downstream processor until the processor can pull it', () => {
    const engine = makeEngine();
    const extractor = placeExtractor(engine, 2, 10, ResourceType.Regolith);
    powerBuilding(engine, extractor, 1, 2, 7);
    const converter = placeConverter(engine, 8, 9);

    belt(engine, { building: extractor, port: 'out_east' }, { building: converter, port: 'in' });
    simulate(engine, 4.1);

    expect(engine.getProducerOutputBuffer(extractor)).toEqual({
      resourceType: ResourceType.Regolith,
      amount: 1,
    });
    expect(engine.getResourceCounts().regolith).toBe(0);
  });

  it('converts when a valid connected input and output storage exist', () => {
    const engine = makeEngine();
    const extractor = placeExtractor(engine, 2, 16, ResourceType.Regolith);
    powerBuilding(engine, extractor, 1, 2, 13);
    const converter = placeConverter(engine, 8, 15, 'iron_oxide');
    const storage = placeStorage(engine, 14, 14);

    belt(engine, { building: extractor, port: 'out_east' }, { building: converter, port: 'in' });
    belt(engine, { building: converter, port: 'out' }, { building: storage, port: 'in_west' });
    simulate(engine, 6.5);

    expect(engine.getStorageInventory(storage)?.ironOxide).toBeGreaterThan(0);
    expect(engine.getProcessorLogisticsStatus(converter)).toMatchObject({
      badInput: false,
      missingInput: false,
      blockedOutput: false,
    });
  });

  it('reports bad input on a converter connected to the wrong resource', () => {
    const engine = makeEngine();
    const extractor = placeExtractor(engine, 2, 22, ResourceType.Oxygen);
    powerBuilding(engine, extractor, 1, 2, 19);
    const converter = placeConverter(engine, 8, 21, 'iron_oxide');
    const storage = placeStorage(engine, 14, 20);

    belt(engine, { building: extractor, port: 'out_east' }, { building: converter, port: 'in' });
    belt(engine, { building: converter, port: 'out' }, { building: storage, port: 'in_west' });

    expect(engine.getProcessorLogisticsStatus(converter)).toMatchObject({
      badInput: true,
      missingInput: true,
      blockedOutput: false,
    });
    simulate(engine, 6.1);
    expect(engine.getStorageInventory(storage)?.ironOxide).toBe(0);
  });

  it('requires enough upstream providers for multi-amount converter recipes', () => {
    const engine = makeEngine();
    const extractor = placeExtractor(engine, 2, 28, ResourceType.Regolith);
    powerBuilding(engine, extractor, 1, 2, 25);
    const converter = placeConverter(engine, 8, 27, 'aluminum_oxide');
    const storage = placeStorage(engine, 14, 26);

    belt(engine, { building: extractor, port: 'out_east' }, { building: converter, port: 'in' });
    belt(engine, { building: converter, port: 'out' }, { building: storage, port: 'in_west' });

    expect(engine.getProcessorLogisticsStatus(converter)?.missingInput).toBe(true);
    simulate(engine, 10.1);
    expect(engine.getStorageInventory(storage)?.aluminumOxide).toBe(0);
  });

  it('supports merged same-resource inputs for a synthesizer', () => {
    const engine = makeEngine();
    const hydrogenA = placeExtractor(engine, 2, 36, ResourceType.Hydrogen);
    const hydrogenB = placeExtractor(engine, 2, 40, ResourceType.Hydrogen);
    const oxygen = placeExtractor(engine, 2, 44, ResourceType.Oxygen);
    powerBuilding(engine, hydrogenA, 1, 2, 33);
    powerBuilding(engine, hydrogenB, 1, 3, 33);
    powerBuilding(engine, oxygen, 1, 4, 33);

    const hydrogenMerger = placeMerger(engine, 8, 39);
    const synth = placeSynth(engine, 14, 38, 'water');
    const storage = placeStorage(engine, 22, 39);

    belt(engine, { building: hydrogenA, port: 'out_east' }, { building: hydrogenMerger, port: 'in_north' });
    belt(engine, { building: hydrogenB, port: 'out_east' }, { building: hydrogenMerger, port: 'in_south' });
    belt(engine, { building: hydrogenMerger, port: 'out_east' }, { building: synth, port: 'in_1' });
    belt(engine, { building: oxygen, port: 'out_east' }, { building: synth, port: 'in_2' });
    belt(engine, { building: synth, port: 'out' }, { building: storage, port: 'in_west' });

    simulate(engine, 8.5);

    expect(engine.getProcessorLogisticsStatus(synth)).toMatchObject({
      badInput: false,
      missingInput: false,
      blockedOutput: false,
    });
    expect(engine.getStorageInventory(storage)?.water).toBeGreaterThan(0);
  });

  it('keeps every input buffered until a complete batch can be reserved', () => {
    const engine = makeEngine();
    const hydrogen = placeExtractor(engine, 2, 36, ResourceType.Hydrogen);
    const oxygen = placeExtractor(engine, 2, 44, ResourceType.Oxygen);
    powerBuilding(engine, hydrogen, 1, 2, 33);
    const synth = placeSynth(engine, 14, 38, 'carbon_dioxide');
    const storage = placeStorage(engine, 22, 39);
    belt(engine, { building: hydrogen, port: 'out_east' }, { building: synth, port: 'in_1' });
    belt(engine, { building: oxygen, port: 'out_east' }, { building: synth, port: 'in_2' });
    belt(engine, { building: synth, port: 'out' }, { building: storage, port: 'in_west' });

    simulate(engine, 3);
    expect(engine.getProducerOutputBuffer(hydrogen)).toEqual({ resourceType: ResourceType.Hydrogen, amount: 1 });
    expect(engine.processorReservations.has(synth)).toBe(false);
    powerBuilding(engine, oxygen, 1, 4, 33);
    simulate(engine, 7);
    expect(engine.getStorageInventory(storage)?.carbonDioxide).toBeGreaterThan(0);
  });

  it('accepts a recipe change after the last unit is delivered and input is disconnected', () => {
    const engine = makeEngine();
    const extractor = placeExtractor(engine, 2, 16, ResourceType.Regolith);
    powerBuilding(engine, extractor, 1, 2, 13);
    const converter = placeConverter(engine, 8, 15, 'iron_oxide');
    const storage = placeStorage(engine, 14, 14);
    const input = engine.placeBelt({ building: extractor, port: 'out_east' }, { building: converter, port: 'in' });
    expect(input.ok).toBe(true);
    belt(engine, { building: converter, port: 'out' }, { building: storage, port: 'in_west' });
    simulate(engine, 2.21, 0.13);
    engine.removeBelt(input.ok ? input.segmentIds[0]! : 0);
    simulate(engine, 5.2, 0.13);

    expect(engine.getStorageInventory(storage)?.ironOxide).toBe(1);
    expect(engine.setProcessorRecipe(converter, 'aluminum_oxide')).toBe(true);
  });

  it('flags mixed per-port input on a synthesizer as bad input', () => {
    const engine = makeEngine();
    const hydrogen = placeExtractor(engine, 2, 52, ResourceType.Hydrogen);
    const oxygenA = placeExtractor(engine, 2, 56, ResourceType.Oxygen);
    const oxygenB = placeExtractor(engine, 2, 60, ResourceType.Oxygen);
    powerBuilding(engine, hydrogen, 1, 2, 49);
    powerBuilding(engine, oxygenA, 1, 3, 49);
    powerBuilding(engine, oxygenB, 1, 4, 49);

    const mixedMerger = placeMerger(engine, 8, 55);
    const synth = placeSynth(engine, 14, 54, 'water');
    const storage = placeStorage(engine, 22, 55);

    belt(engine, { building: hydrogen, port: 'out_east' }, { building: mixedMerger, port: 'in_north' });
    belt(engine, { building: oxygenA, port: 'out_east' }, { building: mixedMerger, port: 'in_south' });
    belt(engine, { building: mixedMerger, port: 'out_east' }, { building: synth, port: 'in_1' });
    belt(engine, { building: oxygenB, port: 'out_east' }, { building: synth, port: 'in_2' });
    belt(engine, { building: synth, port: 'out' }, { building: storage, port: 'in_west' });

    expect(engine.getProcessorLogisticsStatus(synth)?.badInput).toBe(true);
    simulate(engine, 10.1);
    expect(engine.getStorageInventory(storage)?.water).toBe(0);
  });

  it('marks processors with no downstream sink as blocked output', () => {
    const engine = makeEngine();
    const extractor = placeExtractor(engine, 2, 68, ResourceType.Regolith);
    powerBuilding(engine, extractor, 1, 2, 65);
    const converter = placeConverter(engine, 8, 67, 'iron_oxide');

    belt(engine, { building: extractor, port: 'out_east' }, { building: converter, port: 'in' });

    expect(engine.getProcessorLogisticsStatus(converter)?.blockedOutput).toBe(true);
    simulate(engine, 8.1);
    expect(engine.getProducerOutputBuffer(converter)).toBeNull();
  });

  it('rejects recipe changes while a processor is mid-cycle', () => {
    const engine = makeEngine();
    const extractor = placeExtractor(engine, 2, 74, ResourceType.Regolith);
    powerBuilding(engine, extractor, 1, 2, 71);
    const converter = placeConverter(engine, 8, 73, 'iron_oxide');
    const storage = placeStorage(engine, 14, 72);

    belt(engine, { building: extractor, port: 'out_east' }, { building: converter, port: 'in' });
    belt(engine, { building: converter, port: 'out' }, { building: storage, port: 'in_west' });
    simulate(engine, 2.5);

    expect(engine.getProcessorState(converter)?.cycleProgress).toBeGreaterThan(0);
    expect(engine.setProcessorRecipe(converter, 'aluminum_oxide')).toBe(false);
  });

  it('supports processor-to-processor chains through producer output buffers', () => {
    const engine = makeEngine();
    const ironConverter = placeConverter(engine, 14, 81, 'iron_oxide');
    const aluminumConverter = placeConverter(engine, 14, 86, 'aluminum_oxide');
    const ceramic = placeSynth(engine, 22, 83, 'ceramic_plates');
    const storage = placeStorage(engine, 30, 84);

    belt(engine, { building: ironConverter, port: 'out' }, { building: ceramic, port: 'in_1' });
    belt(engine, { building: aluminumConverter, port: 'out' }, { building: ceramic, port: 'in_2' });
    belt(engine, { building: ceramic, port: 'out' }, { building: storage, port: 'in_west' });

    engine.producerOutputBuffers.set(ironConverter, {
      resourceType: ResourceType.IronOxide,
      amount: 1,
    });
    engine.producerOutputBuffers.set(aluminumConverter, {
      resourceType: ResourceType.AluminumOxide,
      amount: 1,
    });

    simulate(engine, 6.2);

    expect(engine.getStorageInventory(storage)?.ceramicPlates).toBeGreaterThan(0);
  });

  it('round-trips storage inventories, output buffers, and reservations through serialization', () => {
    const engine = makeEngine();
    const bufferedExtractor = placeExtractor(engine, 2, 96, ResourceType.Regolith);
    powerBuilding(engine, bufferedExtractor, 1, 2, 93);
    simulate(engine, 2.1);

    const feedingExtractor = placeExtractor(engine, 10, 96, ResourceType.Regolith);
    powerBuilding(engine, feedingExtractor, 1, 10, 93);
    const converter = placeConverter(engine, 16, 95, 'iron_oxide');
    const storage = placeStorage(engine, 22, 94);
    belt(engine, { building: feedingExtractor, port: 'out_east' }, { building: converter, port: 'in' });
    belt(engine, { building: converter, port: 'out' }, { building: storage, port: 'in_west' });
    simulate(engine, 2.5);

    const snapshot = engine.serializeWorld();
    const restored = GameEngine.fromSnapshot(snapshot, 800, 600);

    expect(restored.getProducerOutputBuffer(bufferedExtractor)).toEqual({
      resourceType: ResourceType.Regolith,
      amount: 1,
    });
    expect(restored.getProcessorState(converter)?.cycleProgress).toBeGreaterThan(0);
    expect((restored.processorReservations.get(converter)?.length ?? 0) > 0).toBe(true);
  });
});
