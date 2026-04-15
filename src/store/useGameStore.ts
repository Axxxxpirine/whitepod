import { create } from 'zustand';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { BuildingId, SelectedTool } from '@/game/types';

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
  initEngine: (engine: GameEngine) => void;
  setSelectedTool: (tool: SelectedTool) => void;
  setHoverTile: (tile: { x: number; y: number } | null) => void;
  setSelectedBuilding: (id: BuildingId | null) => void;
  setSelectedBuildingAnchor: (anchor: ScreenPoint | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  engine: null,
  selectedTool: { kind: 'select' },
  hoverTile: null,
  selectedBuildingId: null,
  selectedBuildingAnchor: null,
  initEngine: (engine) => set({ engine }),
  setSelectedTool: (tool) => set({ selectedTool: tool }),
  setHoverTile: (tile) => set({ hoverTile: tile }),
  setSelectedBuilding: (id) => set({ selectedBuildingId: id }),
  setSelectedBuildingAnchor: (anchor) => set({ selectedBuildingAnchor: anchor }),
}));
