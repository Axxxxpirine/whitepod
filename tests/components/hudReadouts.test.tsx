import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuildingStatsPanel } from '@/components/BuildingStatsPanel';
import { selectedToolsEqual } from '@/components/energyLinkHandlers';
import { SelectedBuildingPanel } from '@/components/hud/SelectedBuildingPanel';
import { SelectedResourceTooltip } from '@/components/hud/SelectedResourceTooltip';
import { StartScreen } from '@/components/StartScreen';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { InputHandler } from '@/game/engine/InputHandler';
import { clearPersistedSession } from '@/game/persistence/sessionStorage';
import { Direction, ResourceType, TileType, type BuildingId } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

function makeEngine(gameMode: GameMode = GameMode.Sandbox) {
  const engine = new GameEngine(640, 480, { gameMode });
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.setSimulationTime(0.5);
  return engine;
}

function panel(engine: GameEngine, id: BuildingId) {
  return <BuildingStatsPanel building={engine.getBuildings().get(id)!} engine={engine} worldTick={0} energyVersion={0} />;
}

function belt(engine: GameEngine, from: [BuildingId, string], to: [BuildingId, string]): BuildingId[] {
  const result = engine.placeBelt({ building: from[0], port: from[1] }, { building: to[0], port: to[1] });
  if (!result.ok) throw new Error(`belt refused: ${result.reason}`);
  return [...result.segmentIds];
}

