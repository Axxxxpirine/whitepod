import { describe, expect, it } from 'vitest';
import { BeltToolController } from '@/game/engine/BeltToolController';
import { GameEngine } from '@/game/engine/GameEngine';
import { gridToWorld, worldToScreen } from '@/game/engine/CoordinateTransform';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { ResourceType, TileType, type SelectedTool } from '@/game/types';
import { TILE_SIZE } from '@/game/constants';

function makeEngine() {
  const engine = new GameEngine(800, 600);
  engine.grid.fill(TileType.Ground);
  return engine;
}

function screenPointForTile(engine: GameEngine, x: number, y: number) {
  const { wx, wy } = gridToWorld(x, y);
  return worldToScreen(engine.viewport, wx + TILE_SIZE / 2, wy + TILE_SIZE / 2);
}

function placeExtractor(engine: GameEngine, x: number, y: number) {
  engine.placeResource(x, y, ResourceType.Coal);
  return engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x, y })!;
}

describe('BeltToolController', () => {
  it('removes the full belt line when clicking a belt segment with the belt tool', () => {
    const engine = makeEngine();
    const source = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 })!;
    const target = engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 5 })!;
    const placed = engine.placeBelt(
      { building: source, port: 'out_east' },
      { building: target, port: 'in_west' },
    );
    expect(placed.ok).toBe(true);
    if (!placed.ok) return;

    const selectedTool: SelectedTool = { kind: 'belt' };
    const controller = new BeltToolController(engine, () => selectedTool, () => {});
    const segment = engine.buildings.get(placed.segmentIds[1]);
    expect(segment).not.toBeNull();
    if (!segment) return;

    const point = screenPointForTile(engine, segment.origin.x, segment.origin.y);
    controller.onPointerDown(point.sx, point.sy, 0);

    expect(engine.getConnections().size).toBe(0);
    for (const segmentId of placed.segmentIds) {
      expect(engine.buildings.get(segmentId)).toBeNull();
    }
    expect(engine.buildings.get(source)).not.toBeNull();
    expect(engine.buildings.get(target)).not.toBeNull();
  });

  it('selects the clicked storage side when connecting a belt', () => {
    const engine = makeEngine();
    placeExtractor(engine, 5, 13);
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 10, y: 10 })!;

    const selectedTool: SelectedTool = { kind: 'belt' };
    let previewCount = 0;
    const controller = new BeltToolController(engine, () => selectedTool, (preview) => {
      if (preview) previewCount += 1;
    });

    const sourcePoint = screenPointForTile(engine, 5, 13);
    const eastSidePoint = screenPointForTile(engine, 12, 11);

    controller.onPointerDown(sourcePoint.sx, sourcePoint.sy, 0);
    controller.onPointerMove(eastSidePoint.sx, eastSidePoint.sy);
    controller.onPointerUp(eastSidePoint.sx, eastSidePoint.sy, 0);

    expect(previewCount).toBeGreaterThan(0);
    const storageConnections = engine.getConnectionsOf(storage);
    expect(storageConnections).toHaveLength(1);
    expect(storageConnections[0].to).toEqual({ building: storage, port: 'in_east' });
  });
});
