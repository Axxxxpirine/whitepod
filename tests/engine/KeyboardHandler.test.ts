import { afterEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { isoWorldCenter } from '@/game/engine/IsoTransform';
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

  it('recenters the camera on the middle of the iso world with Space', () => {
    const engine = new GameEngine(800, 600);
    engine.viewport.restore({ centerX: 0, centerY: 10, zoom: 2.5 });
    const kinds: string[] = [];
    engine.subscribe((kind) => kinds.push(kind));
    handler = new KeyboardHandler(engine);
    handler.initialize();

    press(' ');

    const center = isoWorldCenter();
    expect(engine.viewport.getSnapshot()).toEqual({ centerX: center.wx, centerY: center.wy, zoom: 1 });
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
});
