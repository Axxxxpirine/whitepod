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
});
