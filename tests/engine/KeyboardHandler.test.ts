import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { GRID_HEIGHT, GRID_WIDTH, TILE_SIZE } from '@/game/constants';
import { KeyboardHandler } from '@/game/input/KeyboardHandler';

function press(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key }));
}

describe('KeyboardHandler', () => {
  let handler: KeyboardHandler | null = null;

  afterEach(() => {
    handler?.destroy();
    handler = null;
  });

  it('recenters the camera on the middle of the map with Space', () => {
    const engine = new GameEngine(800, 600);
    engine.viewport.restore({ centerX: 0, centerY: 10, zoom: 2.5 });
    const kinds: string[] = [];
    engine.subscribe((kind) => kinds.push(kind));
    handler = new KeyboardHandler(engine);
    handler.initialize();

    press(' ');

    expect(engine.viewport.getSnapshot()).toEqual({
      centerX: (GRID_WIDTH * TILE_SIZE) / 2,
      centerY: (GRID_HEIGHT * TILE_SIZE) / 2,
      zoom: 1,
    });
    expect(kinds).toContain('viewport');
  });

  it('stops listening once destroyed', () => {
    const engine = new GameEngine(800, 600);
    handler = new KeyboardHandler(engine);
    handler.initialize();
    handler.destroy();
    engine.viewport.restore({ centerX: 0, centerY: 10, zoom: 2.5 });

    press(' ');

    expect(engine.viewport.getSnapshot()).toEqual({ centerX: 0, centerY: 10, zoom: 2.5 });
  });

  it('leaves the top row to the toolbar on AZERTY, where the 6 and 8 keys type "-" and "_"', () => {
    const engine = new GameEngine(800, 600);
    handler = new KeyboardHandler(engine);
    handler.initialize();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', code: 'Digit6' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '_', code: 'Digit8' }));
    expect(engine.viewport.zoom).toBe(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: '-', code: 'Minus' }));
    expect(engine.viewport.zoom).toBeLessThan(1);
  });

  it('leaves Cmd/Ctrl + and - to the browser zoom', () => {
    const engine = new GameEngine(800, 600);
    handler = new KeyboardHandler(engine);
    handler.initialize();

    const event = new KeyboardEvent('keydown', { key: '+', code: 'Equal', metaKey: true, cancelable: true });
    window.dispatchEvent(event);

    expect(engine.viewport.zoom).toBe(1);
    expect(event.defaultPrevented).toBe(false);
  });

  describe('panning', () => {
    let frames: FrameRequestCallback[] = [];
    let now = 0;

    /** Runs `count` animation frames `frameMs` apart. */
    function runFrames(count: number, frameMs: number): void {
      for (let i = 0; i < count; i++) {
        now += frameMs;
        const due = frames;
        frames = [];
        for (const frame of due) frame(now);
      }
    }

    function createHandler(): GameEngine {
      const engine = new GameEngine(800, 600);
      handler = new KeyboardHandler(engine);
      handler.initialize();
      return engine;
    }

    beforeEach(() => {
      frames = [];
      now = 1000;
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
      vi.stubGlobal('cancelAnimationFrame', () => {
        frames = [];
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('pans while a direction key is held and stops on release', () => {
      const engine = createHandler();
      const startX = engine.viewport.centerX;

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD' }));
      runFrames(30, 1000 / 60);
      const heldX = engine.viewport.centerX;
      expect(heldX).toBeGreaterThan(startX);

      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', code: 'KeyD' }));
      runFrames(30, 1000 / 60);
      expect(engine.viewport.centerX).toBe(heldX);
    });

    it('pans the same distance per second at 60 Hz and at 120 Hz', () => {
      const distanceAt = (hz: number): number => {
        const engine = createHandler();
        const startX = engine.viewport.centerX;
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD' }));
        runFrames(hz / 2, 1000 / hz);
        window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd', code: 'KeyD' }));
        handler?.destroy();
        return engine.viewport.centerX - startX;
      };

      const slow = distanceAt(60);
      const fast = distanceAt(120);
      expect(slow).toBeGreaterThan(0);
      expect(Math.abs(fast - slow) / slow).toBeLessThan(0.05);
    });

    it('follows the physical WASD keys on an AZERTY keyboard (ZQSD)', () => {
      const engine = createHandler();
      const startY = engine.viewport.centerY;

      // The key above "S" types "z" on AZERTY: same place as "W" on QWERTY.
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyW' }));
      runFrames(10, 1000 / 60);

      expect(engine.viewport.centerY).toBeLessThan(startY);
    });

    it('stops panning when the window loses focus while a key is held', () => {
      const engine = createHandler();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD' }));
      runFrames(5, 1000 / 60);
      // Alt-tab: the browser never sends the keyup.
      window.dispatchEvent(new Event('blur'));
      const blurredX = engine.viewport.centerX;
      runFrames(30, 1000 / 60);

      expect(engine.viewport.centerX).toBe(blurredX);
    });

    it('ignores browser shortcuts such as Cmd+D, whose keyup never arrives on macOS', () => {
      const engine = createHandler();
      const startX = engine.viewport.centerX;

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', code: 'KeyD', metaKey: true }));
      runFrames(30, 1000 / 60);

      expect(engine.viewport.centerX).toBe(startX);
    });

    it('releases held keys when a modifier comes down mid-pan', () => {
      const engine = createHandler();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' }));
      runFrames(5, 1000 / 60);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Meta', code: 'MetaLeft', metaKey: true }));
      const x = engine.viewport.centerX;
      runFrames(30, 1000 / 60);

      expect(engine.viewport.centerX).toBe(x);
    });

    it('does not keep an animation loop alive for keys that do not pan', () => {
      createHandler();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: '1', code: 'Digit1' }));

      expect(frames).toHaveLength(0);
    });
  });
});
