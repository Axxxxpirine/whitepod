import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BuildingStatsPanel } from '@/components/BuildingStatsPanel';
import { GameEngine } from '@/game/engine/GameEngine';
import { TileType } from '@/game/types';

function makeEngine() {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  return engine;
}

describe('BuildingStatsPanel', () => {
  it('renders converter recipes as a three-column grid with output sprites and input text', () => {
    const engine = makeEngine();
    const buildingId = engine.placeBuilding('converter_basic', { x: 6, y: 6 })!;
    const building = engine.getBuildings().get(buildingId)!;

    const { container } = render(
      <BuildingStatsPanel building={building} engine={engine} worldTick={0} energyVersion={0} />,
    );

    expect(container.querySelector('.grid.grid-cols-3.gap-1')).not.toBeNull();
    expect(screen.getAllByRole('button')).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Recette Oxyde de fer' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Oxyde de fer' })).toBeInTheDocument();
    expect(screen.getByText('1x Régolithe')).toBeInTheDocument();
    expect(screen.queryByText('Oxydation (fer)')).not.toBeInTheDocument();
    expect(screen.queryByText(/\(\d+s\)/)).not.toBeInTheDocument();
  });

  it('renders synthesizer recipes with compact multiline inputs', () => {
    const engine = makeEngine();
    const buildingId = engine.placeBuilding('synthesizer_basic', { x: 8, y: 8 })!;
    const building = engine.getBuildings().get(buildingId)!;

    render(<BuildingStatsPanel building={building} engine={engine} worldTick={0} energyVersion={0} />);

    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Recette Eau' })).toBeInTheDocument();
    expect(screen.getByText('2x Hydrogène + 1x Oxygène')).toBeInTheDocument();
    expect(screen.queryByText(/Synthèse d'eau/)).not.toBeInTheDocument();
  });

  it('marks the active recipe and toggles selection on click', () => {
    const engine = makeEngine();
    const buildingId = engine.placeBuilding('converter_basic', { x: 10, y: 10 })!;
    const building = engine.getBuildings().get(buildingId)!;

    const { rerender } = render(
      <BuildingStatsPanel building={building} engine={engine} worldTick={0} energyVersion={0} />,
    );

    let ironButton = screen.getByRole('button', { name: 'Recette Oxyde de fer' });
    expect(ironButton).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(ironButton);
    expect(engine.getProcessorState(buildingId)?.recipeId).toBe('iron_oxide');
    rerender(<BuildingStatsPanel building={building} engine={engine} worldTick={1} energyVersion={0} />);

    ironButton = screen.getByRole('button', { name: 'Recette Oxyde de fer' });
    expect(ironButton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(ironButton);
    expect(engine.getProcessorState(buildingId)?.recipeId).toBeNull();
  });

  it('reflects an already active recipe with aria-pressed', () => {
    const engine = makeEngine();
    const buildingId = engine.placeBuilding('converter_basic', { x: 12, y: 12 })!;
    engine.setProcessorRecipe(buildingId, 'iron_oxide');
    const building = engine.getBuildings().get(buildingId)!;

    render(<BuildingStatsPanel building={building} engine={engine} worldTick={0} energyVersion={0} />);

    expect(screen.getByRole('button', { name: 'Recette Oxyde de fer' })).toHaveAttribute('aria-pressed', 'true');
  });
});
