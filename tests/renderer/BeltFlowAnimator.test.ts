import { describe, expect, it } from 'vitest';
import { Container, type Application } from 'pixi.js';
import { GameEngine } from '@/game/engine/GameEngine';
import { BeltFlowAnimator } from '@/game/renderer/BeltFlowAnimator';
import { ResourceType, TileType, type BuildingId } from '@/game/types';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';

type AnimatorTestApi = { resolveResourcesForBelt(id: BuildingId): ReadonlyArray<ResourceType> };

function makeEngine() {
  const engine = new GameEngine(800, 600);
  engine.simulationTime = 0.5; // noon — full solar production
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  return engine;
}

function createAnimator(engine: GameEngine) {
  return new BeltFlowAnimator({ stage: new Container() } as unknown as Application, engine);
}

describe('BeltFlowAnimator', () => {
  it('stops belt sprite animation when the upstream extractor is unpowered', () => {
    const engine = makeEngine();
    engine.placeResource(2, 1, ResourceType.IronOre);

    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 1 })!;
    const belt = engine.placeBelt(
      { building: extractorId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    if (!belt.ok) {
      throw new Error(`expected belt placement to succeed, got ${belt.reason}`);
    }

    const animator = createAnimator(engine);
    const firstSegmentId = belt.segmentIds[0]!;

    expect((animator as unknown as AnimatorTestApi).resolveResourcesForBelt(firstSegmentId)).toEqual([]);

    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    expect((animator as unknown as AnimatorTestApi).resolveResourcesForBelt(firstSegmentId)).toEqual([ResourceType.IronOre]);

    animator.destroy();
  });

  it('keeps belt sprite animation running when a save restores a zero resource amount', () => {
    const engine = makeEngine();
    engine.placeResource(2, 1, ResourceType.Coal);

    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 1 })!;
    const belt = engine.placeBelt(
      { building: extractorId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    if (!belt.ok) {
      throw new Error(`expected belt placement to succeed, got ${belt.reason}`);
    }

    const firstSegmentId = belt.segmentIds[0]!;
    const animator = createAnimator(engine);

    expect((animator as unknown as AnimatorTestApi).resolveResourcesForBelt(firstSegmentId)).toEqual([ResourceType.Coal]);

    engine.grid.resourceAmount.fill(0);

    expect((animator as unknown as AnimatorTestApi).resolveResourcesForBelt(firstSegmentId)).toEqual([ResourceType.Coal]);

    animator.destroy();
  });

  it('resolves a single resource type for a belt downstream of a merger with one input', () => {
    const engine = makeEngine();
    engine.placeResource(0, 1, ResourceType.Coal);

    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 0, y: 2 })!;
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 0, y: 1 })!;
    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    const mergerId = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 1 })!;

    // Route extractor → merger's west input.
    const inBelt = engine.placeBelt(
      { building: extractorId, port: 'out_east' },
      { building: mergerId, port: 'in_west' },
    );
    if (!inBelt.ok) throw new Error(`belt placement failed: ${inBelt.reason}`);

    // Route merger output → target.
    const outBelt = engine.placeBelt(
      { building: mergerId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    if (!outBelt.ok) throw new Error(`output belt placement failed: ${outBelt.reason}`);

    const animator = createAnimator(engine);
    const outBeltFirstSegmentId = outBelt.segmentIds[0]!;

    // Belt downstream of the merger should see the same resource type as the input.
    expect((animator as unknown as AnimatorTestApi).resolveResourcesForBelt(outBeltFirstSegmentId))
      .toEqual([ResourceType.Coal]);

    animator.destroy();
  });

  it('resolves both resource types for a belt downstream of a merger with two different inputs', () => {
    // Layout:
    //   (0,0)=E2(iron)  (1,0)=belt  (2,0)=belt  (3,0)=corner→south
    //   (0,1)=E1(coal)  (1,1)=belt  (2,1)=belt            (3,1)=Merger  (4,1)=belt  (5,1)=T
    const engine = makeEngine();
    engine.placeResource(0, 1, ResourceType.Coal);
    engine.placeResource(0, 0, ResourceType.IronOre);

    const solar1Id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 0, y: 4 })!;
    const solar2Id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 4 })!;
    const extractor1Id = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 0, y: 1 })!; // coal
    const extractor2Id = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 0, y: 0 })!; // iron
    expect(engine.connectBuildings(solar1Id, extractor1Id)).toBe(true);
    expect(engine.connectBuildings(solar2Id, extractor2Id)).toBe(true);

    const mergerId = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 1 })!;

    // E1(coal) → merger west input.
    const belt1 = engine.placeBelt(
      { building: extractor1Id, port: 'out_east' },
      { building: mergerId, port: 'in_west' },
    );
    if (!belt1.ok) throw new Error(`belt1 failed: ${belt1.reason}`);

    // E2(iron) → merger north input (router places a corner at (3,0)).
    const belt2 = engine.placeBelt(
      { building: extractor2Id, port: 'out_east' },
      { building: mergerId, port: 'in_north' },
    );
    if (!belt2.ok) throw new Error(`belt2 failed: ${belt2.reason}`);

    // Merger output → target.
    const outBelt = engine.placeBelt(
      { building: mergerId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    if (!outBelt.ok) throw new Error(`outBelt failed: ${outBelt.reason}`);

    const animator = createAnimator(engine);
    const outBeltFirstSegmentId = outBelt.segmentIds[0]!;
    const resolved = (animator as unknown as AnimatorTestApi).resolveResourcesForBelt(outBeltFirstSegmentId);

    // Both resource types must appear; order is insertion-deterministic.
    expect(resolved).toHaveLength(2);
    expect(resolved).toContain(ResourceType.Coal);
    expect(resolved).toContain(ResourceType.IronOre);

    animator.destroy();
  });

  it('deduplicates resource types when two inputs carry the same resource', () => {
    const engine = makeEngine();
    engine.placeResource(0, 1, ResourceType.Coal);
    engine.placeResource(0, 0, ResourceType.Coal); // same type on both inputs

    const solar1Id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 0, y: 4 })!;
    const solar2Id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 4 })!;
    const extractor1Id = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 0, y: 1 })!;
    const extractor2Id = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 0, y: 0 })!;
    expect(engine.connectBuildings(solar1Id, extractor1Id)).toBe(true);
    expect(engine.connectBuildings(solar2Id, extractor2Id)).toBe(true);

    const mergerId = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 1 })!;

    const belt1 = engine.placeBelt(
      { building: extractor1Id, port: 'out_east' },
      { building: mergerId, port: 'in_west' },
    );
    if (!belt1.ok) throw new Error(`belt1 failed: ${belt1.reason}`);
    const belt2 = engine.placeBelt(
      { building: extractor2Id, port: 'out_east' },
      { building: mergerId, port: 'in_north' },
    );
    if (!belt2.ok) throw new Error(`belt2 failed: ${belt2.reason}`);
    const outBelt = engine.placeBelt(
      { building: mergerId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    if (!outBelt.ok) throw new Error(`outBelt failed: ${outBelt.reason}`);

    const animator = createAnimator(engine);
    const resolved = (animator as unknown as AnimatorTestApi).resolveResourcesForBelt(outBelt.segmentIds[0]!);

    // Deduplicated: two coal inputs → still just [Coal].
    expect(resolved).toEqual([ResourceType.Coal]);

    animator.destroy();
  });

  it('returns empty array for belt downstream of merger with no inputs connected', () => {
    const engine = makeEngine();

    const mergerId = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 1 })!;

    const outBelt = engine.placeBelt(
      { building: mergerId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    if (!outBelt.ok) throw new Error(`outBelt failed: ${outBelt.reason}`);

    const animator = createAnimator(engine);
    const resolved = (animator as unknown as AnimatorTestApi).resolveResourcesForBelt(outBelt.segmentIds[0]!);

    // No upstream extractor → no particles.
    expect(resolved).toEqual([]);

    animator.destroy();
  });
});
