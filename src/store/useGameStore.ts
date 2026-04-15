import { create } from 'zustand';
import type { GameEngine } from '@/game/engine/GameEngine';
import { clearPersistedSession } from '@/game/persistence/sessionStorage';
import type { BeltPlacementPreviewModel } from '@/game/renderer/placementPreviewModel';
import { Direction, type BuildingId, type SelectedTool } from '@/game/types';

interface ScreenPoint {
  x: number;
  y: number;
}

interface GameState {
  engine: GameEngine | null;
  selectedTool: SelectedTool;
  hoverTile: { x: number; y: number } | null;
  selectedBuildingId: BuildingId | null;
  selectedBuildingAnchor: ScreenPoint | null;
  beltPreview: BeltPlacementPreviewModel | null;
  currentBuildingRotation: Direction;
  sessionEpoch: number;
  setEngine: (engine: GameEngine | null) => void;
  initEngine: (engine: GameEngine) => void;
  setSelectedTool: (tool: SelectedTool) => void;
  setHoverTile: (tile: { x: number; y: number } | null) => void;
  setSelectedBuilding: (id: BuildingId | null) => void;
  setSelectedBuildingAnchor: (anchor: ScreenPoint | null) => void;
  setBeltPreview: (preview: BeltPlacementPreviewModel | null) => void;
  setCurrentBuildingRotation: (rotation: Direction) => void;
  rotateBuildingRotation: () => void;
  resetSession: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  engine: null,
  selectedTool: { kind: 'select' },
  hoverTile: null,
  selectedBuildingId: null,
  selectedBuildingAnchor: null,
  beltPreview: null,
  currentBuildingRotation: Direction.North,
  sessionEpoch: 0,
  setEngine: (engine) => set({ engine }),
  initEngine: (engine) => set({ engine }),
  setSelectedTool: (tool) =>
    set((state) => ({
      selectedTool: tool,
      beltPreview: tool.kind === 'belt' ? state.beltPreview : null,
    })),
  setHoverTile: (tile) => set({ hoverTile: tile }),
  setSelectedBuilding: (id) => set({ selectedBuildingId: id }),
  setSelectedBuildingAnchor: (anchor) => set({ selectedBuildingAnchor: anchor }),
  setBeltPreview: (preview) => set({ beltPreview: preview }),
  setCurrentBuildingRotation: (rotation) => set({ currentBuildingRotation: rotation }),
  rotateBuildingRotation: () =>
    set((state) => ({
      currentBuildingRotation: ((state.currentBuildingRotation + 1) % 4) as Direction,
    })),
  resetSession: () => {
    clearPersistedSession();
    set((state) => ({
      engine: null,
      selectedTool: { kind: 'select' },
      hoverTile: null,
      selectedBuildingId: null,
      selectedBuildingAnchor: null,
      beltPreview: null,
      currentBuildingRotation: Direction.North,
      sessionEpoch: state.sessionEpoch + 1,
    }));
  },
}));
