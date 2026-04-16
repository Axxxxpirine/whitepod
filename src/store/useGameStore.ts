import { create } from 'zustand';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { IdleCatchupResult } from '@/game/idle/IdleCatchup';
import { clearPersistedSession } from '@/game/persistence/sessionStorage';
import {
  getDefaultSettings,
  loadPersistedSettings,
  savePersistedSettings,
} from '@/game/persistence/settingsStorage';
import type { BeltPlacementPreviewModel } from '@/game/renderer/placementPreviewModel';
import { Direction, type BuildingId, type SelectedTool } from '@/game/types';

interface ScreenPoint {
  x: number;
  y: number;
}

interface GameState {
  engine: GameEngine | null;
  simulationTime: number;
  simulationSpeed: number;
  musicVolume: number;
  selectedTool: SelectedTool;
  hoverTile: { x: number; y: number } | null;
  selectedBuildingId: BuildingId | null;
  selectedBuildingAnchor: ScreenPoint | null;
  beltPreview: BeltPlacementPreviewModel | null;
  currentBuildingRotation: Direction;
  sessionEpoch: number;
  worldVersion: number;
  pendingEnergyLinkSource: BuildingId | null;
  linkSolarOnPlacement: boolean;
  idleSummary: IdleCatchupResult | null;
  setEngine: (engine: GameEngine | null) => void;
  initEngine: (engine: GameEngine) => void;
  setSimulationTime: (value: number) => void;
  setSimulationSpeed: (value: number) => void;
  setMusicVolume: (value: number) => void;
  setSelectedTool: (tool: SelectedTool) => void;
  setHoverTile: (tile: { x: number; y: number } | null) => void;
  setSelectedBuilding: (id: BuildingId | null) => void;
  setSelectedBuildingAnchor: (anchor: ScreenPoint | null) => void;
  setBeltPreview: (preview: BeltPlacementPreviewModel | null) => void;
  setCurrentBuildingRotation: (rotation: Direction) => void;
  rotateBuildingRotation: () => void;
  resetSession: () => void;
  bumpWorldVersion: () => void;
  setPendingEnergyLinkSource: (source: BuildingId | null) => void;
  setLinkSolarOnPlacement: (value: boolean) => void;
  setIdleSummary: (summary: IdleCatchupResult | null) => void;
}

const loadedSettings = loadPersistedSettings();
const defaultSettings = getDefaultSettings();

export const useGameStore = create<GameState>((set) => ({
  engine: null,
  simulationTime: 0,
  simulationSpeed: 1,
  musicVolume: loadedSettings.musicVolume ?? defaultSettings.musicVolume,
  selectedTool: { kind: 'select' },
  hoverTile: null,
  selectedBuildingId: null,
  selectedBuildingAnchor: null,
  beltPreview: null,
  currentBuildingRotation: Direction.North,
  sessionEpoch: 0,
  worldVersion: 0,
  pendingEnergyLinkSource: null,
  linkSolarOnPlacement: true,
  idleSummary: null,
  setEngine: (engine) => set({ engine }),
  initEngine: (engine) => set({ engine }),
  setSimulationTime: (value) => set({ simulationTime: value }),
  setSimulationSpeed: (value) => set({ simulationSpeed: Math.max(0, value) }),
  setMusicVolume: (value) =>
    set(() => {
      const musicVolume = Math.min(1, Math.max(0, value));
      savePersistedSettings({ musicVolume });
      return { musicVolume };
    }),
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
      simulationTime: 0,
      simulationSpeed: 1,
      selectedTool: { kind: 'select' },
      hoverTile: null,
      selectedBuildingId: null,
      selectedBuildingAnchor: null,
      beltPreview: null,
      currentBuildingRotation: Direction.North,
      idleSummary: null,
      sessionEpoch: state.sessionEpoch + 1,
    }));
  },
  bumpWorldVersion: () => set((state) => ({ worldVersion: state.worldVersion + 1 })),
  setPendingEnergyLinkSource: (source) => set({ pendingEnergyLinkSource: source }),
  setLinkSolarOnPlacement: (value) => set({ linkSolarOnPlacement: value }),
  setIdleSummary: (summary) => set({ idleSummary: summary }),
}));
