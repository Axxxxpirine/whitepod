import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GameHUD } from '@/components/GameHUD';
import { VIEW_STORAGE_KEY, WORLD_STORAGE_KEY } from '@/game/persistence/sessionStorage';
import { useGameStore } from '@/store/useGameStore';
import { EXTRACTOR_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';

function makeEngine() {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  return engine;
}

describe('GameHUD', () => {
  beforeEach(() => {
    useGameStore.setState({
      engine: null,
      hoverTile: { x: 12, y: 7 },
      selectedTool: { kind: 'select' },
      selectedBuildingId: null,
      selectedBuildingAnchor: null,
      sessionEpoch: 0,
    });
    window.sessionStorage.clear();
  });

  it('renders the bottom navbar with the extractor button', () => {
    render(<GameHUD />);

    expect(screen.getByRole('button', { name: 'Extracteur' })).toBeInTheDocument();
    expect(screen.getByText('12, 7')).toBeInTheDocument();
  });

  it('activates extractor placement on first click', () => {
    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Extracteur' }));

    expect(useGameStore.getState().selectedTool).toEqual({
      kind: 'building',
      buildingType: EXTRACTOR_BUILDING_TYPE_ID,
    });
    expect(screen.getByRole('button', { name: 'Extracteur' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles back to select mode on second click', () => {
    useGameStore.setState({
      selectedTool: { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID },
    });

    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Extracteur' }));

    expect(useGameStore.getState().selectedTool).toEqual({ kind: 'select' });
    expect(screen.getByRole('button', { name: 'Extracteur' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders the selected building panel when a building is selected', () => {
    const engine = makeEngine();
    engine.grid.setResource(8, 8, ResourceType.IronOre);
    const buildingId = engine.placeBuilding('extractor_basic', { x: 8, y: 8 })!;
    useGameStore.setState({
      engine,
      selectedBuildingId: buildingId,
      selectedBuildingAnchor: { x: 120, y: 160 },
    });

    render(<GameHUD />);

    expect(screen.getByText('Extracteur', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer le bâtiment' })).toBeInTheDocument();
  });

  it('deletes the selected building and closes the panel', () => {
    const engine = makeEngine();
    engine.grid.setResource(8, 8, ResourceType.IronOre);
    const buildingId = engine.placeBuilding('extractor_basic', { x: 8, y: 8 })!;
    const removeBuilding = vi.spyOn(engine, 'removeBuilding');
    useGameStore.setState({
      engine,
      selectedBuildingId: buildingId,
      selectedBuildingAnchor: { x: 120, y: 160 },
    });

    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le bâtiment' }));

    expect(removeBuilding).toHaveBeenCalledWith(buildingId);
    expect(useGameStore.getState().selectedBuildingId).toBeNull();
    expect(useGameStore.getState().selectedBuildingAnchor).toBeNull();
    expect(screen.queryByRole('button', { name: 'Supprimer le bâtiment' })).not.toBeInTheDocument();
  });

  it('clears the selected building panel when switching to placement mode', () => {
    const engine = makeEngine();
    engine.grid.setResource(8, 8, ResourceType.IronOre);
    const buildingId = engine.placeBuilding('extractor_basic', { x: 8, y: 8 })!;
    useGameStore.setState({
      engine,
      selectedBuildingId: buildingId,
      selectedBuildingAnchor: { x: 120, y: 160 },
    });

    render(<GameHUD />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Extracteur' })[0]);

    expect(useGameStore.getState().selectedBuildingId).toBeNull();
    expect(useGameStore.getState().selectedBuildingAnchor).toBeNull();
    expect(screen.queryByRole('button', { name: 'Supprimer le bâtiment' })).not.toBeInTheDocument();
  });

  it('keeps the console toggle working', () => {
    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: '>_' }));
    expect(screen.getByPlaceholderText('engine.placeResource(10, 10, 1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByPlaceholderText('engine.placeResource(10, 10, 1)')).not.toBeInTheDocument();
  });

  it('resets the session from the HUD', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    window.sessionStorage.setItem(WORLD_STORAGE_KEY, 'world');
    window.sessionStorage.setItem(VIEW_STORAGE_KEY, 'view');
    useGameStore.setState({
      selectedTool: { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID },
      selectedBuildingId: 12,
      selectedBuildingAnchor: { x: 120, y: 160 },
    });

    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(confirm).toHaveBeenCalled();
    expect(useGameStore.getState().sessionEpoch).toBe(1);
    expect(useGameStore.getState().selectedTool).toEqual({ kind: 'select' });
    expect(useGameStore.getState().selectedBuildingId).toBeNull();
    expect(useGameStore.getState().selectedBuildingAnchor).toBeNull();
    expect(window.sessionStorage.getItem(WORLD_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
  });
});
