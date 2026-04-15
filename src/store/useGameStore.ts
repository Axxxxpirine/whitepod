import { create } from 'zustand';
import type { GameEngine } from '@/game/engine/GameEngine';
import { TileType, type BuildingTypeId } from '@/game/types';

export type SelectedTool =
  | { readonly kind: 'tile'; readonly tile: TileType }
  | { readonly kind: 'building'; readonly buildingType: BuildingTypeId };

interface GameState {
  engine: GameEngine | null;
  selectedTool: SelectedTool;
  initEngine: (engine: GameEngine) => void;
  setSelectedTool: (tool: SelectedTool) => void;
}

export const useGameStore = create<GameState>((set) => ({
  engine: null,
  selectedTool: { kind: 'tile', tile: TileType.Ground },
  initEngine: (engine) => set({ engine }),
  setSelectedTool: (tool) => set({ selectedTool: tool }),
}));
