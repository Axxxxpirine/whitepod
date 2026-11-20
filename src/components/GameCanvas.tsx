import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { DEFAULT_MAP_SEED, TILE_SIZE } from '@/game/constants';
import { GameEngine } from '@/game/engine/GameEngine';
import { GridRenderer } from '@/game/renderer/GridRenderer';
import { ResourceRenderer } from '@/game/renderer/ResourceRenderer';
import { TerrainDecalRenderer } from '@/game/renderer/TerrainDecalRenderer';
import { BuildingRenderer } from '@/game/renderer/BuildingRenderer';
import { BeltRenderer } from '@/game/renderer/BeltRenderer';
import { EnergyLinkRenderer } from '@/game/renderer/EnergyLinkRenderer';
import { BeltFlowAnimator } from '@/game/renderer/BeltFlowAnimator';
import { PlacementPreviewRenderer } from '@/game/renderer/PlacementPreviewRenderer';
import { BuildingHighlightRenderer } from '@/game/renderer/BuildingHighlightRenderer';
import { DayNightOverlayRenderer } from '@/game/renderer/DayNightOverlayRenderer';
import { FogOfWarRenderer } from '@/game/renderer/FogOfWarRenderer';
import { InputHandler } from '@/game/engine/InputHandler';
import { BeltToolController } from '@/game/engine/BeltToolController';
import { popCancelStack } from '@/game/input/CancelStack';
import {
  clearIdleSidecar,
  createSessionId,
  loadPersistedSession,
  saveViewSession,
  saveWorldSession,
  writeIdleSidecar,
} from '@/game/persistence/sessionStorage';
import { ActionLogger, type ActionKind } from '@/game/persistence/actionLogger';
import { applyIdleCatchup } from '@/game/idle/IdleCatchup';
import { useGameStore } from '@/store/useGameStore';
import { loadBuildingTextures, loadResourceTextures, loadTerrainDecalTextures } from '@/game/renderer/TileSprite';
import { ResourceType, type SelectedTool } from '@/game/types';
import { getBuildingType } from '@/game/data/buildingCatalog';
import { finalizePendingScenarioInstall } from '@/game/scenarios/applyScenario';
import { createDevScenarioApi, hasPendingScenarioInstall } from '@/game/scenarios/devScenarios';
import { worldToScreen, screenToWorld } from '@/game/engine/CoordinateTransform';
import { createBotSession } from '@/game/bot/botSession';
import {
  handleBuildingPlaced,
  handleEnergyLinkClick,
  selectedToolsEqual,
} from './energyLinkHandlers';
import { MinimapRenderer } from '@/game/renderer/MinimapRenderer';
import { KeyboardHandler } from '@/game/input/KeyboardHandler';

const WORLD_SAVE_DELAY_MS = 150;
const VIEW_SAVE_DELAY_MS = 100;

function createDebouncedTask(task: () => void, delayMs: number) {
  let timeoutId: number | null = null;

  return {
    schedule() {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        task();
      }, delayMs);
    },
    flush() {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      task();
    },
    cancel() {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}

const CURSOR_CLASS: Record<SelectedTool['kind'], string> = {
  select: 'cursor-default',
  building: 'cursor-crosshair',
  belt: 'cursor-crosshair',
  energy_link: 'cursor-cell',
};

