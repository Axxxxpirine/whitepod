import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { DEFAULT_MAP_SEED, TILE_SIZE } from '@/game/constants';
import { GameEngine } from '@/game/engine/GameEngine';
import { GridRenderer } from '@/game/renderer/GridRenderer';
import { ResourceRenderer } from '@/game/renderer/ResourceRenderer';
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
import { PIXI } from '@/design/tokens';
import {
  createSessionId,
  loadPersistedSession,
  saveViewSession,
  saveWorldSession,
} from '@/game/persistence/sessionStorage';
import { useGameStore } from '@/store/useGameStore';
import { loadBuildingTextures, loadResourceTextures } from '@/game/renderer/TileSprite';
import type { SelectedTool } from '@/game/types';
import { getBuildingType } from '@/game/data/buildingCatalog';
import { worldToScreen, screenToWorld } from '@/game/engine/CoordinateTransform';
import {
  handleBuildingPlaced,
  handleEnergyLinkClick,
  selectedToolsEqual,
} from './energyLinkHandlers';

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

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionEpoch = useGameStore((s) => s.sessionEpoch);
  const setEngine = useGameStore((s) => s.setEngine);
  const setSelectedTool = useGameStore((s) => s.setSelectedTool);
  const selectedToolKind = useGameStore((s) => s.selectedTool.kind);
  const setSimulationTime = useGameStore((s) => s.setSimulationTime);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let initCompleted = false;
    let app: Application | null = null;
    let gridRenderer: GridRenderer | null = null;
    let resourceRenderer: ResourceRenderer | null = null;
    let buildingRenderer: BuildingRenderer | null = null;
    let beltRenderer: BeltRenderer | null = null;
    let beltFlowAnimator: BeltFlowAnimator | null = null;
    let placementPreviewRenderer: PlacementPreviewRenderer | null = null;
    let buildingHighlightRenderer: BuildingHighlightRenderer | null = null;
    let energyLinkRenderer: EnergyLinkRenderer | null = null;
    let fogOfWarRenderer: FogOfWarRenderer | null = null;
    let dayNightOverlayRenderer: DayNightOverlayRenderer | null = null;
    let handlePointerDown: ((e: PointerEvent) => void) | null = null;
    let handlePointerMove: ((e: PointerEvent) => void) | null = null;
    let handlePointerUp: ((e: PointerEvent) => void) | null = null;
    let handlePointerLeave: (() => void) | null = null;
    let handleContextMenu: ((e: MouseEvent) => void) | null = null;
    let handleWheel: ((e: WheelEvent) => void) | null = null;
    let handleKeyDown: ((e: KeyboardEvent) => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let unsubscribeEngine: (() => void) | null = null;
    let unsubscribeTool: (() => void) | null = null;
    let worldSaver: ReturnType<typeof createDebouncedTask> | null = null;
    let viewSaver: ReturnType<typeof createDebouncedTask> | null = null;
    let currentEngine: GameEngine | null = null;

    const init = async () => {
      app = new Application();
      await app.init({
        resizeTo: container,
        backgroundColor: PIXI.bg,
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

      if (!loadedSession) {
        engine.generateMap(DEFAULT_MAP_SEED);
      }

      const state = useGameStore.getState();
      state.setSelectedBuilding(null);
      state.setSelectedBuildingAnchor(null);
      state.setBeltPreview(null);
      setSimulationTime(engine.simulationTime);
      setSelectedTool(selectedTool);
      setEngine(engine);

      worldSaver = createDebouncedTask(() => {
        saveWorldSession(engine, sessionId);
      }, WORLD_SAVE_DELAY_MS);
      viewSaver = createDebouncedTask(() => {
        saveViewSession({
          engine,
          selectedTool: useGameStore.getState().selectedTool,
          sessionId,
        });
      }, VIEW_SAVE_DELAY_MS);

      if (!loadedSession) {
        worldSaver.flush();
        viewSaver.flush();
      }

      unsubscribeEngine = engine.subscribe((kind) => {
        if (kind === 'world') {
          worldSaver?.schedule();
          useGameStore.getState().bumpWorldVersion();
          return;
        }
        viewSaver?.schedule();
      });

      if (import.meta.env.DEV) {
        (window as unknown as { engine: GameEngine }).engine = engine;
      }

      gridRenderer = new GridRenderer(app, engine);
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

      const currentInputHandler = new InputHandler(
        engine,
        () => useGameStore.getState().selectedTool,
        () => useGameStore.getState().currentBuildingRotation,
      );
      const currentBeltToolController = new BeltToolController(
        engine,
        () => useGameStore.getState().selectedTool,
        useGameStore.getState().setBeltPreview,
      );
      unsubscribeTool = useGameStore.subscribe((nextState, previousState) => {
        if (!selectedToolsEqual(nextState.selectedTool, previousState.selectedTool)) {
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
        }
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
        popCancelStack(useGameStore, currentBeltToolController);
      });
      currentInputHandler.setInvalidPlacementCallback((origin, buildingType) => {
        const type = getBuildingType(buildingType);
        if (!type) return;
        placementPreviewRenderer?.flashInvalid(origin, type.footprint);
      });

      const canvas = app.canvas;
      handlePointerDown = (e) => {
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
        currentInputHandler.onWheel(e.offsetX, e.offsetY, e.deltaX, e.deltaY, e.ctrlKey, e.deltaMode);
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
          return;
        }
        if (e.key === 'Escape') {
          popCancelStack(useGameStore, currentBeltToolController);
        }
      };

      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointermove', handlePointerMove);
      canvas.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointerleave', handlePointerLeave);
      canvas.addEventListener('contextmenu', handleContextMenu);
      canvas.addEventListener('wheel', handleWheel, { passive: false });
      window.addEventListener('keydown', handleKeyDown);

      resizeObserver = new ResizeObserver(() => {
        if (app) engine.viewport.resize(app.screen.width, app.screen.height);
      });
      resizeObserver.observe(container);

      app.ticker.add((ticker) => {
        const state = useGameStore.getState();
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
        const { selectedBuildingAnchor, selectedBuildingId } = state;

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

        gridRenderer!.render();
        resourceRenderer!.render();
        buildingRenderer!.render();
        beltRenderer!.render();
        beltFlowAnimator!.render();
        buildingHighlightRenderer!.render();
        placementPreviewRenderer!.render();
        energyLinkRenderer!.render();
        fogOfWarRenderer!.render();
        dayNightOverlayRenderer!.render();
        engine.grid.clearDirty();
      });
    };

    void init();

    return () => {
      destroyed = true;
      if (initCompleted) {
        const shouldPersistOnCleanup = useGameStore.getState().engine === currentEngine;
        if (shouldPersistOnCleanup) {
          worldSaver?.flush();
          viewSaver?.flush();
        }
        worldSaver?.cancel();
        viewSaver?.cancel();
        unsubscribeTool?.();
        unsubscribeEngine?.();
        resizeObserver?.disconnect();
        if (app?.canvas && handlePointerDown) app.canvas.removeEventListener('pointerdown', handlePointerDown);
        if (app?.canvas && handlePointerMove) app.canvas.removeEventListener('pointermove', handlePointerMove);
        if (app?.canvas && handlePointerUp) app.canvas.removeEventListener('pointerup', handlePointerUp);
        if (app?.canvas && handlePointerLeave) app.canvas.removeEventListener('pointerleave', handlePointerLeave);
        if (app?.canvas && handleContextMenu) app.canvas.removeEventListener('contextmenu', handleContextMenu);
        if (app?.canvas && handleWheel) app.canvas.removeEventListener('wheel', handleWheel);
        if (handleKeyDown) window.removeEventListener('keydown', handleKeyDown);
        useGameStore.getState().setBeltPreview(null);
        placementPreviewRenderer?.destroy();
        buildingHighlightRenderer?.destroy();
        beltFlowAnimator?.destroy();
        beltRenderer?.destroy();
        energyLinkRenderer?.destroy();
        fogOfWarRenderer?.destroy();
        dayNightOverlayRenderer?.destroy();
        buildingRenderer?.destroy();
        resourceRenderer?.destroy();
        gridRenderer?.destroy();
        app?.destroy(true);
      }
    };
  }, [sessionEpoch, setEngine, setSelectedTool, setSimulationTime]);

  return <div ref={containerRef} className={`w-full h-full ${CURSOR_CLASS[selectedToolKind]}`} />;
}
