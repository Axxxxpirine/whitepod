import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { Direction, ResourceType, TileType } from '@/game/types';

function groundEverywhere(engine: GameEngine) {
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
}

function placeEndpoints(engine: GameEngine, ax: number, bx: number, y: number) {
  const source = engine.placeBuilding('placeholder_node_1x1', { x: ax, y })!;
  const target = engine.placeBuilding('placeholder_node_1x1', { x: bx, y })!;
  return { source, target };
}

function expectNoBeltsRemaining(engine: GameEngine) {
  for (const building of engine.getBuildings().values()) {
    expect(building.typeId.startsWith('belt_')).toBe(false);
  }
}

describe('GameEngine belts', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine(800, 600);
    groundEverywhere(engine);
  });

  it('places a conveyor atomically and returns segment ids in source->target order', () => {
    const { source, target } = placeEndpoints(engine, 5, 10, 5);

    const result = engine.placeBelt(
      { building: source, port: 'out_east' },
      { building: target, port: 'in_west' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.segmentIds).toHaveLength(4);
    expect(result.plan.segments.map((segment) => segment.coord)).toEqual([
      { x: 6, y: 5 },
      { x: 7, y: 5 },
      { x: 8, y: 5 },
      { x: 9, y: 5 },
    ]);
    expect(engine.getConnections().size).toBe(5);

    for (let i = 0; i < result.segmentIds.length; i++) {
      const building = engine.buildings.get(result.segmentIds[i]);
      expect(building).not.toBeNull();
      expect(building?.origin).toEqual(result.plan.segments[i].coord);
    }
  });

  it('returns source_port_taken when the source endpoint is already connected', () => {
    const { source, target } = placeEndpoints(engine, 5, 10, 5);
    const neighbor = engine.placeBuilding('placeholder_node_1x1', { x: 6, y: 5 })!;
    engine.connect(
      { building: source, port: 'out_east' },
      { building: neighbor, port: 'in_west' },
    );

    expect(
      engine.placeBelt(
        { building: source, port: 'out_east' },
        { building: target, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'source_port_taken' });
  });

  it('returns target_port_taken when the target endpoint is already connected', () => {
    const { source, target } = placeEndpoints(engine, 5, 10, 5);
    const neighbor = engine.placeBuilding('placeholder_node_1x1', { x: 9, y: 5 })!;
    engine.connect(
      { building: neighbor, port: 'out_east' },
      { building: target, port: 'in_west' },
    );

    expect(
      engine.placeBelt(
        { building: source, port: 'out_east' },
        { building: target, port: 'in_west' },
      ),
    ).toEqual({ ok: false, reason: 'target_port_taken' });
  });

  it('returns tiles_blocked and leaves no residue when a tile becomes occupied mid-commit', () => {
    const { source, target } = placeEndpoints(engine, 5, 10, 5);
    const preview = engine.canPlaceBelt(
      { building: source, port: 'out_east' },
      { building: target, port: 'in_west' },
    );
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;

    const blockedTile = preview.plan.segments[1].coord;
    const originalPlaceBuilding = engine.placeBuilding.bind(engine);
    let invocationCount = 0;

    vi.spyOn(engine, 'placeBuilding').mockImplementation((typeId, origin, rotation = Direction.North) => {
      const id = originalPlaceBuilding(typeId, origin, rotation);
      invocationCount += 1;
      if (invocationCount === 1) {
        engine.buildings.register(
          {
            typeId: 'placeholder_1x1',
            origin: blockedTile,
            rotation: Direction.North,
          },
          { w: 1, h: 1 },
        );
      }
      return id;
    });

    const result = engine.placeBelt(
      { building: source, port: 'out_east' },
      { building: target, port: 'in_west' },
    );

    expect(result).toEqual({ ok: false, reason: 'tiles_blocked' });
    expect(engine.getConnections().size).toBe(0);
    expectNoBeltsRemaining(engine);
    expect(engine.getBuildingAt(blockedTile.x, blockedTile.y)?.typeId).toBe('placeholder_1x1');
  });

  it('rolls back already placed segments when a later segment placement fails', () => {
    const { source, target } = placeEndpoints(engine, 5, 10, 5);
    const originalPlaceBuilding = engine.placeBuilding.bind(engine);
    let invocationCount = 0;

    vi.spyOn(engine, 'placeBuilding').mockImplementation((typeId, origin, rotation = Direction.North) => {
      invocationCount += 1;
      if (typeId.startsWith('belt_') && invocationCount === 2) {
        return null;
      }
      return originalPlaceBuilding(typeId, origin, rotation);
    });

    const result = engine.placeBelt(
      { building: source, port: 'out_east' },
      { building: target, port: 'in_west' },
    );

    expect(result).toEqual({ ok: false, reason: 'tiles_blocked' });
    expect(engine.getConnections().size).toBe(0);
    expectNoBeltsRemaining(engine);
    expect(engine.buildings.get(source)?.typeId).toBe('placeholder_node_1x1');
    expect(engine.buildings.get(target)?.typeId).toBe('placeholder_node_1x1');
  });

  it('rolls back already placed segments when a later connection fails', () => {
    const { source, target } = placeEndpoints(engine, 5, 10, 5);
    const originalConnect = engine.connect.bind(engine);
    let connectionCount = 0;

    vi.spyOn(engine, 'connect').mockImplementation((from, to) => {
      connectionCount += 1;
      if (connectionCount === 2) return null;
      return originalConnect(from, to);
    });

    const result = engine.placeBelt(
      { building: source, port: 'out_east' },
      { building: target, port: 'in_west' },
    );

    expect(result).toEqual({ ok: false, reason: 'tiles_blocked' });
    expect(engine.getConnections().size).toBe(0);
    expectNoBeltsRemaining(engine);
  });

  it('removeBelt removes the whole connected belt component and keeps endpoints intact', () => {
    const { source, target } = placeEndpoints(engine, 5, 10, 5);
    const placed = engine.placeBelt(
      { building: source, port: 'out_east' },
      { building: target, port: 'in_west' },
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const removed = engine.removeBelt(placed.segmentIds[1]);

    expect(removed).toBe(true);
    expect(engine.getConnections().size).toBe(0);
    expect(engine.buildings.get(source)?.typeId).toBe('placeholder_node_1x1');
    expect(engine.buildings.get(target)?.typeId).toBe('placeholder_node_1x1');
    for (const segmentId of placed.segmentIds) {
      expect(engine.buildings.get(segmentId)).toBeNull();
    }
  });

  it('removeBelt returns false for an unknown id or a non-belt building', () => {
    const bare = engine.placeBuilding('placeholder_1x1', { x: 20, y: 20 })!;

    expect(engine.removeBelt(9999)).toBe(false);
    expect(engine.removeBelt(bare)).toBe(false);
  });

  it('removeBuilding on the source also removes the connected belt chain', () => {
    const { source, target } = placeEndpoints(engine, 5, 10, 5);
    const placed = engine.placeBelt(
      { building: source, port: 'out_east' },
      { building: target, port: 'in_west' },
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    expect(engine.removeBuilding(source)).toBe(true);

    for (const segmentId of placed.segmentIds) {
      expect(engine.buildings.get(segmentId)).toBeNull();
    }
    expect(engine.getConnectionsOf(target)).toHaveLength(0);
    expect(engine.getConnections().size).toBe(0);
  });

  it('removeBuilding on a storage removes every connected belt input', () => {
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    const westSource = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 11 })!;
    const northSource = engine.placeBuilding('placeholder_node_1x1', { x: 11, y: 5 }, Direction.East)!;

    const west = engine.placeBelt(
      { building: westSource, port: 'out_east' },
      { building: storage, port: 'in_west' },
    );
    const north = engine.placeBelt(
      { building: northSource, port: 'out_east' },
      { building: storage, port: 'in_north' },
    );

    expect(west.ok).toBe(true);
    expect(north.ok).toBe(true);
    if (!west.ok || !north.ok) return;

    expect(engine.removeBuilding(storage)).toBe(true);

    for (const segmentId of [...west.segmentIds, ...north.segmentIds]) {
      expect(engine.buildings.get(segmentId)).toBeNull();
    }
    expect(engine.getConnections().size).toBe(0);
    expect(engine.buildings.get(westSource)?.typeId).toBe('placeholder_node_1x1');
    expect(engine.buildings.get(northSource)?.typeId).toBe('placeholder_node_1x1');
  });

  it('supports four independent belt inputs into the storage, one per side', () => {
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    const westSource = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 11 })!;
    const northSource = engine.placeBuilding('placeholder_node_1x1', { x: 11, y: 5 }, Direction.East)!;
    const eastSource = engine.placeBuilding('placeholder_node_1x1', { x: 14, y: 11 }, Direction.South)!;
    const southSource = engine.placeBuilding('placeholder_node_1x1', { x: 11, y: 14 }, Direction.West)!;

    const west = engine.placeBelt(
      { building: westSource, port: 'out_east' },
      { building: storage, port: 'in_west' },
    );
    const north = engine.placeBelt(
      { building: northSource, port: 'out_east' },
      { building: storage, port: 'in_north' },
    );
    const south = engine.placeBelt(
      { building: southSource, port: 'out_east' },
      { building: storage, port: 'in_south' },
    );
    const east = engine.placeBelt(
      { building: eastSource, port: 'out_east' },
      { building: storage, port: 'in_east' },
    );

    expect(west.ok).toBe(true);
    expect(north.ok).toBe(true);
    expect(south.ok).toBe(true);
    expect(east.ok).toBe(true);

    const storageConnections = engine.getConnectionsOf(storage);
    expect(storageConnections).toHaveLength(4);
    expect(storageConnections.map((connection) => connection.to.port).sort()).toEqual([
      'in_east',
      'in_north',
      'in_south',
      'in_west',
    ]);
  });

  it('uses the extractor rotation to start from the shortest side', () => {
    engine.placeResource(8, 8, ResourceType.Coal);
    const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 8, y: 8 }, Direction.East)!;
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 7, y: 12 })!;

    const result = engine.placeBelt(
      { building: extractor, port: 'out_east' },
      { building: storage, port: 'in_north' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.segments.map((segment) => segment.coord)).toEqual([
      { x: 8, y: 9 },
      { x: 8, y: 10 },
      { x: 8, y: 11 },
    ]);
  });
});
