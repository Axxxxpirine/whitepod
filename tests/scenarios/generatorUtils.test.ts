import { describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { screenToGrid } from '@/game/engine/CoordinateTransform';
import { makeViewport } from '@/game/scenarios/generatorUtils';

describe('makeViewport', () => {
  it('centers the camera on the anchor tile', () => {
    const engine = new GameEngine(640, 480);
    const snapshot = makeViewport(engine, { x: 131, y: 124 }, 0.7);

    expect(snapshot.zoom).toBe(0.7);
    expect(screenToGrid(engine.viewport, 320, 240)).toEqual({ x: 131, y: 124 });
  });
});
