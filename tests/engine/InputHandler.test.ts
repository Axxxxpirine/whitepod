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

  it('selects a building when the selected tool is select', () => {
    engine.grid.fill(TileType.Ground);
    engine.placeBuilding('placeholder_1x1', { x: 0, y: 0 });
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const onBuildingSelected = vi.fn();
    const handler = new InputHandler(engine, getSelectedTool);
    handler.setBuildingSelectedCallback(onBuildingSelected);

    handler.onPointerDown(320, 240, 0);

    expect(onBuildingSelected).toHaveBeenCalledWith(1);
  });

  it('places the selected building when the selected tool is a building', () => {
    const getSelectedTool = (): SelectedTool => ({
      kind: 'building',
      buildingType: 'extractor_basic',
    });
    const placeBuilding = vi.spyOn(engine, 'placeBuilding');
    const handler = new InputHandler(engine, getSelectedTool);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 });
  });

  it('returns null when selecting an empty tile', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const onBuildingSelected = vi.fn();
    const handler = new InputHandler(engine, getSelectedTool);
    handler.setBuildingSelectedCallback(onBuildingSelected);

    handler.onPointerDown(320, 240, 0);

    expect(onBuildingSelected).toHaveBeenCalledWith(null);
  });

  it('starts panning on right click without selecting anything', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const onBuildingSelected = vi.fn();
    const handler = new InputHandler(engine, getSelectedTool);
    handler.setBuildingSelectedCallback(onBuildingSelected);

    handler.onPointerDown(320, 240, 2);
    handler.onPointerMove(340, 255);

    expect(onBuildingSelected).not.toHaveBeenCalled();
    expect(engine.viewport.centerX).not.toBe(TILE_SIZE / 2);
    expect(engine.viewport.centerY).not.toBe(TILE_SIZE / 2);
  });

  it('zooms on wheel input with ctrlKey', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const handler = new InputHandler(engine, getSelectedTool);
    const initialZoom = engine.viewport.zoom;

    handler.onWheel(320, 240, 0, -100, true, 0);

    expect(engine.viewport.zoom).toBeGreaterThan(initialZoom);
  });

  it('leaves building mode after a successful building placement', () => {
    const getSelectedTool = (): SelectedTool => ({
      kind: 'building',
      buildingType: 'extractor_basic',
    });
    const onBuildingPlaced = vi.fn();
    const placeBuilding = vi.spyOn(engine, 'placeBuilding').mockReturnValueOnce(1);
    const handler = new InputHandler(engine, getSelectedTool);
    handler.setBuildingPlacedCallback(onBuildingPlaced);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 });
    expect(onBuildingPlaced).toHaveBeenCalledTimes(1);
  });

  it('keeps building mode active after a failed placement', () => {
    const getSelectedTool = (): SelectedTool => ({
      kind: 'building',
      buildingType: 'extractor_basic',
    });
    const onBuildingPlaced = vi.fn();
    const placeBuilding = vi.spyOn(engine, 'placeBuilding').mockReturnValueOnce(null);
    const handler = new InputHandler(engine, getSelectedTool);
    handler.setBuildingPlacedCallback(onBuildingPlaced);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 });
    expect(onBuildingPlaced).not.toHaveBeenCalled();
  });

  it('does not select a building while building placement mode is active', () => {
    engine.placeBuilding('extractor_basic', { x: 0, y: 0 });
    const getSelectedTool = (): SelectedTool => ({
      kind: 'building',
      buildingType: 'extractor_basic',
    });
    const onBuildingSelected = vi.fn();
    const placeBuilding = vi.spyOn(engine, 'placeBuilding').mockReturnValueOnce(null);
    const handler = new InputHandler(engine, getSelectedTool);
    handler.setBuildingSelectedCallback(onBuildingSelected);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 });
    expect(onBuildingSelected).not.toHaveBeenCalled();
  });

  it('clears hover when the pointer leaves the canvas', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const onHoverChange = vi.fn();
    const handler = new InputHandler(engine, getSelectedTool);
    handler.setHoverCallback(onHoverChange);

    handler.onPointerMove(320, 240);
    handler.onPointerLeave();

    expect(onHoverChange).toHaveBeenLastCalledWith(null);
  });

  it('stops panning when the pointer leaves the canvas', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const handler = new InputHandler(engine, getSelectedTool);

    handler.onPointerDown(320, 240, 2);
    handler.onPointerLeave();

    const centerX = engine.viewport.centerX;
    const centerY = engine.viewport.centerY;

    handler.onPointerMove(360, 280);

    expect(engine.viewport.centerX).toBe(centerX);
    expect(engine.viewport.centerY).toBe(centerY);
  });
});
