import { create } from 'zustand';
import type { GameEngine } from '@/game/engine/GameEngine';
import { TileType, type SelectedTool } from '@/game/types';

interface GameState {
  engine: GameEngine | null;
  selectedTool: SelectedTool;
  hoverTile: { x: number; y: number } | null;
  initEngine: (engine: GameEngine) => void;
  setSelectedTool: (tool: SelectedTool) => void;
  setHoverTile: (tile: { x: number; y: number } | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  engine: null,
  selectedTool: { kind: 'tile', tile: TileType.Ground },
  hoverTile: null,
  initEngine: (engine) => set({ engine }),
  setSelectedTool: (tool) => set({ selectedTool: tool }),
  setHoverTile: (tile) => set({ hoverTile: tile }),
}));
