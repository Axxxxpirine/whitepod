import { describe, expect, it } from 'vitest';
import { Container, type Application, type Sprite } from 'pixi.js';
import { GameEngine } from '@/game/engine/GameEngine';
import { BeltFlowAnimator } from '@/game/renderer/BeltFlowAnimator';
import { resolveBeltFlow } from '@/game/flow/resolveBeltFlow';
import { ResourceType, TileType, type BuildingId } from '@/game/types';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { TILE_SIZE } from '@/game/constants';

function resolveResources(engine: GameEngine, beltId: BuildingId): ReadonlyArray<ResourceType> {
  return resolveBeltFlow(engine, beltId).map((e) => e.resourceType);
}

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

function focusViewportOnBelts(engine: GameEngine): void {
  engine.viewport.centerX = 4 * TILE_SIZE;
  engine.viewport.centerY = 2 * TILE_SIZE;
}

interface AnimatorInternals {
  activeSprites: Map<number, Sprite>;
  flowComponents: Map<number, {
    orderedBeltIds: readonly number[];
    pathLength: number;
    totalRatePerMinute: number;
    visualCount: number;
    phase: number;
    textureIndex: number;
    resourceTypes: readonly ResourceType[];
  }>;
  worldDirty: boolean;
}

function internals(animator: BeltFlowAnimator): AnimatorInternals {
  return animator as unknown as AnimatorInternals;
}

