import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InputHandler } from '@/game/engine/InputHandler';
import { GameEngine } from '@/game/engine/GameEngine';
import { TILE_SIZE } from '@/game/constants';
import { TileType, type SelectedTool } from '@/game/types';

function makeEngine() {
  const engine = new GameEngine(640, 480);
  engine.viewport.centerX = TILE_SIZE / 2;
  engine.viewport.centerY = TILE_SIZE / 2;
  return engine;
}

describe('InputHandler', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it('places terrain when the selected tool is a tile', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'tile', tile: TileType.Ground });
    const placeTile = vi.spyOn(engine, 'placeTile');
    const placeBuilding = vi.spyOn(engine, 'placeBuilding');
    const handler = new InputHandler(engine, getSelectedTool);

    handler.onPointerDown(320, 240, 0);

    expect(placeTile).toHaveBeenCalledWith(0, 0, TileType.Ground);
    expect(placeBuilding).not.toHaveBeenCalled();
  });

  it('places the selected building when the selected tool is a building', () => {
    const getSelectedTool = (): SelectedTool => ({
      kind: 'building',
      buildingType: 'extractor_basic',
    });
    const placeTile = vi.spyOn(engine, 'placeTile');
    const placeBuilding = vi.spyOn(engine, 'placeBuilding');
    const handler = new InputHandler(engine, getSelectedTool);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 });
    expect(placeTile).not.toHaveBeenCalled();
  });

  it('starts panning on right click without placing anything', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'tile', tile: TileType.Ground });
    const placeTile = vi.spyOn(engine, 'placeTile');
    const handler = new InputHandler(engine, getSelectedTool);

    handler.onPointerDown(320, 240, 2);
    handler.onPointerMove(340, 255);

    expect(placeTile).not.toHaveBeenCalled();
    expect(engine.viewport.centerX).not.toBe(TILE_SIZE / 2);
    expect(engine.viewport.centerY).not.toBe(TILE_SIZE / 2);
  });

  it('zooms on wheel input with ctrlKey', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'tile', tile: TileType.Ground });
    const handler = new InputHandler(engine, getSelectedTool);
    const initialZoom = engine.viewport.zoom;

    handler.onWheel(320, 240, 0, -100, true, 0);

    expect(engine.viewport.zoom).toBeGreaterThan(initialZoom);
  });
});