type DevEngine = GameEngine & {
  scenarios?: ReturnType<typeof createDevScenarioApi>;
};

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionEpoch = useGameStore((s) => s.sessionEpoch);
  const setEngine = useGameStore((s) => s.setEngine);
  const setSelectedTool = useGameStore((s) => s.setSelectedTool);
  const selectedToolKind = useGameStore((s) => s.selectedTool.kind);
  const setSimulationTime = useGameStore((s) => s.setSimulationTime);
  const setSeedInput = useGameStore((s) => s.setSeedInput);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let initCompleted = false;
    let app: Application | null = null;
    let gridRenderer: GridRenderer | null = null;
    let terrainDecalRenderer: TerrainDecalRenderer | null = null;
    let resourceRenderer: ResourceRenderer | null = null;
    let buildingRenderer: BuildingRenderer | null = null;
    let beltRenderer: BeltRenderer | null = null;
    let beltFlowAnimator: BeltFlowAnimator | null = null;
    let placementPreviewRenderer: PlacementPreviewRenderer | null = null;
    let buildingHighlightRenderer: BuildingHighlightRenderer | null = null;
    let energyLinkRenderer: EnergyLinkRenderer | null = null;
    let fogOfWarRenderer: FogOfWarRenderer | null = null;
    let dayNightOverlayRenderer: DayNightOverlayRenderer | null = null;
    let minimapRenderer: MinimapRenderer | null = null;
    let keyboardHandler: KeyboardHandler | null = null;
    let handlePointerDown: ((e: PointerEvent) => void) | null = null;
    let handlePointerMove: ((e: PointerEvent) => void) | null = null;
    let handlePointerUp: ((e: PointerEvent) => void) | null = null;
    let handlePointerLeave: (() => void) | null = null;
    let handleContextMenu: ((e: MouseEvent) => void) | null = null;
    let handleWheel: ((e: WheelEvent) => void) | null = null;
    let handleKeyDown: ((e: KeyboardEvent) => void) | null = null;
    let handleVisibilityChange: (() => void) | null = null;
    let handleBeforeUnload: (() => void) | null = null;
    let handlePageHide: (() => void) | null = null;
    let simState: 'ACTIVE' | 'PAUSED' = 'ACTIVE';
    let pausedAtWallClockMs: number | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let unsubscribeEngine: (() => void) | null = null;
    let unsubscribeTool: (() => void) | null = null;
    let unsubscribeActions: (() => void) | null = null;
    let worldSaver: ReturnType<typeof createDebouncedTask> | null = null;
    let viewSaver: ReturnType<typeof createDebouncedTask> | null = null;
    let currentEngine: GameEngine | null = null;
    let botSession: ReturnType<typeof createBotSession> | null = null;

    const init = async () => {
      app = new Application();
      await app.init({
        resizeTo: container,
        backgroundColor: 0x0b0d10,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      initCompleted = true;

      if (destroyed) {
        app.destroy(true);
        return;
      }

      container.appendChild(app.canvas);

      await loadResourceTextures();
      await loadTerrainDecalTextures();
      await loadBuildingTextures();

      if (destroyed) {
        app.destroy(true);
        return;
      }

      const loadedSession = loadPersistedSession(app.screen.width, app.screen.height);
      const engine = loadedSession?.engine ?? new GameEngine(app.screen.width, app.screen.height);
      currentEngine = engine;
      const sessionId = loadedSession?.sessionId ?? createSessionId();
      const selectedTool = loadedSession?.selectedTool ?? { kind: 'select' as const };
      const sidecar = loadedSession?.idleSidecar ?? null;
      const currentState = useGameStore.getState();
      const initialBotProfileId = loadedSession?.selectedBotProfileId ?? currentState.selectedBotProfileId;
      const initialSeedInput = loadedSession?.seedInput ?? currentState.seedInput;
      const mapSeed = Number.parseInt(initialSeedInput.trim(), 10);

      if (!loadedSession) {
        engine.generateMap(Number.isFinite(mapSeed) ? mapSeed : engine.mapSeed ?? DEFAULT_MAP_SEED);
      }

      const nowAtMount = Date.now();
      const crossSessionElapsedMs =
        sidecar !== null ? Math.max(0, nowAtMount - sidecar.pausedAtWallClockMs) : 0;
      const initialIdleSummary =
        crossSessionElapsedMs > 0
          ? applyIdleCatchup(engine, crossSessionElapsedMs)
          : applyIdleCatchup(engine, 0);

      if (sidecar !== null) {
        clearIdleSidecar();
      }

      const state = useGameStore.getState();
      state.setSelectedBuilding(null);
      state.setSelectedBuildingAnchor(null);
      state.setBeltPreview(null);
      state.setPendingEnergyLinkSource(null);
      state.setIdleSummary(initialIdleSummary.appliedSeconds > 0 ? initialIdleSummary : null);
      setSimulationTime(engine.simulationTime);
      setSelectedTool(selectedTool);
      setSeedInput(String(Number.isFinite(mapSeed) ? mapSeed : engine.mapSeed ?? DEFAULT_MAP_SEED));
      setEngine(engine);
      finalizePendingScenarioInstall();

      worldSaver = createDebouncedTask(() => {
        saveWorldSession(engine, sessionId);
      }, WORLD_SAVE_DELAY_MS);
      viewSaver = createDebouncedTask(() => {
        const viewState = useGameStore.getState();
        saveViewSession({
          engine,
          selectedTool: viewState.selectedTool,
          selectedBotProfileId: viewState.selectedBotProfileId,
          seedInput: viewState.seedInput,
          sessionId,
        });
      }, VIEW_SAVE_DELAY_MS);

      if (!loadedSession) {
        worldSaver.flush();
        viewSaver.flush();
      } else if (initialIdleSummary.appliedSeconds > 0) {
        worldSaver.flush();
      }

      if (typeof document !== 'undefined' && document.hidden) {
        simState = 'PAUSED';
        pausedAtWallClockMs = Date.now();
        writeIdleSidecar(sessionId, pausedAtWallClockMs);
      }

      // Initialize action logger for LLM training data collection
      const actionLogger = new ActionLogger(sessionId);
      actionLogger.bindAutoSave();
      useGameStore.getState().setActionLogger(actionLogger);
      
      // Register action logger with engine to capture all actions
      unsubscribeActions = engine.setActionListener((action) => {
        actionLogger.log(action.kind as ActionKind, action.payload);
      });

      unsubscribeEngine = engine.subscribe((kind) => {
        if (kind === 'world') {
          worldSaver?.schedule();
          useGameStore.getState().bumpWorldVersion();
          return;
        }
        viewSaver?.schedule();
      });

      if (import.meta.env.DEV) {
        const devEngine = engine as DevEngine;
        devEngine.scenarios = createDevScenarioApi(engine);
        (window as unknown as { engine: DevEngine }).engine = devEngine;
      }

      botSession = createBotSession({ engine, initialProfileId: initialBotProfileId });

      const MIN_IDLE_MS = 1000;

      const applyIdleBatchCatchup = (elapsedMs: number) => {
        if (elapsedMs < MIN_IDLE_MS) return;
        const idleSummary = applyIdleCatchup(engine, elapsedMs);
        if (idleSummary.appliedSeconds <= 0) return;
        useGameStore.getState().setIdleSummary(idleSummary);
        useGameStore.getState().setSimulationTime(engine.simulationTime);
        saveWorldSession(engine, sessionId);
      };

      gridRenderer = new GridRenderer(app, engine);
      terrainDecalRenderer = new TerrainDecalRenderer(app, engine);
      resourceRenderer = new ResourceRenderer(app, engine);
      buildingRenderer = new BuildingRenderer(app, engine);
      beltRenderer = new BeltRenderer(app, engine);
      beltFlowAnimator = new BeltFlowAnimator(app, engine);
      buildingHighlightRenderer = new BuildingHighlightRenderer(app, engine, () => {
        const { selectedTool } = useGameStore.getState();
        return { selectedTool };
      });
      placementPreviewRenderer = new PlacementPreviewRenderer(app, engine, () => {
        const { selectedTool, hoverTile, beltPreview, currentBuildingRotation } = useGameStore.getState();
        return { selectedTool, hoverTile, beltPreview, currentBuildingRotation };
      });
      const mouseScreenPos = { x: 0, y: 0, valid: false };
      energyLinkRenderer = new EnergyLinkRenderer(app, engine, () => {
        const { selectedTool, pendingEnergyLinkSource } = useGameStore.getState();
        const isEnergyLink = selectedTool.kind === 'energy_link';
        let mouseWorldPos: { x: number; y: number } | null = null;
        if (isEnergyLink && pendingEnergyLinkSource !== null && mouseScreenPos.valid) {
          const { wx, wy } = screenToWorld(engine.viewport, mouseScreenPos.x, mouseScreenPos.y);
          mouseWorldPos = { x: wx, y: wy };
        }
        return {
          mode: isEnergyLink ? 'energy_link' : 'normal',
          pendingSourceId: isEnergyLink ? pendingEnergyLinkSource : null,
          mouseWorldPos,
        };
      });
      fogOfWarRenderer = new FogOfWarRenderer(app, engine, () => {
        const { selectedTool, hoverTile } = useGameStore.getState();
        return { selectedTool, hoverTile };
      });
      dayNightOverlayRenderer = new DayNightOverlayRenderer(app, engine);
      minimapRenderer = new MinimapRenderer(app, engine, () => {
        const { selectedTool, hoverTile } = useGameStore.getState();
        return { selectedTool, hoverTile };
      });

      const currentInputHandler = new InputHandler(
        engine,
        () => useGameStore.getState().selectedTool,
        () => useGameStore.getState().currentBuildingRotation,
      );
      
      keyboardHandler = new KeyboardHandler(engine);
      keyboardHandler.initialize();

      const currentBeltToolController = new BeltToolController(
        engine,
        () => useGameStore.getState().selectedTool,
        useGameStore.getState().setBeltPreview,
      );
      unsubscribeTool = useGameStore.subscribe((nextState, previousState) => {
        const selectedToolChanged = !selectedToolsEqual(nextState.selectedTool, previousState.selectedTool);
        const profileChanged = nextState.selectedBotProfileId !== previousState.selectedBotProfileId;
        const seedChanged = nextState.seedInput !== previousState.seedInput;

        if (profileChanged || seedChanged) {
          viewSaver?.schedule();
        }

        if (selectedToolChanged) {
          viewSaver?.schedule();
          if (previousState.selectedTool.kind === 'belt' && nextState.selectedTool.kind !== 'belt') {
            currentBeltToolController.clearPendingPlacement();
          }
        }
      });

      currentInputHandler.setHoverCallback(useGameStore.getState().setHoverTile);
      currentInputHandler.setBuildingSelectedCallback((buildingId) => {
        const state = useGameStore.getState();
        state.setSelectedBuilding(buildingId);
        if (buildingId === null) {
          state.setSelectedBuildingAnchor(null);
          state.setPendingEnergyLinkSource(null);
          return;
        }
        state.setSelectedResourceTile(null);
        state.setSelectedResourceAnchor(null);
      });
      currentInputHandler.setResourceSelectedCallback((tile) => {
        const state = useGameStore.getState();
        state.setSelectedResourceTile(tile);
        if (tile === null) {
          state.setSelectedResourceAnchor(null);
          return;
        }
        state.setSelectedBuilding(null);
        state.setSelectedBuildingAnchor(null);
        state.setPendingEnergyLinkSource(null);
      });
      currentInputHandler.setBuildingPlacedCallback((buildingId) => {
        const state = useGameStore.getState();
        handleBuildingPlaced(state, buildingId);
      });
      currentInputHandler.setEnergyLinkClickCallback((clickedBuildingId) => {
        const state = useGameStore.getState();
        handleEnergyLinkClick(engine, state, clickedBuildingId);
      });
      currentInputHandler.setOutOfGridClickCallback(() => {
        if (popCancelStack(useGameStore, currentBeltToolController)) {
          engine.emitSfx({ type: 'cancel_pop' });
        }
      });
      currentInputHandler.setInvalidPlacementCallback((origin, buildingType) => {
        const type = getBuildingType(buildingType);
        if (!type) return;
        placementPreviewRenderer?.flashInvalid(origin, type.footprint);
      });

      const canvas = app.canvas;
      handlePointerDown = (e) => {
        // The minimap handles its own clicks; don't build or select underneath it.
        if (minimapRenderer?.containsScreenPoint(e.offsetX, e.offsetY)) return;
        currentInputHandler.onPointerDown(e.offsetX, e.offsetY, e.button);
        currentBeltToolController.onPointerDown(e.offsetX, e.offsetY, e.button);
      };
      handlePointerMove = (e) => {
        mouseScreenPos.x = e.offsetX;
        mouseScreenPos.y = e.offsetY;
        mouseScreenPos.valid = true;
        currentInputHandler.onPointerMove(e.offsetX, e.offsetY);
        currentBeltToolController.onPointerMove(e.offsetX, e.offsetY);
      };
      handlePointerUp = (e) => {
        currentInputHandler.onPointerUp();
        currentBeltToolController.onPointerUp(e.offsetX, e.offsetY, e.button);
      };
      handlePointerLeave = () => {
        mouseScreenPos.valid = false;
        currentInputHandler.onPointerLeave();
        currentBeltToolController.onPointerLeave();
      };
      handleContextMenu = (e) => {
        e.preventDefault();
      };
      handleWheel = (e) => {
        e.preventDefault();
        currentInputHandler.onWheel(e.offsetX, e.offsetY, e.deltaX, e.deltaY, e.ctrlKey, e.deltaMode, e.shiftKey);
      };
      handleKeyDown = (e) => {
        const target = e.target;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable)
        ) {
          return;
        }
        if ((e.key === 'r' || e.key === 'R') && useGameStore.getState().selectedTool.kind === 'building') {
          useGameStore.getState().rotateBuildingRotation();
          engine.emitSfx({ type: 'rotate_click' });
          return;
        }
        if (e.key === 'Escape') {
          if (popCancelStack(useGameStore, currentBeltToolController)) {
            engine.emitSfx({ type: 'cancel_pop' });
          }
        }
      };
      handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          if (simState === 'PAUSED') return;
          worldSaver?.flush();
          viewSaver?.flush();
          pausedAtWallClockMs = Date.now();
          writeIdleSidecar(sessionId, pausedAtWallClockMs);
          simState = 'PAUSED';
          return;
        }
        if (document.visibilityState === 'visible') {
          if (simState !== 'PAUSED' || pausedAtWallClockMs === null) return;
          const elapsedMs = Math.max(0, Date.now() - pausedAtWallClockMs);
          simState = 'ACTIVE';
          pausedAtWallClockMs = null;
          clearIdleSidecar();
          applyIdleBatchCatchup(elapsedMs);
        }
      };
      handleBeforeUnload = () => {
        if (hasPendingScenarioInstall()) {
          return;
        }
        worldSaver?.flush();
        viewSaver?.flush();
        if (simState !== 'PAUSED') {
          writeIdleSidecar(sessionId, Date.now());
        }
      };
      handlePageHide = () => {
        if (hasPendingScenarioInstall()) {
          return;
        }
        worldSaver?.flush();
        viewSaver?.flush();
        if (simState !== 'PAUSED') {
          writeIdleSidecar(sessionId, Date.now());
        }
      };

      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointermove', handlePointerMove);
      canvas.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointerleave', handlePointerLeave);
      canvas.addEventListener('contextmenu', handleContextMenu);
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('keydown', handleKeyDown);
      document.addEventListener('visibilitychange', handleVisibilityChange);
      window.addEventListener('beforeunload', handleBeforeUnload);
      window.addEventListener('pagehide', handlePageHide);

      resizeObserver = new ResizeObserver(() => {
        if (app) engine.viewport.resize(app.screen.width, app.screen.height);
      });
      resizeObserver.observe(container);

      app.ticker.add((ticker) => {
        const state = useGameStore.getState();
        if (simState === 'PAUSED' || (typeof document !== 'undefined' && document.hidden)) {
          return;
        }
        const dtSeconds = ticker.deltaMS / 1000;
        if (state.simulationSpeed > 0) {
          engine.update(dtSeconds * state.simulationSpeed);
        }
        beltFlowAnimator!.update(ticker.deltaMS);
        // Quantize to in-game minutes so the store only updates when the displayed clock changes
        const SIM_MINUTE = 1 / (24 * 60);
        const quantized = Math.floor(engine.simulationTime / SIM_MINUTE) * SIM_MINUTE;
        if (state.simulationTime !== quantized) {
          state.setSimulationTime(quantized);
        }
        const {
          selectedBuildingAnchor,
          selectedBuildingId,
          selectedResourceAnchor,
          selectedResourceTile,
        } = state;

        if (selectedBuildingId === null) {
          if (selectedBuildingAnchor !== null) state.setSelectedBuildingAnchor(null);
        } else {
          const building = engine.getBuildings().get(selectedBuildingId);
          if (!building) {
            state.setSelectedBuilding(null);
            if (selectedBuildingAnchor !== null) state.setSelectedBuildingAnchor(null);
          } else {
            const type = getBuildingType(building.typeId);
            if (!type) {
              state.setSelectedBuilding(null);
              if (selectedBuildingAnchor !== null) state.setSelectedBuildingAnchor(null);
            } else {
              const worldX = building.origin.x * TILE_SIZE + (type.footprint.w * TILE_SIZE) / 2;
              const worldY = building.origin.y * TILE_SIZE + type.footprint.h * TILE_SIZE;
              const anchor = worldToScreen(engine.viewport, worldX, worldY);
              const ax = Math.round(anchor.sx);
              const ay = Math.round(anchor.sy);
              if (
                selectedBuildingAnchor === null ||
                selectedBuildingAnchor.x !== ax ||
                selectedBuildingAnchor.y !== ay
              ) {
                state.setSelectedBuildingAnchor({ x: ax, y: ay });
              }
            }
          }
        }

        if (selectedResourceTile === null) {
          if (selectedResourceAnchor !== null) state.setSelectedResourceAnchor(null);
        } else {
          const resource = engine.getResourceAt(selectedResourceTile.x, selectedResourceTile.y);
          const building = engine.getBuildingAt(selectedResourceTile.x, selectedResourceTile.y);
          if (resource === ResourceType.None || building !== null) {
            state.setSelectedResourceTile(null);
            if (selectedResourceAnchor !== null) state.setSelectedResourceAnchor(null);
          } else {
            const worldX = selectedResourceTile.x * TILE_SIZE + TILE_SIZE / 2;
            const worldY = selectedResourceTile.y * TILE_SIZE;
            const anchor = worldToScreen(engine.viewport, worldX, worldY);
            const ax = Math.round(anchor.sx);
            const ay = Math.round(anchor.sy);
            if (
              selectedResourceAnchor === null ||
              selectedResourceAnchor.x !== ax ||
              selectedResourceAnchor.y !== ay
            ) {
              state.setSelectedResourceAnchor({ x: ax, y: ay });
            }
          }
        }

        gridRenderer!.render();
        terrainDecalRenderer!.render();
        resourceRenderer!.render();
        buildingRenderer!.render();
        beltRenderer!.render();
        beltFlowAnimator!.render();
        buildingHighlightRenderer!.render();
        placementPreviewRenderer!.render();
        energyLinkRenderer!.render();
        fogOfWarRenderer!.render();
        dayNightOverlayRenderer!.render();
        minimapRenderer!.render();
        engine.grid.clearDirty();
      });
    };

    void init();

    return () => {
      destroyed = true;
      if (initCompleted) {
        const shouldPersistOnCleanup = useGameStore.getState().engine === currentEngine;
        if (shouldPersistOnCleanup && !hasPendingScenarioInstall()) {
          worldSaver?.flush();
          viewSaver?.flush();
        }
        botSession?.destroy();
        worldSaver?.cancel();
        viewSaver?.cancel();
        unsubscribeTool?.();
        unsubscribeEngine?.();
        unsubscribeActions?.();
        resizeObserver?.disconnect();
        if (app?.canvas && handlePointerDown) app.canvas.removeEventListener('pointerdown', handlePointerDown);
        if (app?.canvas && handlePointerMove) app.canvas.removeEventListener('pointermove', handlePointerMove);
        if (app?.canvas && handlePointerUp) app.canvas.removeEventListener('pointerup', handlePointerUp);
        if (app?.canvas && handlePointerLeave) app.canvas.removeEventListener('pointerleave', handlePointerLeave);
        if (app?.canvas && handleContextMenu) app.canvas.removeEventListener('contextmenu', handleContextMenu);
        if (app?.canvas && handleWheel) app.canvas.removeEventListener('wheel', handleWheel);
        if (handleKeyDown) window.removeEventListener('keydown', handleKeyDown);
        if (handleVisibilityChange) document.removeEventListener('visibilitychange', handleVisibilityChange);
        if (handleBeforeUnload) window.removeEventListener('beforeunload', handleBeforeUnload);
        if (handlePageHide) window.removeEventListener('pagehide', handlePageHide);
        useGameStore.getState().setBeltPreview(null);
        placementPreviewRenderer?.destroy();
        buildingHighlightRenderer?.destroy();
        beltFlowAnimator?.destroy();
        beltRenderer?.destroy();
        energyLinkRenderer?.destroy();
        fogOfWarRenderer?.destroy();
        dayNightOverlayRenderer?.destroy();
        minimapRenderer?.destroy();
        keyboardHandler?.destroy();
        buildingRenderer?.destroy();
        resourceRenderer?.destroy();
        terrainDecalRenderer?.destroy();
        gridRenderer?.destroy();
        app?.destroy(true);
      }
    };
  }, [
    sessionEpoch,
    setEngine,
    setSelectedTool,
    setSimulationTime,
    setSeedInput,
  ]);

  return <div ref={containerRef} className={`w-full h-full ${CURSOR_CLASS[selectedToolKind]}`} />;
}
