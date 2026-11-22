import { describe, expect, it } from 'vitest';
import {
  BELT_CAPACITY_PER_MIN,
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { BeltThroughput } from '@/game/flow/beltThroughput';
import { resolveRoutesFromOutput } from '@/game/flow/processorLogistics';
import { GameEngine } from '@/game/engine/GameEngine';
import { Direction, ResourceType, TileType, type BuildingId, type PortId } from '@/game/types';

/**
 * Belt runs carry at most BELT_CAPACITY_PER_MIN items per minute (two
 * extractors). Layouts are built along one row per test, with power from a
 * panel bank above each consumer.
 */

function makeEngine(): GameEngine {
  const engine = new GameEngine(800, 600, { dayNightCycleSeconds: 1e9 });
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.setSimulationTime(0.5);
  return engine;
}

function simulate(engine: GameEngine, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) engine.update(0.1);
}

function power(engine: GameEngine, consumer: BuildingId, x: number, y: number, panels = 1): void {
  for (let i = 0; i < panels; i++) {
    const panel = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: x + i, y })!;
    engine.connectBuildings(panel, consumer);
  }
}

function extractor(engine: GameEngine, x: number, y: number, resource = ResourceType.Regolith, rotation: Direction = Direction.North): BuildingId {
  engine.placeResource(x, y, resource);
  const id = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x, y }, rotation)!;
  power(engine, id, x - 2, y - 2);
  return id;
}

function belt(engine: GameEngine, from: BuildingId, fromPort: PortId, to: BuildingId, toPort: PortId): BuildingId[] {
  const result = engine.placeBelt({ building: from, port: fromPort }, { building: to, port: toPort });
  if (!result.ok) throw new Error(`belt refused: ${result.reason}`);
  return [...result.segmentIds];
}

/** `count` extractors (up to 3) on a merger, the merger belted to a storage. */
function mergedLine(engine: GameEngine, count: number, row: number) {
  const merger = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 10, y: row })!;
  const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 20, y: row - 1 })!;
  const extractors: BuildingId[] = [];
  const spots: [number, number, Direction, PortId][] = [
    [6, row, Direction.North, 'in_west'],
    [10, row - 4, Direction.East, 'in_north'],
    [10, row + 4, Direction.West, 'in_south'],
  ];
  for (const [x, y, rotation, port] of spots.slice(0, count)) {
    const id = extractor(engine, x, y, ResourceType.Regolith, rotation);
    belt(engine, id, 'out_east', merger, port);
    extractors.push(id);
  }
  const trunk = belt(engine, merger, 'out_east', storage, 'in_west');
  return { storage, extractors, trunk };
}

