import { create } from 'zustand';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { IdleCatchupResult } from '@/game/idle/IdleCatchup';
import { clearPersistedSession } from '@/game/persistence/sessionStorage';
import {
  getDefaultSettings,
  loadPersistedSettings,
  savePersistedSettings,
} from '@/game/persistence/settingsStorage';
import type { ActionLogger } from '@/game/persistence/actionLogger';
import type { BeltPlacementPreviewModel } from '@/game/renderer/placementPreviewModel';
import { Direction, type BuildingId, type SelectedTool, type TileCoord } from '@/game/types';
import { DEFAULT_MAP_SEED } from '@/game/constants';
import { DEFAULT_BOT_PROFILE_ID } from '@/game/bot/botProfiles';
import { DEFAULT_GAME_MODE, type GameMode } from '@/game/data/gameMode';
import { applySeedAndResetSession } from '@/game/session/seedSession';
import type { BotProfileId } from '@/game/bot/botTypes';

interface ScreenPoint {
  x: number;
  y: number;
}

interface GameState {
  engine: GameEngine | null;
  simulationTime: number;
  simulationSpeed: number;
  /** Dev setting (not saved): lets campaign-ready bots run in campaign worlds, for balancing. */
  botsInCampaign: boolean;
  musicVolume: number;
  sfxVolume: number;
  selectedTool: SelectedTool;
  hoverTile: { x: number; y: number } | null;
  selectedBuildingId: BuildingId | null;
  selectedBuildingAnchor: ScreenPoint | null;
  selectedResourceTile: TileCoord | null;
  selectedResourceAnchor: ScreenPoint | null;
  beltPreview: BeltPlacementPreviewModel | null;
  currentBuildingRotation: Direction;
  sessionEpoch: number;
  worldVersion: number;
  /** The start screen is shown: at boot, and when the player opens the main menu. */
  startScreenOpen: boolean;
  /** A game is mounted (canvas + HUD); false until the player leaves the boot start screen. */
  sessionStarted: boolean;
  saveTakenOver: boolean;
  /** The save on disk could not be rebuilt: it is kept, and the start screen says so. */
  saveUnreadable: boolean;
  leaveUnreadableSave: () => void;
  leaveSupersededSession: () => void;
  /** Mode of the next world created from scratch (new game, reset). */
  newGameMode: GameMode;
  pendingEnergyLinkSource: BuildingId | null;
  linkSolarOnPlacement: boolean;
  idleSummary: IdleCatchupResult | null;
  selectedBotProfileId: BotProfileId;
  seedInput: string;
  actionLogger: ActionLogger | null;
  bot: {
    active: boolean;
    phase: string;
    target: string | null;
  };
  botControls: { start: () => void; stop: () => void } | null;
  setEngine: (engine: GameEngine | null) => void;
  initEngine: (engine: GameEngine) => void;
  setSimulationTime: (value: number) => void;
  setSimulationSpeed: (value: number) => void;
  setBotsInCampaign: (value: boolean) => void;
  setMusicVolume: (value: number) => void;
  setSfxVolume: (value: number) => void;
  setSelectedTool: (tool: SelectedTool) => void;
  setHoverTile: (tile: { x: number; y: number } | null) => void;
  setSelectedBuilding: (id: BuildingId | null) => void;
  setSelectedBuildingAnchor: (anchor: ScreenPoint | null) => void;
  setSelectedResourceTile: (tile: TileCoord | null) => void;
  setSelectedResourceAnchor: (anchor: ScreenPoint | null) => void;
  setBeltPreview: (preview: BeltPlacementPreviewModel | null) => void;
  setCurrentBuildingRotation: (rotation: Direction) => void;
  rotateBuildingRotation: () => void;
  resetSession: () => void;
  /** Opens the start screen over the running game. */
  openStartScreen: () => void;
  /** Leaves the start screen into the saved or running game. */
  resumeSession: () => void;
  /**
   * Clears the saved game and starts a new world in `gameMode` with `seedInput`.
   * Returns false, changing nothing, when the seed is not a number.
   */
  startNewGame: (gameMode: GameMode, seedInput: string) => boolean;
  bumpWorldVersion: () => void;
  setPendingEnergyLinkSource: (source: BuildingId | null) => void;
  setLinkSolarOnPlacement: (value: boolean) => void;
  setIdleSummary: (summary: IdleCatchupResult | null) => void;
  setSelectedBotProfileId: (profileId: BotProfileId) => void;
  setSeedInput: (value: string) => void;
  setActionLogger: (logger: ActionLogger | null) => void;
  setBotControls: (controls: GameState['botControls']) => void;
  setBot: (bot: Partial<GameState['bot']>) => void;
  activateScenarioSession: (args: {
    engine: GameEngine;
    selectedTool: SelectedTool;
    simulationTime: number;
  }) => void;
}

const loadedSettings = loadPersistedSettings();
const defaultSettings = getDefaultSettings();

