import { describe, expect, it } from 'vitest';
import { Container, type Application } from 'pixi.js';
import { GameEngine } from '@/game/engine/GameEngine';
import { BeltFlowAnimator } from '@/game/renderer/BeltFlowAnimator';
import { ResourceType, TileType, type BuildingId } from '@/game/types';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';

type AnimatorTestApi = { resolveResourceForBelt(id: BuildingId): ResourceType };

function makeEngine() {
  const engine = new GameEngine(800, 600);
  engine.grid.fill(TileType.Ground);
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

    expect((animator as unknown as AnimatorTestApi).resolveResourceForBelt(firstSegmentId)).toBe(ResourceType.None);

    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    expect((animator as unknown as AnimatorTestApi).resolveResourceForBelt(firstSegmentId)).toBe(ResourceType.IronOre);

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

    expect((animator as unknown as AnimatorTestApi).resolveResourceForBelt(firstSegmentId)).toBe(ResourceType.Coal);

    engine.grid.resourceAmount.fill(0);

    expect((animator as unknown as AnimatorTestApi).resolveResourceForBelt(firstSegmentId)).toBe(ResourceType.Coal);

    animator.destroy();
  });
});
