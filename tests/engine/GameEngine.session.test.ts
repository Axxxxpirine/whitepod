import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';

describe('GameEngine session snapshots', () => {
  it('restores world state, ids and viewport from a serialized snapshot', () => {
    const engine = new GameEngine(640, 480);
    engine.generateMap(77);
    engine.grid.fill(TileType.Ground);
    engine.grid.setResource(5, 5, ResourceType.IronOre);
    engine.placeBuilding('extractor_basic', { x: 5, y: 5 });
    const a = engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 10 })!;
    const b = engine.placeBuilding('placeholder_node_1x1', { x: 11, y: 10 })!;
    const connectionId = engine.connect(
      { building: a, port: 'out_east' },
      { building: b, port: 'in_west' },
    )!;
    engine.viewport.pan(140, 80);
    engine.viewport.zoomAt(320, 240, 1.6);

    const world = engine.serializeWorld();
    const viewport = engine.getViewportSnapshot();

    const restored = GameEngine.fromSnapshot(world, 640, 480);
    restored.viewport.restore(viewport);

    expect(restored.mapSeed).toBe(77);
    expect(restored.getResourceAt(5, 5)).toBe(ResourceType.IronOre);
    expect(restored.getBuildingAt(5, 5)?.typeId).toBe('extractor_basic');
    expect(restored.getConnections().get(connectionId)).toEqual({
      id: connectionId,
      from: { building: a, port: 'out_east' },
      to: { building: b, port: 'in_west' },
    });
    expect(restored.getViewportSnapshot()).toEqual(viewport);
  });

  it('throws when a snapshot contains an invalid connection', () => {
    const engine = new GameEngine(640, 480);
    const snapshot = engine.serializeWorld();

    expect(() =>
      GameEngine.fromSnapshot(
        {
          ...snapshot,
          connections: {
            ...snapshot.connections,
            connections: [
              {
                id: 1,
                from: { building: 999, port: 'out' },
                to: { building: 1000, port: 'in' },
              },
            ],
          },
        },
        640,
        480,
      ),
    ).toThrow(/Invalid connection/);
  });

  it('restores placed belts from a serialized snapshot', () => {
    const engine = new GameEngine(640, 480);
    engine.grid.fill(TileType.Ground);
    const source = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 })!;
    const target = engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 5 })!;
    const placed = engine.placeBelt(
      { building: source, port: 'out_east' },
      { building: target, port: 'in_west' },
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const world = engine.serializeWorld();
    const restored = GameEngine.fromSnapshot(world, 640, 480);

    for (const segmentId of placed.segmentIds) {
      const building = restored.getBuildings().get(segmentId);
      expect(building).not.toBeUndefined();
      expect(building?.typeId.startsWith('belt_')).toBe(true);
    }
    expect(restored.getConnections().size).toBe(engine.getConnections().size);
  });

  it('restores energy links from a serialized snapshot', () => {
    const engine = new GameEngine(640, 480);
    engine.grid.fill(TileType.Ground);
    const solarId = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    engine.grid.setResource(2, 1, ResourceType.IronOre);
    const extractorId = engine.placeBuilding('extractor_basic', { x: 2, y: 1 })!;
    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    const world = engine.serializeWorld();
    const restored = GameEngine.fromSnapshot(world, 640, 480);

    expect(restored.areBuildingsEnergyLinked(solarId, extractorId)).toBe(true);
    expect(restored.getEnergyNetworkForBuilding(extractorId)).toEqual({
      buildingIds: [solarId, extractorId].sort((a, b) => a - b),
      production: 8,
      consumption: 5,
      remaining: 3,
    });
  });
});
