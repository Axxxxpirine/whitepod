import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';
import {
  handleBuildingPlaced,
  handleEnergyLinkClick,
  selectedToolsEqual,
} from '@/components/energyLinkHandlers';
import { SOLAR_PANEL_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';

function makeEngine() {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  return engine;
}

describe('GameCanvas helpers', () => {
  it('treats energy-link mode as stable in tool comparison', () => {
    expect(selectedToolsEqual({ kind: 'energy_link' }, { kind: 'energy_link' })).toBe(true);
    expect(selectedToolsEqual({ kind: 'energy_link' }, { kind: 'select' })).toBe(false);
  });

  it('reuses the next click as a new source when the pending source was deleted', () => {
    const engine = makeEngine();
    const deletedSource = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    engine.grid.setResource(3, 1, ResourceType.IronOre);
    const clickedBuildingId = engine.placeBuilding('extractor_basic', { x: 3, y: 1 })!;
    expect(engine.removeBuilding(deletedSource)).toBe(true);

    const setPendingEnergyLinkSource = vi.fn();
    const setSelectedBuilding = vi.fn();
    const setSelectedTool = vi.fn();

    handleEnergyLinkClick(
      engine,
      {
        pendingEnergyLinkSource: deletedSource,
        setPendingEnergyLinkSource,
        setSelectedBuilding,
        setSelectedTool,
      },
      clickedBuildingId,
    );

    expect(setPendingEnergyLinkSource).toHaveBeenNthCalledWith(1, null);
    expect(setSelectedBuilding).toHaveBeenCalledWith(clickedBuildingId);
    expect(setPendingEnergyLinkSource).toHaveBeenNthCalledWith(2, clickedBuildingId);
    expect(setSelectedTool).not.toHaveBeenCalled();
  });

  it('returns to select mode after a successful second click', () => {
    const engine = makeEngine();
    const solarId = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    engine.grid.setResource(2, 1, ResourceType.IronOre);
    const extractorId = engine.placeBuilding('extractor_basic', { x: 2, y: 1 })!;

    const setPendingEnergyLinkSource = vi.fn();
    const setSelectedBuilding = vi.fn();
    const setSelectedTool = vi.fn();

    handleEnergyLinkClick(
      engine,
      {
        pendingEnergyLinkSource: solarId,
        setPendingEnergyLinkSource,
        setSelectedBuilding,
        setSelectedTool,
      },
      extractorId,
    );

    expect(engine.areBuildingsEnergyLinked(solarId, extractorId)).toBe(true);
    expect(setPendingEnergyLinkSource).toHaveBeenCalledWith(null);
    expect(setSelectedTool).toHaveBeenCalledWith({ kind: 'select' });
    expect(setSelectedBuilding).toHaveBeenCalledWith(solarId);
  });

  it('clears the pending source when an energy link change fails', () => {
    const engine = makeEngine();
    const solarId = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    engine.grid.setResource(2, 1, ResourceType.IronOre);
    const extractorId = engine.placeBuilding('extractor_basic', { x: 2, y: 1 })!;
    vi.spyOn(engine, 'connectBuildings').mockReturnValue(false);

    const setPendingEnergyLinkSource = vi.fn();
    const setSelectedBuilding = vi.fn();
    const setSelectedTool = vi.fn();

    handleEnergyLinkClick(
      engine,
      {
        pendingEnergyLinkSource: solarId,
        setPendingEnergyLinkSource,
        setSelectedBuilding,
        setSelectedTool,
      },
      extractorId,
    );

    expect(setPendingEnergyLinkSource).toHaveBeenCalledWith(null);
    expect(setSelectedTool).not.toHaveBeenCalled();
    expect(setSelectedBuilding).not.toHaveBeenCalled();
  });

  it('switches to energy-link mode after placing a solar panel when auto-link is enabled', () => {
    const setPendingEnergyLinkSource = vi.fn();
    const setSelectedBuilding = vi.fn();
    const setSelectedBuildingAnchor = vi.fn();
    const setSelectedTool = vi.fn();

    handleBuildingPlaced(
      {
        selectedTool: { kind: 'building', buildingType: SOLAR_PANEL_BUILDING_TYPE_ID },
        linkSolarOnPlacement: true,
        setPendingEnergyLinkSource,
        setSelectedBuilding,
        setSelectedBuildingAnchor,
        setSelectedTool,
      },
      42,
    );

    expect(setSelectedBuilding).toHaveBeenCalledWith(null);
    expect(setSelectedBuildingAnchor).toHaveBeenCalledWith(null);
    expect(setPendingEnergyLinkSource).toHaveBeenCalledWith(42);
    expect(setSelectedTool).toHaveBeenCalledWith({ kind: 'energy_link' });
  });
});
