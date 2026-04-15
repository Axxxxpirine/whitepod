import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';
import { GameEngine } from '@/game/engine/GameEngine';
import { GridRenderer } from '@/game/renderer/GridRenderer';
import { InputHandler } from '@/game/engine/InputHandler';
import { useGameStore } from '@/store/useGameStore';

export function GameCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initEngine = useGameStore((s) => s.initEngine);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;
    let initCompleted = false;
    let app: Application | null = null;
    let renderer: GridRenderer | null = null;

    const init = async () => {
      app = new Application();
      await app.init({
        resizeTo: container,
        backgroundColor: 0x1a1a2e,
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

      const engine = new GameEngine(app.screen.width, app.screen.height);
      initEngine(engine);

      renderer = new GridRenderer(app, engine);
      const inputHandler = new InputHandler(engine);

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
          inputHandler.onWheel(e.offsetX, e.offsetY, e.deltaY);
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
        renderer!.render();
      });
    };

    void init();

    return () => {
      destroyed = true;
      // Only destroy if init() completed — otherwise the async init() will
      // see destroyed=true and call destroy() itself after app.init() finishes.
      if (initCompleted) {
        renderer?.destroy();
        app?.destroy(true);
      }
    };
  }, [initEngine]);

  return <div ref={containerRef} className="w-full h-full" />;
}
