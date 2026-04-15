import { create } from 'zustand';
import type { GameEngine } from '@/game/engine/GameEngine';
import { TileType } from '@/game/types';

interface GameState {
  engine: GameEngine | null;
  selectedTool: TileType;
  initEngine: (engine: GameEngine) => void;
  setSelectedTool: (tool: TileType) => void;
}

export const useGameStore = create<GameState>((set) => ({
  engine: null,
  selectedTool: TileType.Ground,
  initEngine: (engine) => set({ engine }),
  setSelectedTool: (tool) => set({ selectedTool: tool }),
}));
