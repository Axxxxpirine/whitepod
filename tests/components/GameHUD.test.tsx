import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { GameHUD } from '@/components/GameHUD';
import { useGameStore } from '@/store/useGameStore';
import { EXTRACTOR_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { TileType } from '@/game/types';

describe('GameHUD', () => {
  beforeEach(() => {
    useGameStore.setState({
      engine: null,
      hoverTile: { x: 12, y: 7 },
      selectedTool: { kind: 'tile', tile: TileType.Ground },
    });
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

  it('toggles back to ground mode on second click', () => {
    useGameStore.setState({
      selectedTool: { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID },
    });

    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: 'Extracteur' }));

    expect(useGameStore.getState().selectedTool).toEqual({
      kind: 'tile',
      tile: TileType.Ground,
    });
    expect(screen.getByRole('button', { name: 'Extracteur' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('keeps the console toggle working', () => {
    render(<GameHUD />);

    fireEvent.click(screen.getByRole('button', { name: '>_' }));
    expect(screen.getByPlaceholderText('engine.placeResource(10, 10, 1)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByPlaceholderText('engine.placeResource(10, 10, 1)')).not.toBeInTheDocument();
  });
});
