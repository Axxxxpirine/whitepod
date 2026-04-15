import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GameHUD } from '@/components/GameHUD';
import { VIEW_STORAGE_KEY, WORLD_STORAGE_KEY } from '@/game/persistence/sessionStorage';
import { useGameStore } from '@/store/useGameStore';
import { EXTRACTOR_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { GameEngine } from '@/game/engine/GameEngine';
import { Direction, ResourceType, TileType } from '@/game/types';

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
      beltPreview: null,
      currentBuildingRotation: Direction.North,
      sessionEpoch: 0,
      pendingEnergyLinkSource: null,
      linkSolarOnPlacement: true,
    });
    window.sessionStorage.clear();
  });

  it('renders the bottom navbar with the placement buttons', () => {
    render(<GameHUD />);

    expect(screen.getByRole('button', { name: 'Extracteur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Convoyeur' })).toBeInTheDocument();
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

  it('activates belt placement on first click', () => {
    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Convoyeur' }));

    expect(useGameStore.getState().selectedTool).toEqual({ kind: 'belt' });
    expect(screen.getByRole('button', { name: 'Convoyeur' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('toggles belt placement back to select mode on second click', () => {
    useGameStore.setState({
      selectedTool: { kind: 'belt' },
    });

    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Convoyeur' }));

    expect(useGameStore.getState().selectedTool).toEqual({ kind: 'select' });
    expect(screen.getByRole('button', { name: 'Convoyeur' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('rotates building placement from the HUD', () => {
    useGameStore.setState({
      selectedTool: { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID },
      currentBuildingRotation: Direction.North,
    });

    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Rotation: N' }));

    expect(useGameStore.getState().currentBuildingRotation).toBe(Direction.East);
    expect(screen.getByRole('button', { name: 'Rotation: E' })).toBeInTheDocument();
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

  it('clears the selected building panel when switching tools', () => {
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

  it('clears pending energy-link source when deleting the selected building', () => {
    const engine = makeEngine();
    engine.grid.setResource(8, 8, ResourceType.IronOre);
    const buildingId = engine.placeBuilding('extractor_basic', { x: 8, y: 8 })!;
    useGameStore.setState({
      engine,
      selectedBuildingId: buildingId,
      selectedBuildingAnchor: { x: 120, y: 160 },
      pendingEnergyLinkSource: buildingId,
    });

    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer le bâtiment' }));

    expect(useGameStore.getState().pendingEnergyLinkSource).toBeNull();
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
      beltPreview: { kind: 'belt', isValid: true, tiles: [] },
      currentBuildingRotation: Direction.South,
    });

    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    expect(confirm).toHaveBeenCalled();
    expect(useGameStore.getState().sessionEpoch).toBe(1);
    expect(useGameStore.getState().selectedTool).toEqual({ kind: 'select' });
    expect(useGameStore.getState().selectedBuildingId).toBeNull();
    expect(useGameStore.getState().selectedBuildingAnchor).toBeNull();
    expect(useGameStore.getState().beltPreview).toBeNull();
    expect(useGameStore.getState().currentBuildingRotation).toBe(Direction.North);
    expect(window.sessionStorage.getItem(WORLD_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
  });

  it('shows global electricity card in the top-right area', () => {
    const engine = makeEngine();
    const solar = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    engine.grid.setResource(2, 1, ResourceType.IronOre);
    const extractorPowered = engine.placeBuilding('extractor_basic', { x: 2, y: 1 })!;
    engine.connectBuildings(solar, extractorPowered);
    engine.grid.setResource(6, 6, ResourceType.IronOre);
    engine.placeBuilding('extractor_basic', { x: 6, y: 6 })!;

    useGameStore.setState({ engine });
    render(<GameHUD />);

    expect(screen.getByText('Production électrique: 8kwh')).toBeInTheDocument();
    expect(screen.getByText('Consommation électrique: 5kwh')).toBeInTheDocument();
    expect(screen.getByText('Consommation restante: -2kwh')).toBeInTheDocument();
  });
});
