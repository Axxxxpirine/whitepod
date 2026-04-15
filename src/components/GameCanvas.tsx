import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { GameEngine } from '@/game/engine/GameEngine';
import { GridRenderer } from '@/game/renderer/GridRenderer';
import { ResourceRenderer } from '@/game/renderer/ResourceRenderer';
import { BuildingRenderer } from '@/game/renderer/BuildingRenderer';
import { InputHandler } from '@/game/engine/InputHandler';
import { useGameStore } from '@/store/useGameStore';
import { loadResourceTextures } from '@/game/renderer/TileSprite';

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
      const inputHandler = new InputHandler(engine, () => useGameStore.getState().selectedTool);
      inputHandler.setHoverCallback(useGameStore.getState().setHoverTile);

      const canvas = app.canvas;

      canvas.addEventListener('pointerdown', (e) => {
        inputHandler.onPointerDown(e.offsetX, e.offsetY, e.button);
      });
      canvas.addEventListener('pointermove', (e) => {
        inputHandler.onPointerMove(e.offsetX, e.offsetY);
      });
      canvas.addEventListener('pointerup', () => {
        inputHandler.onPointerUp();
      });
      canvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });
      canvas.addEventListener(
        'wheel',
        (e) => {
          e.preventDefault();
          inputHandler.onWheel(e.offsetX, e.offsetY, e.deltaX, e.deltaY, e.ctrlKey, e.deltaMode);
        },
        { passive: false },
      );

      const resizeObserver = new ResizeObserver(() => {
        if (app) {
          engine.viewport.resize(app.screen.width, app.screen.height);
        }
      });
      resizeObserver.observe(container);

      app.ticker.add(() => {
        gridRenderer!.render();
        resourceRenderer!.render();
        buildingRenderer!.render();
        engine.grid.clearDirty();
      });
    };

    void init();

    return () => {
      destroyed = true;
      // Only destroy if init() completed — otherwise the async init() will
      // see destroyed=true and call destroy() itself after app.init() finishes.
      if (initCompleted) {
        buildingRenderer?.destroy();
        resourceRenderer?.destroy();
        gridRenderer?.destroy();
        app?.destroy(true);
      }
    };
  }, [initEngine]);

  return <div ref={containerRef} className="w-full h-full" />;
}
