import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { DEFAULT_MAP_SEED, TILE_SIZE } from '@/game/constants';
import { GameEngine } from '@/game/engine/GameEngine';
import { GridRenderer } from '@/game/renderer/GridRenderer';
import { ResourceRenderer } from '@/game/renderer/ResourceRenderer';
import { BuildingRenderer } from '@/game/renderer/BuildingRenderer';
import { BeltRenderer } from '@/game/renderer/BeltRenderer';
import { EnergyLinkRenderer } from '@/game/renderer/EnergyLinkRenderer';
import { PlacementPreviewRenderer } from '@/game/renderer/PlacementPreviewRenderer';
import { InputHandler } from '@/game/engine/InputHandler';
import { BeltToolController } from '@/game/engine/BeltToolController';
import {
  createSessionId,
  loadPersistedSession,
  saveViewSession,
  saveWorldSession,
} from '@/game/persistence/sessionStorage';
import { useGameStore } from '@/store/useGameStore';
import { loadResourceTextures } from '@/game/renderer/TileSprite';
import { getBuildingType, SOLAR_PANEL_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { worldToScreen } from '@/game/engine/CoordinateTransform';

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

function selectedToolsEqual(
  left: ReturnType<typeof useGameStore.getState>['selectedTool'],
  right: ReturnType<typeof useGameStore.getState>['selectedTool'],
): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === 'select' && right.kind === 'select') return true;
  if (left.kind === 'belt' && right.kind === 'belt') return true;
  if (left.kind === 'building' && right.kind === 'building') {
    return left.buildingType === right.buildingType;
  }
  return false;
}

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionEpoch = useGameStore((s) => s.sessionEpoch);
  const setEngine = useGameStore((s) => s.setEngine);
  const setSelectedTool = useGameStore((s) => s.setSelectedTool);

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
    let placementPreviewRenderer: PlacementPreviewRenderer | null = null;
    let energyLinkRenderer: EnergyLinkRenderer | null = null;
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
        backgroundColor: 0x000000,
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
          return;
        }
        viewSaver?.schedule();
      });
      unsubscribeTool = useGameStore.subscribe((nextState, previousState) => {
        if (!selectedToolsEqual(nextState.selectedTool, previousState.selectedTool)) {
          viewSaver?.schedule();
        }
      });

      if (import.meta.env.DEV) {
        (window as unknown as { engine: GameEngine }).engine = engine;
      }

      gridRenderer = new GridRenderer(app, engine);
      resourceRenderer = new ResourceRenderer(app, engine);
      buildingRenderer = new BuildingRenderer(app, engine);
      beltRenderer = new BeltRenderer(app, engine);
      placementPreviewRenderer = new PlacementPreviewRenderer(app, engine, () => {
        const { selectedTool, hoverTile, beltPreview, currentBuildingRotation } = useGameStore.getState();
        return { selectedTool, hoverTile, beltPreview, currentBuildingRotation };
      });
      energyLinkRenderer = new EnergyLinkRenderer(app, engine, () => {
        const { selectedBuildingId } = useGameStore.getState();
        return { inspectedBuildingId: selectedBuildingId };
      });

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

      currentInputHandler.setHoverCallback(useGameStore.getState().setHoverTile);
      currentInputHandler.setBuildingSelectedCallback((buildingId) => {
        const state = useGameStore.getState();
        state.setSelectedBuilding(buildingId);
        if (buildingId === null) {
          state.setSelectedBuildingAnchor(null);
        }
      });
      currentInputHandler.setBuildingPlacedCallback((buildingId) => {
        const state = useGameStore.getState();
        state.setSelectedBuilding(null);
        state.setSelectedBuildingAnchor(null);

        if (
          state.selectedTool.kind === 'building' &&
          state.selectedTool.buildingType === SOLAR_PANEL_BUILDING_TYPE_ID &&
          state.linkSolarOnPlacement
        ) {
          state.setPendingEnergyLinkSource(buildingId);
          state.setSelectedTool({ kind: 'energy_link' });
          return;
        }

        state.setPendingEnergyLinkSource(null);
        state.setSelectedTool({ kind: 'select' });
      });
      currentInputHandler.setEnergyLinkClickCallback((clickedBuildingId) => {
        const state = useGameStore.getState();
        const sourceId = state.pendingEnergyLinkSource;

        if (sourceId === null) {
          state.setPendingEnergyLinkSource(clickedBuildingId);
          state.setSelectedBuilding(clickedBuildingId);
          return;
        }

        if (sourceId === clickedBuildingId) return;

        if (engine.areBuildingsEnergyLinked(sourceId, clickedBuildingId)) {
          engine.disconnectBuildings(sourceId, clickedBuildingId);
        } else {
          engine.connectBuildings(sourceId, clickedBuildingId);
        }
        state.setPendingEnergyLinkSource(null);
        state.setSelectedTool({ kind: 'select' });
        state.setSelectedBuilding(sourceId);
      });

      const canvas = app.canvas;
      handlePointerDown = (e) => {
        currentInputHandler.onPointerDown(e.offsetX, e.offsetY, e.button);
        currentBeltToolController.onPointerDown(e.offsetX, e.offsetY, e.button);
      };
      handlePointerMove = (e) => {
        currentInputHandler.onPointerMove(e.offsetX, e.offsetY);
        currentBeltToolController.onPointerMove(e.offsetX, e.offsetY);
      };
      handlePointerUp = (e) => {
        currentInputHandler.onPointerUp();
        currentBeltToolController.onPointerUp(e.offsetX, e.offsetY, e.button);
      };
      handlePointerLeave = () => {
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
        }
        currentBeltToolController.onKeyDown(e.key);
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

      app.ticker.add(() => {
        const state = useGameStore.getState();
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
              if (
                selectedBuildingAnchor === null ||
                selectedBuildingAnchor.x !== anchor.sx ||
                selectedBuildingAnchor.y !== anchor.sy
              ) {
                state.setSelectedBuildingAnchor({ x: anchor.sx, y: anchor.sy });
              }
            }
          }
        }

        gridRenderer!.render();
        resourceRenderer!.render();
        buildingRenderer!.render();
        beltRenderer!.render();
        placementPreviewRenderer!.render();
        energyLinkRenderer!.render();
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
        beltRenderer?.destroy();
        energyLinkRenderer?.destroy();
        buildingRenderer?.destroy();
        resourceRenderer?.destroy();
        gridRenderer?.destroy();
        app?.destroy(true);
      }
    };
  }, [sessionEpoch, setEngine, setSelectedTool]);

  return <div ref={containerRef} className="w-full h-full" />;
}
