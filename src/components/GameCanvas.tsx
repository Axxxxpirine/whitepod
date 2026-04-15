import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { GameEngine } from '@/game/engine/GameEngine';
import { GridRenderer } from '@/game/renderer/GridRenderer';
import { ResourceRenderer } from '@/game/renderer/ResourceRenderer';
import { BuildingRenderer } from '@/game/renderer/BuildingRenderer';
import { PlacementPreviewRenderer } from '@/game/renderer/PlacementPreviewRenderer';
import { InputHandler } from '@/game/engine/InputHandler';
import { useGameStore } from '@/store/useGameStore';
import { loadResourceTextures } from '@/game/renderer/TileSprite';
import { TILE_SIZE } from '@/game/constants';
import { getBuildingType } from '@/game/data/buildingCatalog';
import { worldToScreen } from '@/game/engine/CoordinateTransform';

const MAP_SEED = 42;

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initEngine = useGameStore((s) => s.initEngine);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let initCompleted = false;
    let app: Application | null = null;
    let gridRenderer: GridRenderer | null = null;
    let resourceRenderer: ResourceRenderer | null = null;
    let buildingRenderer: BuildingRenderer | null = null;
    let placementPreviewRenderer: PlacementPreviewRenderer | null = null;
    let handlePointerDown: ((e: PointerEvent) => void) | null = null;
    let handlePointerMove: ((e: PointerEvent) => void) | null = null;
    let handlePointerUp: (() => void) | null = null;
    let handlePointerLeave: (() => void) | null = null;
    let handleContextMenu: ((e: MouseEvent) => void) | null = null;
    let handleWheel: ((e: WheelEvent) => void) | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const init = async () => {
      app = new Application();
      await app.init({
        resizeTo: container,
        backgroundColor: 0x000000,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      // Mark init as complete so the cleanup knows it's safe to call destroy()
      initCompleted = true;

      if (destroyed) {
        app.destroy(true);
        return;
      }

      container.appendChild(app.canvas);

      // Load resource sprites before generating the map
      await loadResourceTextures();

      if (destroyed) {
        app.destroy(true);
        return;
      }

      const engine = new GameEngine(app.screen.width, app.screen.height);
      engine.generateMap(MAP_SEED);
      initEngine(engine);
      if (import.meta.env.DEV) {
        (window as unknown as { engine: GameEngine }).engine = engine;
      }

      gridRenderer = new GridRenderer(app, engine);
      resourceRenderer = new ResourceRenderer(app, engine);
      buildingRenderer = new BuildingRenderer(app, engine);
      placementPreviewRenderer = new PlacementPreviewRenderer(app, engine, () => {
        const { selectedTool, hoverTile } = useGameStore.getState();
        return { selectedTool, hoverTile };
      });
      const currentInputHandler = new InputHandler(engine, () => useGameStore.getState().selectedTool);
      currentInputHandler.setHoverCallback(useGameStore.getState().setHoverTile);
      currentInputHandler.setBuildingSelectedCallback((buildingId) => {
        const state = useGameStore.getState();
        state.setSelectedBuilding(buildingId);
        if (buildingId === null) {
          state.setSelectedBuildingAnchor(null);
        }
      });
      currentInputHandler.setBuildingPlacedCallback(() => {
        const state = useGameStore.getState();
        state.setSelectedTool({ kind: 'select' });
        state.setSelectedBuilding(null);
        state.setSelectedBuildingAnchor(null);
      });
      const canvas = app.canvas;

      handlePointerDown = (e) => {
        currentInputHandler.onPointerDown(e.offsetX, e.offsetY, e.button);
      };
      handlePointerMove = (e) => {
        currentInputHandler.onPointerMove(e.offsetX, e.offsetY);
      };
      handlePointerUp = () => {
        currentInputHandler.onPointerUp();
      };
      handlePointerLeave = () => {
        currentInputHandler.onPointerLeave();
      };
      handleContextMenu = (e) => {
        e.preventDefault();
      };
      handleWheel = (e) => {
        e.preventDefault();
        currentInputHandler.onWheel(e.offsetX, e.offsetY, e.deltaX, e.deltaY, e.ctrlKey, e.deltaMode);
      };

      canvas.addEventListener('pointerdown', handlePointerDown);
      canvas.addEventListener('pointermove', handlePointerMove);
      canvas.addEventListener('pointerup', handlePointerUp);
      canvas.addEventListener('pointerleave', handlePointerLeave);
      canvas.addEventListener('contextmenu', handleContextMenu);
      canvas.addEventListener('wheel', handleWheel, { passive: false });

      resizeObserver = new ResizeObserver(() => {
        if (app) {
          engine.viewport.resize(app.screen.width, app.screen.height);
        }
      });
      resizeObserver.observe(container);

      app.ticker.add(() => {
        const state = useGameStore.getState();
        const { selectedBuildingAnchor, selectedBuildingId } = state;

        if (selectedBuildingId === null) {
          if (selectedBuildingAnchor !== null) {
            state.setSelectedBuildingAnchor(null);
          }
        } else {
          const building = engine.getBuildings().get(selectedBuildingId);
          if (!building) {
            state.setSelectedBuilding(null);
            if (selectedBuildingAnchor !== null) {
              state.setSelectedBuildingAnchor(null);
            }
          } else {
            const type = getBuildingType(building.typeId);
            if (!type) {
              state.setSelectedBuilding(null);
              if (selectedBuildingAnchor !== null) {
                state.setSelectedBuildingAnchor(null);
              }
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
        placementPreviewRenderer!.render();
        engine.grid.clearDirty();
      });
    };

    void init();

    return () => {
      destroyed = true;
      // Only destroy if init() completed — otherwise the async init() will
      // see destroyed=true and call destroy() itself after app.init() finishes.
      if (initCompleted) {
        resizeObserver?.disconnect();
        if (app?.canvas && handlePointerDown) app.canvas.removeEventListener('pointerdown', handlePointerDown);
        if (app?.canvas && handlePointerMove) app.canvas.removeEventListener('pointermove', handlePointerMove);
        if (app?.canvas && handlePointerUp) app.canvas.removeEventListener('pointerup', handlePointerUp);
        if (app?.canvas && handlePointerLeave) app.canvas.removeEventListener('pointerleave', handlePointerLeave);
        if (app?.canvas && handleContextMenu) app.canvas.removeEventListener('contextmenu', handleContextMenu);
        if (app?.canvas && handleWheel) app.canvas.removeEventListener('wheel', handleWheel);
        placementPreviewRenderer?.destroy();
        buildingRenderer?.destroy();
        resourceRenderer?.destroy();
        gridRenderer?.destroy();
        app?.destroy(true);
      }
    };
  }, [initEngine]);

  return <div ref={containerRef} className="w-full h-full" />;
}
