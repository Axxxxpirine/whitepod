import { describe, expect, it } from 'vitest';
import { BeltToolController } from '@/game/engine/BeltToolController';
import type { BeltPlacementPreviewModel } from '@/game/renderer/placementPreviewModel';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { gridToWorld, worldToScreen } from '@/game/engine/CoordinateTransform';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { Direction, ResourceType, TileType, type SelectedTool } from '@/game/types';
import { TILE_SIZE } from '@/game/constants';
import { PIXI } from '@/design/tokens';

function makeEngine() {
  const engine = new GameEngine(800, 600);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  return engine;
}

function screenPointForTile(engine: GameEngine, x: number, y: number) {
  const { wx, wy } = gridToWorld(x, y);
  return worldToScreen(engine.viewport, wx + TILE_SIZE / 2, wy + TILE_SIZE / 2);
}

function screenPointForTileOffset(engine: GameEngine, x: number, y: number, offsetX: number, offsetY: number) {
  const { wx, wy } = gridToWorld(x, y);
  return worldToScreen(engine.viewport, wx + offsetX, wy + offsetY);
}

function placeExtractor(engine: GameEngine, x: number, y: number) {
  engine.placeResource(x, y, ResourceType.Regolith);
  return engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x, y })!;
}

describe('BeltToolController', () => {
  it('with the fast tool, previews then upgrades the hovered basic route in place', () => {
    const engine = makeEngine();
    const source = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 })!;
    const target = engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 5 })!;
    const placed = engine.placeBelt({ building: source, port: 'out_east' }, { building: target, port: 'in_west' });
    if (!placed.ok) throw new Error(placed.reason);
    const previews: (BeltPlacementPreviewModel | null)[] = [];
    const tool: SelectedTool = { kind: 'belt', tier: 'fast' };
    const controller = new BeltToolController(engine, () => tool, (preview) => previews.push(preview));
    const segment = engine.buildings.get(placed.segmentIds[1]!)!;
    const point = screenPointForTile(engine, segment.origin.x, segment.origin.y);

    controller.onPointerMove(point.sx, point.sy);
    expect(previews.at(-1)).toMatchObject({ kind: 'belt', upgrade: true, isValid: true });
    expect(previews.at(-1)?.tiles).toHaveLength(placed.segmentIds.length);

    controller.onPointerDown(point.sx, point.sy, 0);
    for (const id of placed.segmentIds) {
      expect(engine.buildings.get(id)?.typeId.startsWith('belt_fast_')).toBe(true);
    }
    expect(controller.hasPending()).toBe(false);
  });

  it('with the basic tool, clicking a belt neither upgrades nor starts a route', () => {
    const engine = makeEngine();
    const source = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 })!;
    const target = engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 5 })!;
    const placed = engine.placeBelt({ building: source, port: 'out_east' }, { building: target, port: 'in_west' });
    if (!placed.ok) throw new Error(placed.reason);
    const controller = new BeltToolController(engine, () => ({ kind: 'belt' }), () => {});
    const segment = engine.buildings.get(placed.segmentIds[1]!)!;
    const point = screenPointForTile(engine, segment.origin.x, segment.origin.y);

    controller.onPointerDown(point.sx, point.sy, 0);

    expect(engine.buildings.get(segment.id)?.typeId).toBe(segment.typeId);
  });

  it('does not remove a belt segment when clicking it with the belt tool', () => {
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

    // Clicking a belt segment in belt mode no longer deletes it
    for (const segmentId of placed.segmentIds) {
      expect(engine.buildings.get(segmentId)).not.toBeNull();
    }
  });

  it('selects the clicked storage side when connecting a belt via two clicks', () => {
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

    // First click: select source
    controller.onPointerDown(sourcePoint.sx, sourcePoint.sy, 0);
    // Hover to show preview
    controller.onPointerMove(eastSidePoint.sx, eastSidePoint.sy);
    // Second click: place belt to target
    controller.onPointerDown(eastSidePoint.sx, eastSidePoint.sy, 0);

    expect(previewCount).toBeGreaterThan(0);
    const storageConnections = engine.getConnectionsOf(storage);
    expect(storageConnections).toHaveLength(1);
    expect(storageConnections[0].to).toEqual({ building: storage, port: 'in_east' });
  });

  it('keeps an unaffordable route visible, tinted invalid, with its cost and what is missing', () => {
    const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
    engine.generateMap(42);
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    const hub = engine.storageInventories.get(engine.getHubId()!)!;
    hub.regolith = 1000;
    placeExtractor(engine, 5, 13);
    engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 10, y: 10 });
    hub.regolith = 1;

    const selectedTool: SelectedTool = { kind: 'belt' };
    let preview: BeltPlacementPreviewModel | null = null;
    const controller = new BeltToolController(engine, () => selectedTool, (next) => {
      preview = next;
    });
    const sourcePoint = screenPointForTile(engine, 5, 13);
    const eastSidePoint = screenPointForTile(engine, 12, 11);

    controller.onPointerDown(sourcePoint.sx, sourcePoint.sy, 0);
    controller.onPointerMove(eastSidePoint.sx, eastSidePoint.sy);

    const shown = preview as BeltPlacementPreviewModel | null;
    expect(shown).not.toBeNull();
    expect(shown!.isValid).toBe(false);
    expect(shown!.reason).toBe('insufficient_resources');
    expect(shown!.cost).toEqual([{ resourceType: ResourceType.Regolith, amount: shown!.tiles.length }]);
    expect(shown!.missing).toEqual([{ resourceType: ResourceType.Regolith, amount: shown!.tiles.length - 1 }]);
    for (const tile of shown!.tiles) expect(tile.tint).toBe(PIXI.error);
  });

  it('clears the pending source when leaving the belt tool', () => {
    const engine = makeEngine();
    placeExtractor(engine, 5, 13);
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 10, y: 10 })!;

    let selectedTool: SelectedTool = { kind: 'belt' };
    const controller = new BeltToolController(engine, () => selectedTool, () => {});

    const sourcePoint = screenPointForTile(engine, 5, 13);
    const eastSidePoint = screenPointForTile(engine, 12, 11);

    controller.onPointerDown(sourcePoint.sx, sourcePoint.sy, 0);
    selectedTool = { kind: 'select' };
    controller.clearPendingPlacement();
    selectedTool = { kind: 'belt' };

    controller.onPointerDown(eastSidePoint.sx, eastSidePoint.sy, 0);

    expect(engine.getConnectionsOf(storage)).toHaveLength(0);
  });

  it('chooses the merger input that matches the current route instead of the first free port', () => {
    const engine = makeEngine();
    const merger = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 5 }, Direction.East)!;
    engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 14 }, Direction.West)!;
    engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 10 })!;

    const selectedTool: SelectedTool = { kind: 'belt' };
    const controller = new BeltToolController(engine, () => selectedTool, () => {});
    const mergerNorthPoint = screenPointForTileOffset(engine, 10, 10, TILE_SIZE / 2, 4);
    const mergerSouthPoint = screenPointForTileOffset(engine, 10, 10, TILE_SIZE / 2, TILE_SIZE - 4);
    const mergerWestPoint = screenPointForTileOffset(engine, 10, 10, 4, TILE_SIZE / 2);

    const northPoint = screenPointForTile(engine, 10, 5);
    controller.onPointerDown(northPoint.sx, northPoint.sy, 0);
    controller.onPointerDown(mergerNorthPoint.sx, mergerNorthPoint.sy, 0);

    const southPoint = screenPointForTile(engine, 10, 14);
    controller.onPointerDown(southPoint.sx, southPoint.sy, 0);
    controller.onPointerDown(mergerSouthPoint.sx, mergerSouthPoint.sy, 0);

    const westPoint = screenPointForTile(engine, 5, 10);
    controller.onPointerDown(westPoint.sx, westPoint.sy, 0);
    controller.onPointerDown(mergerWestPoint.sx, mergerWestPoint.sy, 0);

    const mergerConnections = engine.getConnectionsOf(merger);
    expect(mergerConnections).toHaveLength(3);
    expect(mergerConnections.map((connection) => connection.to.port).sort()).toEqual([
      'in_north',
      'in_south',
      'in_west',
    ]);
  });
});