describe('BeltFlowAnimator', () => {
  it('stops belt sprite animation when the upstream extractor is unpowered', () => {
    const engine = makeEngine();
    engine.placeResource(2, 1, ResourceType.Hydrogen);

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

    expect(resolveResources(engine, firstSegmentId)).toEqual([]);

    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    expect(resolveResources(engine, firstSegmentId)).toEqual([ResourceType.Hydrogen]);

    animator.destroy();
  });

  it('keeps belt sprite animation running when a save restores a zero resource amount', () => {
    const engine = makeEngine();
    engine.placeResource(2, 1, ResourceType.Regolith);

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

    expect(resolveResources(engine, firstSegmentId)).toEqual([ResourceType.Regolith]);

    engine.grid.resourceAmount.fill(0);

    expect(resolveResources(engine, firstSegmentId)).toEqual([ResourceType.Regolith]);

    animator.destroy();
  });

  it('resolves a single resource type for a belt downstream of a merger with one input', () => {
    const engine = makeEngine();
    engine.placeResource(0, 1, ResourceType.Regolith);

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
    expect(resolveResources(engine, outBeltFirstSegmentId))
      .toEqual([ResourceType.Regolith]);

    animator.destroy();
  });

  it('resolves both resource types for a belt downstream of a merger with two different inputs', () => {
    // Layout:
    //   (0,0)=E2(hydrogen)  (1,0)=belt  (2,0)=belt  (3,0)=corner→south
    //   (0,1)=E1(regolith)  (1,1)=belt  (2,1)=belt            (3,1)=Merger  (4,1)=belt  (5,1)=T
    const engine = makeEngine();
    engine.placeResource(0, 1, ResourceType.Regolith);
    engine.placeResource(0, 0, ResourceType.Hydrogen);

    const solar1Id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 0, y: 4 })!;
    const solar2Id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 4 })!;
    const extractor1Id = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 0, y: 1 })!; // regolith
    const extractor2Id = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 0, y: 0 })!; // hydrogen
    expect(engine.connectBuildings(solar1Id, extractor1Id)).toBe(true);
    expect(engine.connectBuildings(solar2Id, extractor2Id)).toBe(true);

    const mergerId = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 1 })!;

    // E1(regolith) → merger west input.
    const belt1 = engine.placeBelt(
      { building: extractor1Id, port: 'out_east' },
      { building: mergerId, port: 'in_west' },
    );
    if (!belt1.ok) throw new Error(`belt1 failed: ${belt1.reason}`);

    // E2(hydrogen) → merger north input (router places a corner at (3,0)).
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
    const resolved = resolveResources(engine, outBeltFirstSegmentId);

    // Both resource types must appear; order is insertion-deterministic.
    expect(resolved).toHaveLength(2);
    expect(resolved).toContain(ResourceType.Regolith);
    expect(resolved).toContain(ResourceType.Hydrogen);

    animator.destroy();
  });

  it('deduplicates resource types when two inputs carry the same resource', () => {
    const engine = makeEngine();
    engine.placeResource(0, 1, ResourceType.Regolith);
    engine.placeResource(0, 0, ResourceType.Regolith); // same type on both inputs

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
    const resolved = resolveResources(engine, outBelt.segmentIds[0]!);

    // Deduplicated: two regolith inputs → still just [Regolith].
    expect(resolved).toEqual([ResourceType.Regolith]);

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
    const resolved = resolveResources(engine, outBelt.segmentIds[0]!);

    // No upstream extractor → no particles.
    expect(resolved).toEqual([]);

    animator.destroy();
  });

  it('renders moving sprites for one connected conveyor component', () => {
    const engine = makeEngine();
    engine.placeResource(2, 1, ResourceType.Regolith);

    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 7, y: 1 })!;
    const belt = engine.placeBelt(
      { building: extractorId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    if (!belt.ok) throw new Error(`belt placement failed: ${belt.reason}`);

    const animator = createAnimator(engine);
    focusViewportOnBelts(engine);
    animator.update(16);
    animator.render();

    expect(internals(animator).activeSprites.size).toBeGreaterThan(0);

    animator.destroy();
  });

  it('moves the sprite continuously toward destination on a straight eastbound belt', () => {
    const engine = makeEngine();
    engine.placeResource(2, 1, ResourceType.Regolith);

    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 7, y: 1 })!;
    const belt = engine.placeBelt(
      { building: extractorId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    if (!belt.ok) throw new Error(`belt placement failed: ${belt.reason}`);

    const animator = createAnimator(engine);
    focusViewportOnBelts(engine);
    const xs: number[] = [];

    for (let i = 0; i < 4; i++) {
      animator.update(80);
      animator.render();
      const sprite = internals(animator).activeSprites.values().next().value as Sprite | undefined;
      if (!sprite) throw new Error('expected active conveyor sprite');
      xs.push(sprite.x);
    }

    expect(xs[1]!).toBeGreaterThan(xs[0]!);
    expect(xs[2]!).toBeGreaterThan(xs[1]!);
    expect(xs[3]!).toBeGreaterThan(xs[2]!);

    animator.destroy();
  });

  it('respawns at source after wrapping the full component path', () => {
    const engine = makeEngine();
    engine.placeResource(2, 1, ResourceType.Regolith);

    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 7, y: 1 })!;
    const belt = engine.placeBelt(
      { building: extractorId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    if (!belt.ok) throw new Error(`belt placement failed: ${belt.reason}`);

    const animator = createAnimator(engine);
    focusViewportOnBelts(engine);
    animator.update(0);
    const component = internals(animator).flowComponents.values().next().value;
    if (!component) throw new Error('expected a flow component');

    component.phase = component.pathLength - 1;
    animator.render();
    const beforeWrap = internals(animator).activeSprites.values().next().value as Sprite | undefined;
    if (!beforeWrap) throw new Error('expected active conveyor sprite');
    const beforeX = beforeWrap.x;

    animator.update(200);
    animator.render();
    const afterWrap = internals(animator).activeSprites.values().next().value as Sprite | undefined;
    if (!afterWrap) throw new Error('expected active conveyor sprite after wrap');

    expect(afterWrap.x).toBeLessThan(beforeX);

    animator.destroy();
  });

  it('hides sprites when no belt in component has active resource flow', () => {
    const engine = makeEngine();
    engine.placeResource(2, 1, ResourceType.Hydrogen);

    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 6, y: 1 })!;
    const belt = engine.placeBelt(
      { building: extractorId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    if (!belt.ok) throw new Error(`belt placement failed: ${belt.reason}`);

    const animator = createAnimator(engine);
    focusViewportOnBelts(engine);
    animator.update(16);
    animator.render();

    expect(internals(animator).activeSprites.size).toBe(0);

    animator.destroy();
  });

  it('increments texture index on cycle wrap when multiple resources flow', () => {
    const engine = makeEngine();
    engine.placeResource(0, 1, ResourceType.Regolith);
    engine.placeResource(0, 0, ResourceType.Hydrogen);

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
    focusViewportOnBelts(engine);
    animator.update(0);

    const component = Array.from(internals(animator).flowComponents.values())
      .find((c) => c.resourceTypes.length > 1);
    if (!component) throw new Error('expected flow component');
    expect(component.resourceTypes).toContain(ResourceType.Regolith);
    expect(component.resourceTypes).toContain(ResourceType.Hydrogen);

    const initialTextureIndex = component.textureIndex;
    component.phase = component.pathLength - 0.1;
    animator.update(200);

    expect(component.textureIndex).toBeGreaterThan(initialTextureIndex);

    animator.destroy();
  });

  it('keeps deterministic path ordering for merge topology across rebuilds', () => {
    const engine = makeEngine();
    engine.placeResource(0, 1, ResourceType.Regolith);
    engine.placeResource(0, 0, ResourceType.Hydrogen);

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
    animator.update(0);
    const first = internals(animator).flowComponents.values().next().value;
    if (!first) throw new Error('expected flow component');
    const firstPath = [...first.orderedBeltIds];

    internals(animator).worldDirty = true;
    animator.update(0);
    const second = internals(animator).flowComponents.values().next().value;
    if (!second) throw new Error('expected flow component after rebuild');
    const secondPath = [...second.orderedBeltIds];

    expect(secondPath).toEqual(firstPath);

    animator.destroy();
  });

  it('increases visible asset count when throughput increases on the same line', () => {
    const engine = makeEngine();
    engine.placeResource(0, 1, ResourceType.Regolith);
    engine.placeResource(0, 0, ResourceType.Hydrogen);

    const solar1Id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 0, y: 4 })!;
    const solar2Id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 4 })!;
    const extractor1Id = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 0, y: 1 })!;
    const extractor2Id = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 0, y: 0 })!;
    expect(engine.connectBuildings(solar1Id, extractor1Id)).toBe(true);
    expect(engine.connectBuildings(solar2Id, extractor2Id)).toBe(true);

    const mergerId = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 3, y: 1 })!;
    const targetId = engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 1 })!;

    const inputA = engine.placeBelt(
      { building: extractor1Id, port: 'out_east' },
      { building: mergerId, port: 'in_west' },
    );
    if (!inputA.ok) throw new Error(`inputA failed: ${inputA.reason}`);

    const out = engine.placeBelt(
      { building: mergerId, port: 'out_east' },
      { building: targetId, port: 'in_west' },
    );
    if (!out.ok) throw new Error(`out failed: ${out.reason}`);

    const animator = createAnimator(engine);
    focusViewportOnBelts(engine);
    animator.update(0);
    const lowRateComponents = Array.from(internals(animator).flowComponents.values());
    if (lowRateComponents.length === 0) throw new Error('expected flow component');
    const lowRateMaxRate = Math.max(...lowRateComponents.map((c) => c.totalRatePerMinute));
    const lowRateMaxVisualCount = Math.max(...lowRateComponents.map((c) => c.visualCount));

    const inputB = engine.placeBelt(
      { building: extractor2Id, port: 'out_east' },
      { building: mergerId, port: 'in_north' },
    );
    if (!inputB.ok) throw new Error(`inputB failed: ${inputB.reason}`);

    animator.update(0);
    const highRateComponents = Array.from(internals(animator).flowComponents.values());
    if (highRateComponents.length === 0) throw new Error('expected flow component after 2nd source');
    const highRateMaxRate = Math.max(...highRateComponents.map((c) => c.totalRatePerMinute));
    const highRateMaxVisualCount = Math.max(...highRateComponents.map((c) => c.visualCount));

    expect(highRateMaxRate).toBeGreaterThan(lowRateMaxRate);
    expect(highRateMaxVisualCount).toBeGreaterThanOrEqual(lowRateMaxVisualCount);

    animator.destroy();
  });
});
