import { beforeEach, describe, expect, it, vi } from 'vitest';
import { popCancelStack } from '@/game/input/CancelStack';
import { useGameStore } from '@/store/useGameStore';
import { Direction } from '@/game/types';

describe('CancelStack', () => {
  beforeEach(() => {
    useGameStore.setState({
      engine: null,
      simulationTime: 0,
      simulationSpeed: 1,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      selectedTool: { kind: 'select' },
      hoverTile: null,
      selectedBuildingId: null,
      selectedBuildingAnchor: null,
      selectedResourceTile: null,
      selectedResourceAnchor: null,
      beltPreview: null,
      currentBuildingRotation: Direction.North,
      sessionEpoch: 0,
      worldVersion: 0,
      pendingEnergyLinkSource: null,
      linkSolarOnPlacement: true,
      idleSummary: null,
    });
  });

  it('clears the selected resource when it is the top cancel layer', () => {
    useGameStore.setState({
      selectedResourceTile: { x: 8, y: 8 },
      selectedResourceAnchor: { x: 120, y: 160 },
    });
    const beltController = {
      hasPending: vi.fn().mockReturnValue(false),
      clearPendingPlacement: vi.fn(),
    };

    const changed = popCancelStack(useGameStore, beltController as never);

    expect(changed).toBe(true);
    expect(useGameStore.getState().selectedResourceTile).toBeNull();
    expect(useGameStore.getState().selectedResourceAnchor).toBeNull();
  });

  it('clears the building selection before the resource selection', () => {
    useGameStore.setState({
      selectedBuildingId: 5,
      selectedBuildingAnchor: { x: 80, y: 120 },
      selectedResourceTile: { x: 8, y: 8 },
      selectedResourceAnchor: { x: 120, y: 160 },
    });
    const beltController = {
      hasPending: vi.fn().mockReturnValue(false),
      clearPendingPlacement: vi.fn(),
    };

    expect(popCancelStack(useGameStore, beltController as never)).toBe(true);
    expect(useGameStore.getState().selectedBuildingId).toBeNull();
    expect(useGameStore.getState().selectedResourceTile).toEqual({ x: 8, y: 8 });

    expect(popCancelStack(useGameStore, beltController as never)).toBe(true);
    expect(useGameStore.getState().selectedResourceTile).toBeNull();
  });
});
