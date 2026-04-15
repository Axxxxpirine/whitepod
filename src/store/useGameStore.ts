import { create } from 'zustand';
import type { GameEngine } from '@/game/engine/GameEngine';
import { clearPersistedSession } from '@/game/persistence/sessionStorage';
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
  sessionEpoch: number;
  pendingEnergyLinkSource: BuildingId | null;
  linkSolarOnPlacement: boolean;
  setEngine: (engine: GameEngine | null) => void;
  initEngine: (engine: GameEngine) => void;
  setSelectedTool: (tool: SelectedTool) => void;
  setHoverTile: (tile: { x: number; y: number } | null) => void;
  setSelectedBuilding: (id: BuildingId | null) => void;
  setSelectedBuildingAnchor: (anchor: ScreenPoint | null) => void;
  resetSession: () => void;
  setPendingEnergyLinkSource: (source: BuildingId | null) => void;
  setLinkSolarOnPlacement: (value: boolean) => void;
}

export const useGameStore = create<GameState>((set) => ({
  engine: null,
  selectedTool: { kind: 'select' },
  hoverTile: null,
  selectedBuildingId: null,
  selectedBuildingAnchor: null,
  sessionEpoch: 0,
  pendingEnergyLinkSource: null,
  linkSolarOnPlacement: true,
  setEngine: (engine) => set({ engine }),
  initEngine: (engine) => set({ engine }),
  setSelectedTool: (tool) => set({ selectedTool: tool }),
  setHoverTile: (tile) => set({ hoverTile: tile }),
  setSelectedBuilding: (id) => set({ selectedBuildingId: id }),
  setSelectedBuildingAnchor: (anchor) => set({ selectedBuildingAnchor: anchor }),
  resetSession: () => {
    clearPersistedSession();
    set((state) => ({
      engine: null,
      selectedTool: { kind: 'select' },
      hoverTile: null,
      selectedBuildingId: null,
      selectedBuildingAnchor: null,
      sessionEpoch: state.sessionEpoch + 1,
    }));
  },
  setPendingEnergyLinkSource: (source) => set({ pendingEnergyLinkSource: source }),
  setLinkSolarOnPlacement: (value) => set({ linkSolarOnPlacement: value }),
}));