export const useGameStore = create<GameState>((set, get) => ({
  engine: null,
  simulationTime: 0,
  simulationSpeed: 1,
  botsInCampaign: false,
  musicVolume: loadedSettings.musicVolume ?? defaultSettings.musicVolume,
  sfxVolume: loadedSettings.sfxVolume ?? defaultSettings.sfxVolume,
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
  startScreenOpen: true,
  sessionStarted: false,
  saveTakenOver: false,
  saveUnreadable: false,
  newGameMode: DEFAULT_GAME_MODE,
  pendingEnergyLinkSource: null,
  linkSolarOnPlacement: true,
  idleSummary: null,
  selectedBotProfileId: DEFAULT_BOT_PROFILE_ID,
  seedInput: String(DEFAULT_MAP_SEED),
  actionLogger: null,
  bot: {
    active: false,
    phase: 'idle',
    target: null,
  },
  botControls: null,
  setEngine: (engine) => set({ engine }),
  initEngine: (engine) => set({ engine }),
  setSimulationTime: (value) => set({ simulationTime: value }),
  setSimulationSpeed: (value) => set({ simulationSpeed: Math.max(0, value) }),
  setBotsInCampaign: (value) => set({ botsInCampaign: value }),
  setMusicVolume: (value) =>
    set((state) => {
      const musicVolume = Math.min(1, Math.max(0, value));
      savePersistedSettings({ musicVolume, sfxVolume: state.sfxVolume });
      return { musicVolume };
    }),
  setSfxVolume: (value) =>
    set((state) => {
      const sfxVolume = Math.min(1, Math.max(0, value));
      savePersistedSettings({ musicVolume: state.musicVolume, sfxVolume });
      return { sfxVolume };
    }),
  setSelectedTool: (tool) =>
    set((state) => ({
      selectedTool: tool,
      beltPreview: tool.kind === 'belt' ? state.beltPreview : null,
      selectedResourceTile: tool.kind === 'select' ? state.selectedResourceTile : null,
      selectedResourceAnchor: tool.kind === 'select' ? state.selectedResourceAnchor : null,
    })),
  setHoverTile: (tile) => set({ hoverTile: tile }),
  setSelectedBuilding: (id) => set({ selectedBuildingId: id }),
  setSelectedBuildingAnchor: (anchor) => set({ selectedBuildingAnchor: anchor }),
  setSelectedResourceTile: (tile) => set({ selectedResourceTile: tile }),
  setSelectedResourceAnchor: (anchor) => set({ selectedResourceAnchor: anchor }),
  setBeltPreview: (preview) => set({ beltPreview: preview }),
  setCurrentBuildingRotation: (rotation) => set({ currentBuildingRotation: rotation }),
  rotateBuildingRotation: () =>
    set((state) => ({
      currentBuildingRotation: ((state.currentBuildingRotation + 1) % 4) as Direction,
    })),
  resetSession: () => {
    get().actionLogger?.flush();
    clearPersistedSession();
    set((state) => ({
      engine: null,
      simulationTime: 0,
      simulationSpeed: 1,
      selectedTool: { kind: 'select' },
      hoverTile: null,
      selectedBuildingId: null,
      selectedBuildingAnchor: null,
      selectedResourceTile: null,
      selectedResourceAnchor: null,
      beltPreview: null,
      currentBuildingRotation: Direction.North,
      idleSummary: null,
      botControls: null,
      bot: {
        active: false,
        phase: 'idle',
        target: null,
      },
      sessionEpoch: state.sessionEpoch + 1,
    }));
  },
  openStartScreen: () => set({ startScreenOpen: true }),
  leaveSupersededSession: () => set({
    sessionStarted: false,
    startScreenOpen: true,
    saveTakenOver: true,
    engine: null,
    actionLogger: null,
    botControls: null,
    bot: { active: false, phase: 'idle', target: null },
    simulationSpeed: 1,
    selectedResourceTile: null,
    selectedResourceAnchor: null,
  }),
  leaveUnreadableSave: () => set({
    sessionStarted: false,
    startScreenOpen: true,
    saveUnreadable: true,
    engine: null,
    actionLogger: null,
    botControls: null,
    bot: { active: false, phase: 'idle', target: null },
    simulationSpeed: 1,
  }),
  resumeSession: () => set({ startScreenOpen: false, sessionStarted: true, saveTakenOver: false, saveUnreadable: false }),
  startNewGame: (gameMode, seedInput) => {
    const started = applySeedAndResetSession({
      seedInput,
      setSeedInput: get().setSeedInput,
      resetSession: () => {
        set({ newGameMode: gameMode });
        get().resetSession();
      },
    });
    if (started) get().resumeSession();
    return started;
  },
  bumpWorldVersion: () => set((state) => ({ worldVersion: state.worldVersion + 1 })),
  setPendingEnergyLinkSource: (source) => set({ pendingEnergyLinkSource: source }),
  setLinkSolarOnPlacement: (value) => set({ linkSolarOnPlacement: value }),
  setIdleSummary: (summary) => set({ idleSummary: summary }),
  setSelectedBotProfileId: (profileId) => set({ selectedBotProfileId: profileId }),
  setSeedInput: (value) => set({ seedInput: value }),
  setBotControls: (controls) => set({ botControls: controls }),
  setBot: (bot) =>
    set((state) => ({
      bot: { ...state.bot, ...bot },
    })),
  setActionLogger: (logger) => set({ actionLogger: logger }),
  activateScenarioSession: (args) =>
    set((state) => ({
      engine: args.engine,
      simulationTime: args.simulationTime,
      selectedTool: args.selectedTool,
      hoverTile: null,
      selectedBuildingId: null,
      selectedBuildingAnchor: null,
      selectedResourceTile: null,
      selectedResourceAnchor: null,
      beltPreview: null,
      currentBuildingRotation: Direction.North,
      sessionEpoch: state.sessionEpoch + 1,
      pendingEnergyLinkSource: null,
      idleSummary: null,
      botControls: null,
      bot: {
        active: false,
        phase: 'idle',
        target: null,
      },
    })),
}));
