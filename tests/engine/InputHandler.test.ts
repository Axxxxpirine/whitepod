import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InputHandler } from '@/game/engine/InputHandler';
import { GameEngine } from '@/game/engine/GameEngine';
import { tileCenterToIso } from '@/game/engine/IsoTransform';
import { Direction, ResourceType, TileType, type SelectedTool } from '@/game/types';
import { SOLAR_PANEL_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';

function makeEngine() {
  const engine = new GameEngine(640, 480);
  // Center the iso viewport on tile (0, 0) so screen-center clicks land on it.
  const center = tileCenterToIso(0, 0);
  engine.viewport.centerX = center.wx;
  engine.viewport.centerY = center.wy;
  return engine;
}

describe('InputHandler', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = makeEngine();
  });

  it('selects a building when the selected tool is select', () => {
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    engine.placeBuilding('placeholder_1x1', { x: 0, y: 0 });
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const onBuildingSelected = vi.fn();
    const onResourceSelected = vi.fn();
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);
    handler.setBuildingSelectedCallback(onBuildingSelected);
    handler.setResourceSelectedCallback(onResourceSelected);

    handler.onPointerDown(320, 240, 0);

    expect(onBuildingSelected).toHaveBeenCalledWith(1);
    expect(onResourceSelected).toHaveBeenCalledWith(null);
  });

  it('places the selected building when the selected tool is a building', () => {
    const getSelectedTool = (): SelectedTool => ({
      kind: 'building',
      buildingType: 'extractor_basic',
    });
    const placeBuilding = vi.spyOn(engine, 'placeBuilding');
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.South);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 }, Direction.South);
  });

  it('returns null when selecting an empty tile', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const onBuildingSelected = vi.fn();
    const onResourceSelected = vi.fn();
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);
    handler.setBuildingSelectedCallback(onBuildingSelected);
    handler.setResourceSelectedCallback(onResourceSelected);

    handler.onPointerDown(320, 240, 0);

    expect(onBuildingSelected).toHaveBeenCalledWith(null);
    expect(onResourceSelected).toHaveBeenCalledWith(null);
  });

  it('selects a resource deposit when the selected tool is select', () => {
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    engine.placeResource(0, 0, ResourceType.Hydrogen);
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const onBuildingSelected = vi.fn();
    const onResourceSelected = vi.fn();
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);
    handler.setBuildingSelectedCallback(onBuildingSelected);
    handler.setResourceSelectedCallback(onResourceSelected);

    handler.onPointerDown(320, 240, 0);

    expect(onBuildingSelected).toHaveBeenCalledWith(null);
    expect(onResourceSelected).toHaveBeenCalledWith({ x: 0, y: 0 });
  });

  it('places the selected building when the selected tool is building', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'building', buildingType: 'extractor_basic' });
    const placeBuilding = vi.spyOn(engine, 'placeBuilding');
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 }, Direction.North);
  });

  it('emits building id on successful placement', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'building', buildingType: 'extractor_basic' });
    const onBuildingPlaced = vi.fn();
    const placeBuilding = vi.spyOn(engine, 'placeBuilding').mockReturnValueOnce(1);
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);
    handler.setBuildingPlacedCallback(onBuildingPlaced);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 }, Direction.North);
    expect(onBuildingPlaced).toHaveBeenCalledWith(1);
  });

  it('does not emit placement callback when placement fails', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'building', buildingType: 'extractor_basic' });
    const onBuildingPlaced = vi.fn();
    const placeBuilding = vi.spyOn(engine, 'placeBuilding').mockReturnValueOnce(null);
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);
    handler.setBuildingPlacedCallback(onBuildingPlaced);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 }, Direction.North);
    expect(onBuildingPlaced).not.toHaveBeenCalled();
  });

  it('emits clicked building id in energy link mode', () => {
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    const source = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 0, y: 0 })!;
    const getSelectedTool = (): SelectedTool => ({ kind: 'energy_link' });
    const onEnergyLinkClick = vi.fn();
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);
    handler.setEnergyLinkClickCallback(onEnergyLinkClick);

    handler.onPointerDown(320, 240, 0);

    expect(onEnergyLinkClick).toHaveBeenCalledWith(source);
  });

  it('starts panning on right click without selecting anything', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const onBuildingSelected = vi.fn();
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);
    handler.setBuildingSelectedCallback(onBuildingSelected);

    // Move the viewport away from iso world bounds before panning so the pan
    // delta isn't clamped to zero on either axis.
    const center = tileCenterToIso(50, 50);
    engine.viewport.centerX = center.wx;
    engine.viewport.centerY = center.wy;
    const initialCenterX = engine.viewport.centerX;
    const initialCenterY = engine.viewport.centerY;
    handler.onPointerDown(320, 240, 2);
    handler.onPointerMove(340, 255);

    expect(onBuildingSelected).not.toHaveBeenCalled();
    expect(engine.viewport.centerX).not.toBe(initialCenterX);
    expect(engine.viewport.centerY).not.toBe(initialCenterY);
  });

  it('zooms on wheel input with ctrlKey', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);
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
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.West);
    handler.setBuildingPlacedCallback(onBuildingPlaced);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 }, Direction.West);
    expect(onBuildingPlaced).toHaveBeenCalledTimes(1);
  });

  it('keeps building mode active after a failed placement', () => {
    const getSelectedTool = (): SelectedTool => ({
      kind: 'building',
      buildingType: 'extractor_basic',
    });
    const onBuildingPlaced = vi.fn();
    const placeBuilding = vi.spyOn(engine, 'placeBuilding').mockReturnValueOnce(null);
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.East);
    handler.setBuildingPlacedCallback(onBuildingPlaced);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 }, Direction.East);
    expect(onBuildingPlaced).not.toHaveBeenCalled();
  });

  it('does not select a building while building placement mode is active', () => {
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    engine.placeBuilding('placeholder_1x1', { x: 0, y: 0 });
    const getSelectedTool = (): SelectedTool => ({
      kind: 'building',
      buildingType: 'extractor_basic',
    });
    const onBuildingSelected = vi.fn();
    const placeBuilding = vi.spyOn(engine, 'placeBuilding').mockReturnValueOnce(null);
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);
    handler.setBuildingSelectedCallback(onBuildingSelected);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).toHaveBeenCalledWith('extractor_basic', { x: 0, y: 0 }, Direction.North);
    expect(onBuildingSelected).not.toHaveBeenCalled();
  });

  it('ignores the belt tool in the input handler', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'belt' });
    const placeBuilding = vi.spyOn(engine, 'placeBuilding');
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);

    handler.onPointerDown(320, 240, 0);

    expect(placeBuilding).not.toHaveBeenCalled();
  });

  it('clears hover when the pointer leaves the canvas', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const onHoverChange = vi.fn();
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);
    handler.setHoverCallback(onHoverChange);

    handler.onPointerMove(320, 240);
    handler.onPointerLeave();

    expect(onHoverChange).toHaveBeenLastCalledWith(null);
  });

  it('stops panning when the pointer leaves the canvas', () => {
    const getSelectedTool = (): SelectedTool => ({ kind: 'select' });
    const handler = new InputHandler(engine, getSelectedTool, () => Direction.North);

    handler.onPointerDown(320, 240, 2);
    handler.onPointerLeave();

    const centerX = engine.viewport.centerX;
    const centerY = engine.viewport.centerY;

    handler.onPointerMove(360, 280);

    expect(engine.viewport.centerX).toBe(centerX);
    expect(engine.viewport.centerY).toBe(centerY);
  });
});
