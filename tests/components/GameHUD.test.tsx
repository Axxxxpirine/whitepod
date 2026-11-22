import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { GameHUD } from '@/components/GameHUD';
import { VIEW_STORAGE_KEY, WORLD_STORAGE_KEY } from '@/game/persistence/sessionStorage';
import { useGameStore } from '@/store/useGameStore';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { GameEngine } from '@/game/engine/GameEngine';
import { Direction, ResourceType, TileType } from '@/game/types';

function makeEngine() {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  return engine;
}

function countUncoveredResources(engine: GameEngine): number {
  let total = 0;
  const visible = engine.getVisibleTiles();
  for (let y = visible.y0; y <= visible.y1; y++) {
    for (let x = visible.x0; x <= visible.x1; x++) {
      if (engine.getResourceAt(x, y) === ResourceType.None) continue;
      if (engine.getBuildingAt(x, y) !== null) continue;
      total += 1;
    }
  }
  return total;
}

describe('GameHUD', () => {
  beforeEach(() => {
    useGameStore.setState({
      engine: null,
      simulationTime: 0,
      simulationSpeed: 1,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      hoverTile: { x: 12, y: 7 },
      selectedTool: { kind: 'select' },
      selectedBuildingId: null,
      selectedBuildingAnchor: null,
      selectedResourceTile: null,
      selectedResourceAnchor: null,
      beltPreview: null,
      currentBuildingRotation: Direction.North,
      sessionEpoch: 0,
      pendingEnergyLinkSource: null,
      linkSolarOnPlacement: true,
      idleSummary: null,
      selectedBotProfileId: 'master',
      seedInput: '42',
      botControls: null,
      bot: {
        active: false,
        phase: 'idle',
        target: null,
      },
    });
    const local = window.localStorage as unknown;
    if (
      typeof local === 'object' &&
      local !== null &&
      typeof (local as Storage).clear === 'function'
    ) {
      (local as Storage).clear();
    }
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

  it('rotation button was removed from the HUD (R key still works via GameCanvas)', () => {
    useGameStore.setState({
      selectedTool: { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID },
      currentBuildingRotation: Direction.North,
    });

    render(<GameHUD />);

    expect(screen.queryByRole('button', { name: /Rotation/ })).not.toBeInTheDocument();
  });

  it('renders the selected building panel when a building is selected', () => {
    const engine = makeEngine();
    engine.grid.setResource(8, 8, ResourceType.Hydrogen);
    const buildingId = engine.placeBuilding('extractor_basic', { x: 8, y: 8 })!;
    useGameStore.setState({
      engine,
      selectedBuildingId: buildingId,
      selectedBuildingAnchor: { x: 120, y: 160 },
    });

    render(<GameHUD />);

    expect(screen.getByRole('heading', { name: 'Extracteur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer le bâtiment' })).toBeInTheDocument();
  });

  it('renders processor recipes as cards in the selected building panel and widens the panel', () => {
    const engine = makeEngine();
    const buildingId = engine.placeBuilding(CONVERTER_BUILDING_TYPE_ID, { x: 8, y: 8 })!;
    useGameStore.setState({
      engine,
      selectedBuildingId: buildingId,
      selectedBuildingAnchor: { x: 120, y: 160 },
    });

    render(<GameHUD />);

    expect(screen.getByRole('button', { name: 'Recette Oxyde de fer' })).toBeInTheDocument();
    expect(screen.getByText('1x Régolithe')).toBeInTheDocument();
    expect(screen.queryByText('Oxydation (fer)')).not.toBeInTheDocument();
    expect(screen.queryByText(/\(\d+s\)/)).not.toBeInTheDocument();

    const heading = screen.getByRole('heading', { name: 'Convertisseur' });
    const panel = heading.parentElement?.parentElement;
    expect(panel).not.toBeNull();
    expect(panel).toHaveClass('w-[280px]');
  });

  it('renders the selected resource tooltip when a deposit is selected', () => {
    const engine = makeEngine();
    engine.placeResource(8, 8, ResourceType.Hydrogen);
    useGameStore.setState({
      engine,
      selectedTool: { kind: 'select' },
      selectedResourceTile: { x: 8, y: 8 },
      selectedResourceAnchor: { x: 120, y: 160 },
    });

    render(<GameHUD />);

    expect(screen.getByRole('tooltip', { name: 'Hydrogène' })).toBeInTheDocument();
  });

  it('hides the selected resource tooltip outside select mode', () => {
    const engine = makeEngine();
    engine.placeResource(8, 8, ResourceType.Hydrogen);
    useGameStore.setState({
      engine,
      selectedTool: { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID },
      selectedResourceTile: { x: 8, y: 8 },
      selectedResourceAnchor: { x: 120, y: 160 },
    });

    render(<GameHUD />);

    expect(screen.queryByText('Hydrogène')).not.toBeInTheDocument();
  });

  it('hides the selected resource tooltip when the deposit is removed', () => {
    const engine = makeEngine();
    engine.placeResource(8, 8, ResourceType.Hydrogen);
    useGameStore.setState({
      engine,
      selectedTool: { kind: 'select' },
      selectedResourceTile: { x: 8, y: 8 },
      selectedResourceAnchor: { x: 120, y: 160 },
    });

    const { rerender } = render(<GameHUD />);
    expect(screen.getByText('Hydrogène')).toBeInTheDocument();

    engine.removeResource(8, 8);
    useGameStore.setState({ selectedResourceAnchor: { x: 121, y: 160 } });
    rerender(<GameHUD />);

    expect(screen.queryByText('Hydrogène')).not.toBeInTheDocument();
  });

  it('hides the selected resource tooltip when a building covers the deposit', () => {
    const engine = makeEngine();
    engine.placeResource(8, 8, ResourceType.Hydrogen);
    useGameStore.setState({
      engine,
      selectedTool: { kind: 'select' },
      selectedResourceTile: { x: 8, y: 8 },
      selectedResourceAnchor: { x: 120, y: 160 },
    });

    const { rerender } = render(<GameHUD />);
    expect(screen.getByText('Hydrogène')).toBeInTheDocument();

    engine.placeBuilding('extractor_basic', { x: 8, y: 8 });
    useGameStore.setState({ selectedResourceAnchor: { x: 122, y: 160 } });
    rerender(<GameHUD />);

    expect(screen.queryByText('Hydrogène')).not.toBeInTheDocument();
  });

  it('deletes the selected building and closes the panel', () => {
    const engine = makeEngine();
    engine.grid.setResource(8, 8, ResourceType.Hydrogen);
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
    engine.grid.setResource(8, 8, ResourceType.Hydrogen);
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
    engine.grid.setResource(8, 8, ResourceType.Hydrogen);
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

  it('keeps the console toggle working via settings popover', () => {
    render(<GameHUD />);

    // Open settings popover, then click Console
    fireEvent.click(screen.getByRole('button', { name: 'Paramètres' }));
    fireEvent.click(screen.getByRole('button', { name: /Console/ }));
    expect(screen.getByPlaceholderText('engine.placeResource(10, 10, 1)')).toBeInTheDocument();
  });

  it('resets the session from the settings popover', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    window.localStorage.setItem(WORLD_STORAGE_KEY, 'world');
    window.localStorage.setItem(VIEW_STORAGE_KEY, 'view');
    useGameStore.setState({
      selectedTool: { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID },
      selectedBuildingId: 12,
      selectedBuildingAnchor: { x: 120, y: 160 },
      beltPreview: { kind: 'belt', isValid: true, tiles: [], cost: [], missing: [] },
      currentBuildingRotation: Direction.South,
    });

    render(<GameHUD />);

    // Open settings popover, then click Reset session
    fireEvent.click(screen.getByRole('button', { name: 'Paramètres' }));
    fireEvent.click(screen.getByRole('button', { name: /Reset session/ }));

    expect(confirm).toHaveBeenCalled();
    expect(useGameStore.getState().sessionEpoch).toBe(1);
    expect(useGameStore.getState().selectedTool).toEqual({ kind: 'select' });
    expect(useGameStore.getState().selectedBuildingId).toBeNull();
    expect(useGameStore.getState().selectedBuildingAnchor).toBeNull();
    expect(useGameStore.getState().beltPreview).toBeNull();
    expect(useGameStore.getState().currentBuildingRotation).toBe(Direction.North);
    expect(useGameStore.getState().selectedBotProfileId).toBe('master');
    expect(useGameStore.getState().seedInput).toBe('42');
    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
  });

  it('starts and stops the selected bot manually', () => {
    const start = vi.fn();
    const stop = vi.fn();
    useGameStore.setState({ botControls: { start, stop } });

    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(start).toHaveBeenCalled();

    act(() => {
      useGameStore.setState({ bot: { active: true, phase: 'mining', target: 'scan' } });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(stop).toHaveBeenCalled();
  });

  it('updates the bot profile and seed before reset', () => {
    useGameStore.setState({ selectedBotProfileId: 'master', seedInput: '42' });

    render(<GameHUD />);

    fireEvent.change(screen.getByLabelText('Bot profile'), { target: { value: 'connector' } });
    fireEvent.change(screen.getByLabelText('Seed input'), { target: { value: '77' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply/ }));

    expect(useGameStore.getState().selectedBotProfileId).toBe('connector');
    expect(useGameStore.getState().seedInput).toBe('77');
    expect(useGameStore.getState().sessionEpoch).toBe(1);
  });

  it('updates SFX volume from the settings popover', () => {
    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Paramètres' }));
    fireEvent.change(screen.getByLabelText('SFX volume'), { target: { value: '0.42' } });

    expect(useGameStore.getState().sfxVolume).toBeCloseTo(0.42);
  });

  it('shows simulation time in the HUD panel', () => {
    const engine = makeEngine();
    useGameStore.setState({ engine, simulationTime: 0.5 });
    render(<GameHUD />);

    expect(screen.getByText(/12:00/)).toBeInTheDocument();
  });

  it('renders explicit global energy labels and storage totals', () => {
    const engine = makeEngine();
    engine.simulationTime = 0.5;
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 8, y: 8 })!;
    engine.placeResource(9, 8, ResourceType.Hydrogen);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 9, y: 8 })!;
    const batteryId = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 11, y: 8 })!;
    engine.connectBuildings(solarId, extractorId);
    engine.connectBuildings(solarId, batteryId);
    engine.batteryCharges.set(batteryId, 1.7);

    useGameStore.setState({ engine, simulationTime: 0.5 });
    render(<GameHUD />);

    expect(screen.getByText('Surplus')).toBeInTheDocument();
    expect(screen.getByText('+6 kW')).toBeInTheDocument();
    expect(screen.getByText('Prod. 10 kW')).toBeInTheDocument();
    expect(screen.getByText('Utilisée 4 kW')).toBeInTheDocument();
    expect(screen.getByText('Demande 4 kW')).toBeInTheDocument();
    expect(screen.queryByText('Non servie 0 kW')).not.toBeInTheDocument();
    expect(screen.getByText('Stockage 1.7 / 10 kWh')).toBeInTheDocument();
  });

  it('shows deficit and unmet demand without ambiguous energy labels', () => {
    const engine = makeEngine();
    engine.simulationTime = 0.5;
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 8, y: 8 })!;
    const batteryId = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 10, y: 8 })!;
    engine.placeResource(13, 8, ResourceType.Regolith);
    engine.placeResource(15, 8, ResourceType.Hydrogen);
    engine.placeResource(17, 8, ResourceType.Oxygen);
    const extractorA = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 13, y: 8 })!;
    const extractorB = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 15, y: 8 })!;
    const extractorC = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 17, y: 8 })!;
    engine.connectBuildings(solarId, batteryId);
    engine.connectBuildings(solarId, extractorA);
    engine.connectBuildings(solarId, extractorB);
    engine.connectBuildings(solarId, extractorC);
    engine.batteryCharges.set(batteryId, 10);

    useGameStore.setState({ engine, simulationTime: 0.5 });
    render(<GameHUD />);

    expect(screen.getByText('Déficit')).toBeInTheDocument();
    expect(screen.getByText('-2 kW')).toBeInTheDocument();
    expect(screen.getByText('Prod. 10 kW')).toBeInTheDocument();
    expect(screen.getByText('Utilisée 12 kW')).toBeInTheDocument();
    expect(screen.getByText('Demande 12 kW')).toBeInTheDocument();
    expect(screen.queryByText('Non servie 0 kW')).not.toBeInTheDocument();
    expect(screen.queryByText('↑')).not.toBeInTheDocument();
    expect(screen.queryByText('↓')).not.toBeInTheDocument();
  });

  it('uses explicit solar network wording in the selected building panel', () => {
    const engine = makeEngine();
    engine.simulationTime = 0.5;
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 8, y: 8 })!;
    engine.placeResource(9, 8, ResourceType.Hydrogen);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 9, y: 8 })!;
    engine.connectBuildings(solarId, extractorId);

    useGameStore.setState({
      engine,
      simulationTime: 0.5,
      selectedBuildingId: solarId,
      selectedBuildingAnchor: { x: 120, y: 160 },
    });
    render(<GameHUD />);

    expect(screen.getByText('Surplus reseau')).toBeInTheDocument();
    expect(screen.getByText('Demande 4 kW')).toBeInTheDocument();
    expect(screen.queryByText('Bilan reseau')).not.toBeInTheDocument();
  });

  it('opens debug panel and allows simulation presets', () => {
    const engine = makeEngine();
    useGameStore.setState({ engine, simulationTime: 0 });
    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: '▼' }));
    fireEvent.click(screen.getByRole('button', { name: 'Midi' }));

    expect(useGameStore.getState().simulationTime).toBe(0.5);
    expect(engine.simulationTime).toBe(0.5);
  });

  it('updates simulation speed from debug panel', () => {
    const engine = makeEngine();
    useGameStore.setState({ engine, simulationSpeed: 1 });
    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: '▼' }));
    fireEvent.click(screen.getByRole('button', { name: '4x' }));

    expect(useGameStore.getState().simulationSpeed).toBe(4);
  });

  it('shows scenario generator actions in the debug panel', () => {
    const engine = makeEngine();
    useGameStore.setState({ engine, simulationTime: 0 });
    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: '▼' }));

    expect(screen.getByText('Scenario Generator')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Simple/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Medium/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Complex/i })).toBeInTheDocument();
  });

  it('generates a playable starter scenario from the debug panel', () => {
    const engine = makeEngine();
    useGameStore.setState({ engine, simulationTime: 0 });
    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: '▼' }));
    fireEvent.click(screen.getByRole('button', { name: /Simple/i }));

    const state = useGameStore.getState();
    expect(state.engine?.getBuildings().size).toBeGreaterThanOrEqual(9);
    expect(state.selectedTool).toEqual({ kind: 'select' });
    expect(state.simulationTime).toBeGreaterThan(0);
    expect(state.sessionEpoch).toBe(1);
    expect(state.engine?.getResourceCounts().regolith ?? 0).toBeGreaterThan(0);
    expect(state.engine?.getResourceCounts().hydrogen ?? 0).toBeGreaterThan(0);
    expect(countUncoveredResources(state.engine!)).toBeGreaterThanOrEqual(3);
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
  });
});
