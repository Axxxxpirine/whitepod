import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolModeIndicator } from '@/components/hud/ToolModeIndicator';
import { EXTRACTOR_BUILDING_TYPE_ID, STORAGE_BUILDING_TYPE_ID, getBuildingType } from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { Direction, ResourceType } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

const STORAGE_REGOLITH = getBuildingType(STORAGE_BUILDING_TYPE_ID)!.cost!.find(
  (line) => line.resourceType === ResourceType.Regolith,
)!.amount;

function campaign(regolith: number): GameEngine {
  const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
  engine.generateMap(42);
  engine.storageInventories.get(engine.getHubId()!)!.regolith = regolith;
  return engine;
}

/** A free, revealed tile a few steps west of the hub. */
function freeTile(engine: GameEngine) {
  const hub = engine.getBuildings().get(engine.getHubId()!)!.origin;
  return { x: hub.x - 6, y: hub.y };
}

describe('ToolModeIndicator placement readout', () => {
  beforeEach(() => {
    useGameStore.setState({
      engine: null,
      selectedTool: { kind: 'select' },
      hoverTile: null,
      beltPreview: null,
      currentBuildingRotation: Direction.North,
      worldVersion: 0,
    });
  });

  it('shows the cost of the selected building before anything is placed', () => {
    useGameStore.setState({
      engine: campaign(1000),
      selectedTool: { kind: 'building', buildingType: STORAGE_BUILDING_TYPE_ID },
    });
    render(<ToolModeIndicator />);

    expect(screen.getByRole('group', { name: /^Coût : / })).toHaveTextContent(String(STORAGE_REGOLITH));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('explains why the hovered tile is refused, in amber when the stock is short', () => {
    const engine = campaign(0);
    useGameStore.setState({
      engine,
      selectedTool: { kind: 'building', buildingType: STORAGE_BUILDING_TYPE_ID },
      hoverTile: freeTile(engine),
    });
    render(<ToolModeIndicator />);

    const reason = screen.getByRole('status');
    expect(reason).toHaveTextContent('Ressources insuffisantes');
    expect(reason).toHaveClass('text-accent-warm');
  });

  it('names other refusal reasons too', () => {
    const engine = campaign(1000);
    useGameStore.setState({
      engine,
      selectedTool: { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID },
      hoverTile: freeTile(engine),
    });
    render(<ToolModeIndicator />);

    expect(screen.getByRole('status')).toHaveTextContent('Doit être posé sur un gisement');
  });

  it('shows the total cost of the belt route being dragged', () => {
    useGameStore.setState({
      engine: campaign(1),
      selectedTool: { kind: 'belt' },
      beltPreview: {
        kind: 'belt',
        isValid: false,
        reason: 'insufficient_resources',
        tiles: [0, 1, 2].map((x) => ({ coord: { x, y: 0 }, tint: 0 })),
        cost: [{ resourceType: ResourceType.Regolith, amount: 3 }],
        missing: [{ resourceType: ResourceType.Regolith, amount: 2 }],
      },
    });
    render(<ToolModeIndicator />);

    expect(screen.getByText('3 seg.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Coût du tracé : 3 / })).toHaveTextContent('3');
    expect(screen.getByRole('status')).toHaveTextContent('Ressources insuffisantes');
  });

  it('shows no cost in sandbox', () => {
    const engine = new GameEngine(800, 600);
    engine.generateMap(42);
    useGameStore.setState({ engine, selectedTool: { kind: 'building', buildingType: STORAGE_BUILDING_TYPE_ID } });
    render(<ToolModeIndicator />);

    expect(screen.getByText('Mode · ' + getBuildingType(STORAGE_BUILDING_TYPE_ID)!.name)).toBeInTheDocument();
    expect(screen.queryByTestId('placement-readout')).toBeNull();
  });
});