describe('belt throughput', () => {
  it('lets a single extractor through at its own rate', () => {
    const engine = makeEngine();
    const { storage } = mergedLine(engine, 1, 10);

    simulate(engine, 60);

    expect(engine.getStorageInventory(storage)!.regolith).toBeCloseTo(EXTRACTOR_RATE_PER_MIN, -1);
  });

  it('caps three merged extractors at the belt capacity, not three times the extractor rate', () => {
    const engine = makeEngine();
    const { storage, extractors, trunk } = mergedLine(engine, 3, 10);

    simulate(engine, 120);

    const delivered = engine.getStorageInventory(storage)!.regolith;
    expect(delivered).toBeGreaterThanOrEqual(2 * BELT_CAPACITY_PER_MIN - 4);
    expect(delivered).toBeLessThanOrEqual(2 * BELT_CAPACITY_PER_MIN + 4);
    expect(delivered).toBeLessThan(2 * 3 * EXTRACTOR_RATE_PER_MIN - 20);
    // Nothing is lost: the extractor left out keeps its unit.
    expect(extractors.some((id) => engine.getProducerOutputBuffer(id) !== null)).toBe(true);
    expect(engine.getBeltRunStats(trunk[0]!)).toMatchObject({ capacityPerMinute: BELT_CAPACITY_PER_MIN, saturated: true });
  });

  it('reports resource rates the belts actually carry', () => {
    const expected = [EXTRACTOR_RATE_PER_MIN, 2 * EXTRACTOR_RATE_PER_MIN, BELT_CAPACITY_PER_MIN];
    expected.forEach((rate, index) => {
      const engine = makeEngine();
      mergedLine(engine, index + 1, 10);
      expect(engine.getResourceRates().regolith).toBe(Math.min(rate, BELT_CAPACITY_PER_MIN));
    });
  });

  it('does not report a line under its capacity as saturated', () => {
    const engine = makeEngine();
    const { trunk } = mergedLine(engine, 2, 10);

    simulate(engine, 60);

    expect(engine.getBeltRunStats(trunk[0]!)?.saturated).toBe(false);
    expect(engine.getSaturatedBeltSegments()).toEqual([]);
  });

  it('treats a whole chain of belt segments as one run', () => {
    const engine = makeEngine();
    const { trunk } = mergedLine(engine, 1, 10);

    const runs = new Set(trunk.map((segment) => engine.getBeltRunStats(segment)!.runId));

    expect(runs.size).toBe(1);
    expect(engine.getBeltRunStats(engine.getBuildings().values().next().value!.id)).toBeNull();
  });

  it('still feeds a converter pulling four units per cycle through one belt', () => {
    const engine = makeEngine();
    const converter = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 16, y: 9 })!;
    power(engine, converter, 16, 6);
    engine.setProcessorRecipe(converter, 'silicon_dioxide');
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 24, y: 9 })!;
    belt(engine, converter, 'out', storage, 'in_west');
    const first = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 12, y: 10 })!;
    const second = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 8, y: 14 })!;
    belt(engine, first, 'out_east', converter, 'in');
    belt(engine, second, 'out_east', first, 'in_south');
    belt(engine, extractor(engine, 8, 10), 'out_east', first, 'in_west');
    belt(engine, extractor(engine, 12, 6, ResourceType.Regolith, Direction.East), 'out_east', first, 'in_north');
    belt(engine, extractor(engine, 4, 14), 'out_east', second, 'in_west');
    belt(engine, extractor(engine, 8, 18, ResourceType.Regolith, Direction.West), 'out_east', second, 'in_south');

    simulate(engine, 60);

    // One unit per 5-second cycle, minus the time to fill the first batch.
    expect(engine.getStorageInventory(storage)!.siliconDioxide).toBeGreaterThanOrEqual(10);
  });

  it("stops a unit's path at the machine it feeds: the machine's own output belt is not charged", () => {
    const engine = makeEngine();
    const source = extractor(engine, 4, 10);
    const converter = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 10, y: 9 })!;
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 18, y: 9 })!;
    const input = belt(engine, source, 'out_east', converter, 'in');
    const output = belt(engine, converter, 'out', storage, 'in_west');
    const throughput = new BeltThroughput({
      topologyKey: () => String(engine.connections.version),
      getBuilding: (id) => engine.getBuildings().get(id),
      getBuildings: () => engine.getBuildings(),
      getConnectionsOf: (id) => engine.getConnectionsOf(id),
    });
    const [toConverter] = resolveRoutesFromOutput(engine, source, 'out_east');
    const [toStorage] = resolveRoutesFromOutput(engine, converter, 'out');

    expect(toConverter!.nodes).toEqual(input);
    expect(toStorage!.nodes).toEqual(output);
    // Drain the input belt; the output belt keeps its full burst.
    for (let i = 0; i < 4; i++) throughput.tryPass([toConverter!.nodes]);
    expect(throughput.tryPass([toStorage!.nodes])).toBe(true);
    expect(throughput.tryPass([toStorage!.nodes])).toBe(true);
  });

  it('keeps the belt state through a save, so the reloaded world runs identically', () => {
    const engine = makeEngine();
    mergedLine(engine, 3, 10);
    simulate(engine, 7.3);

    const restored = GameEngine.fromSnapshot(engine.serializeWorld(), 800, 600);
    simulate(engine, 30);
    simulate(restored, 30);

    expect(restored.serializeWorld()).toEqual(engine.serializeWorld());
  });
});