describe('HUD readouts', () => {
  beforeEach(() => {
    clearPersistedSession();
    useGameStore.setState({
      engine: null,
      selectedTool: { kind: 'select' },
      selectedBuildingId: null,
      selectedBuildingAnchor: null,
      selectedResourceTile: null,
      selectedResourceAnchor: null,
      pendingEnergyLinkSource: null,
      startScreenOpen: true,
      sessionStarted: false,
      seedInput: '42',
    });
  });

  it('tells an extractor nothing is linked to from one its network cannot feed', () => {
    const engine = makeEngine();
    engine.placeResource(10, 10, ResourceType.Regolith);
    const extractor = engine.placeBuilding('extractor_basic', { x: 10, y: 10 })!;

    const { rerender } = render(panel(engine, extractor));
    expect(screen.getByText('Non relié')).toBeInTheDocument();

    // Linked to a panel, but at night: the network exists and gives nothing.
    const solar = engine.placeBuilding('solar_panel', { x: 12, y: 10 })!;
    engine.connectBuildings(solar, extractor);
    engine.setSimulationTime(0);
    rerender(<BuildingStatsPanel building={engine.getBuildings().get(extractor)!} engine={engine} worldTick={1} energyVersion={1} />);
    expect(screen.getByText('Non alimenté')).toBeInTheDocument();

    engine.setSimulationTime(0.5);
    rerender(<BuildingStatsPanel building={engine.getBuildings().get(extractor)!} engine={engine} worldTick={2} energyVersion={1} />);
    expect(screen.getByText('Alimenté')).toBeInTheDocument();
    expect(screen.getByText('Énergie')).toBeInTheDocument();
    expect(screen.getByText('Débit')).toBeInTheDocument();
  });

  it('lists every resource entering a merger, and a machine by what it makes', () => {
    const engine = makeEngine();
    engine.placeResource(10, 8, ResourceType.Hydrogen);
    engine.placeResource(10, 14, ResourceType.Regolith);
    const hydrogen = engine.placeBuilding('extractor_basic', { x: 10, y: 8 })!;
    const regolith = engine.placeBuilding('extractor_basic', { x: 10, y: 14 })!;
    const converter = engine.placeBuilding('converter_basic', { x: 14, y: 13 })!;
    const merger = engine.placeBuilding('merger_basic', { x: 22, y: 11 })!;
    const storage = engine.placeBuilding('storage_basic', { x: 28, y: 10 })!;
    const solar = engine.placeBuilding('solar_panel', { x: 10, y: 20 })!;
    const solar2 = engine.placeBuilding('solar_panel', { x: 11, y: 20 })!;
    for (const id of [hydrogen, regolith, converter, solar2]) engine.connectBuildings(solar, id);
    belt(engine, [hydrogen, 'out_east'], [merger, 'in_north']);
    belt(engine, [regolith, 'out_east'], [converter, 'in']);
    belt(engine, [converter, 'out'], [merger, 'in_south']);
    belt(engine, [merger, 'out_east'], [storage, 'in_west']);
    engine.setProcessorRecipe(converter, 'iron_oxide');

    render(panel(engine, merger));

    // Not "Régolithe" (what feeds the converter), and not just the first extractor found.
    expect(screen.getByText('Oxyde de fer, Hydrogène')).toBeInTheDocument();
    expect(screen.getByText('Entrées')).toBeInTheDocument();
  });

  it('names a belt piece "Convoyeur", whatever its shape', () => {
    const engine = makeEngine();
    engine.placeResource(10, 10, ResourceType.Regolith);
    const extractor = engine.placeBuilding('extractor_basic', { x: 10, y: 10 })!;
    const storage = engine.placeBuilding('storage_basic', { x: 16, y: 14 })!;
    const segments = belt(engine, [extractor, 'out_east'], [storage, 'in_north']);
    const corner = segments.find((id) => engine.getBuildings().get(id)!.typeId !== 'belt_straight')!;
    expect(corner).toBeDefined();

    useGameStore.setState({ engine, selectedBuildingId: corner, selectedBuildingAnchor: { x: 100, y: 100 } });
    render(<SelectedBuildingPanel />);

    expect(screen.getByRole('heading', { name: 'Convoyeur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supprimer le convoyeur' })).toBeInTheDocument();
  });

  it('writes a deposit amount in the singular and says when it is exhausted', () => {
    const engine = makeEngine(GameMode.Campaign);
    // Next to the map centre: no rich vein there.
    engine.grid.setResource(130, 130, ResourceType.Oxygen, 1);
    useGameStore.setState({ engine, selectedResourceTile: { x: 130, y: 130 }, selectedResourceAnchor: { x: 100, y: 100 } });

    const { rerender } = render(<SelectedResourceTooltip />);
    expect(screen.getByText('Oxygène · 1 unité')).toBeInTheDocument();

    engine.grid.resourceAmount[130 * 256 + 130] = 0;
    useGameStore.setState({ selectedResourceAnchor: { x: 101, y: 100 } });
    rerender(<SelectedResourceTooltip />);
    expect(screen.getByText('Oxygène · épuisé')).toBeInTheDocument();
  });

  it('shows the new-game entries as unavailable while the seed is not a number', () => {
    useGameStore.setState({ seedInput: 'abc' });
    render(<StartScreen />);

    const campaign = screen.getByRole('button', { name: /Nouvelle campagne/ });
    expect(campaign).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: /Bac à sable/ })).toHaveAttribute('aria-disabled', 'true');
    campaign.click();
    expect(useGameStore.getState().sessionStarted).toBe(false);
  });

  it('says on the start screen when the saved game could not be read back', () => {
    useGameStore.setState({ saveUnreadable: true });
    render(<StartScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent("La partie enregistrée n'a pas pu être relue. Elle est conservée");
    useGameStore.setState({ saveUnreadable: false });
  });

  it('treats the basic and the fast belt tools as different tools', () => {
    expect(selectedToolsEqual({ kind: 'belt' }, { kind: 'belt', tier: 'basic' })).toBe(true);
    expect(selectedToolsEqual({ kind: 'belt', tier: 'basic' }, { kind: 'belt', tier: 'fast' })).toBe(false);
  });

  it('zooms with Shift+wheel when the browser reports the wheel as horizontal', () => {
    const engine = makeEngine();
    const handler = new InputHandler(engine, () => ({ kind: 'select' }), () => Direction.North);

    // macOS: Shift turns the vertical wheel into deltaX, deltaY stays 0.
    handler.onWheel(320, 240, -100, 0, false, 0, true);
    expect(engine.viewport.zoom).toBeGreaterThan(1);
    handler.onWheel(320, 240, 100, 0, false, 0, true);
    handler.onWheel(320, 240, 100, 0, false, 0, true);
    expect(engine.viewport.zoom).toBeLessThan(1);
  });
});
