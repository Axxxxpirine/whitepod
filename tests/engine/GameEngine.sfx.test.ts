import { describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { Direction, ResourceType, TileType } from '@/game/types';

function makeEngine() {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  return engine;
}

describe('GameEngine SFX events', () => {
  it('supports subscribe/unsubscribe without leaks', () => {
    const engine = makeEngine();
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    const unsubA = engine.subscribeSfx(listenerA);
    const unsubB = engine.subscribeSfx(listenerB);

    engine.emitSfx({ type: 'rotate_click' });
    unsubA();
    engine.emitSfx({ type: 'cancel_pop' });
    unsubB();
    engine.emitSfx({ type: 'tool_select', tool: 'select' });

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerA).toHaveBeenCalledWith({ type: 'rotate_click' });
    expect(listenerB).toHaveBeenCalledTimes(2);
  });

  it('emits placement success and failure', () => {
    const engine = makeEngine();
    const onSfx = vi.fn();
    engine.subscribeSfx(onSfx);

    engine.placeBuilding('placeholder_1x1', { x: 1, y: 1 });
    engine.placeBuilding('unknown_type', { x: 1, y: 1 });

    expect(onSfx).toHaveBeenCalledWith({
      type: 'building_place_success',
      buildingType: 'placeholder_1x1',
    });
    expect(onSfx).toHaveBeenCalledWith({
      type: 'building_place_fail',
      buildingType: 'unknown_type',
      reason: 'unknown_type',
    });
  });

  it('emits remove success when a building is deleted', () => {
    const engine = makeEngine();
    const onSfx = vi.fn();
    engine.subscribeSfx(onSfx);

    const id = engine.placeBuilding('placeholder_1x1', { x: 2, y: 2 })!;
    onSfx.mockClear();

    expect(engine.removeBuilding(id)).toBe(true);
    expect(onSfx).toHaveBeenCalledWith({
      type: 'building_remove_success',
      buildingType: 'placeholder_1x1',
    });
  });

  it('emits belt success and preflight failure', () => {
    const engine = makeEngine();
    const onSfx = vi.fn();
    engine.subscribeSfx(onSfx);

    const sourceId = engine.placeBuilding('placeholder_node_1x1', { x: 1, y: 1 })!;
    const storageId = engine.placeBuilding('storage_basic', { x: 4, y: 0 })!;
    onSfx.mockClear();

    const ok = engine.placeBelt(
      { building: sourceId, port: 'out_east' },
      { building: storageId, port: 'in_west' },
    );
    expect(ok.ok).toBe(true);
    expect(onSfx).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'belt_place_success',
      }),
    );

    onSfx.mockClear();
    const fail = engine.placeBelt(
      { building: 9999, port: 'out_east' },
      { building: storageId, port: 'in_west' },
    );
    expect(fail.ok).toBe(false);
    expect(onSfx).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'belt_place_fail',
      }),
    );
  });

  it('emits belt failure when placement rolls back mid-commit', () => {
    const engine = makeEngine();
    const onSfx = vi.fn();
    engine.subscribeSfx(onSfx);

    const source = engine.placeBuilding('placeholder_node_1x1', { x: 5, y: 5 })!;
    const target = engine.placeBuilding('placeholder_node_1x1', { x: 10, y: 5 })!;
    onSfx.mockClear();

    const originalPlaceBuilding = engine.placeBuilding.bind(engine);
    let invocationCount = 0;
    vi.spyOn(engine, 'placeBuilding').mockImplementation((typeId, origin, rotation = Direction.North, options) => {
      invocationCount += 1;
      if (typeId.startsWith('belt_') && invocationCount === 2) {
        return null;
      }
      return originalPlaceBuilding(typeId, origin, rotation, options);
    });

    const result = engine.placeBelt(
      { building: source, port: 'out_east' },
      { building: target, port: 'in_west' },
    );

    expect(result).toEqual({ ok: false, reason: 'tiles_blocked' });
    expect(onSfx).toHaveBeenCalledWith({ type: 'belt_place_fail', reason: 'tiles_blocked' });
  });

  it('emits energy link connect, disconnect and fail', () => {
    const engine = makeEngine();
    const onSfx = vi.fn();
    engine.subscribeSfx(onSfx);

    const a = engine.placeBuilding('solar_panel', { x: 5, y: 5 })!;
    const b = engine.placeBuilding('solar_panel', { x: 8, y: 5 })!;
    onSfx.mockClear();

    expect(engine.connectBuildings(a, b)).toBe(true);
    expect(onSfx).toHaveBeenCalledWith({ type: 'energy_link_connect' });

    onSfx.mockClear();
    expect(engine.disconnectBuildings(a, b)).toBe(true);
    expect(onSfx).toHaveBeenCalledWith({ type: 'energy_link_disconnect' });

    onSfx.mockClear();
    expect(engine.disconnectBuildings(a, b)).toBe(false);
    expect(onSfx).toHaveBeenCalledWith({ type: 'energy_link_fail', action: 'disconnect' });
  });

  it('emits extractor_on immediately when an extractor becomes powered', () => {
    const engine = makeEngine();
    const onSfx = vi.fn();
    engine.subscribeSfx(onSfx);

    engine.setSimulationTime(0.5);
    engine.grid.setResource(3, 3, ResourceType.Coal);
    const extractor = engine.placeBuilding('extractor_basic', { x: 3, y: 3 })!;
    const solar = engine.placeBuilding('solar_panel', { x: 6, y: 3 })!;
    onSfx.mockClear();

    expect(engine.connectBuildings(extractor, solar)).toBe(true);

    expect(onSfx).toHaveBeenCalledWith({ type: 'extractor_on' });
  });

  it('does not re-emit extractor_on while an extractor stays powered', () => {
    const engine = makeEngine();
    const onSfx = vi.fn();
    engine.subscribeSfx(onSfx);

    engine.setSimulationTime(0.5);
    engine.grid.setResource(3, 3, ResourceType.Coal);
    const extractor = engine.placeBuilding('extractor_basic', { x: 3, y: 3 })!;
    const solar = engine.placeBuilding('solar_panel', { x: 6, y: 3 })!;
    expect(engine.connectBuildings(extractor, solar)).toBe(true);

    onSfx.mockClear();
    engine.update(0.1);

    expect(onSfx).not.toHaveBeenCalledWith({ type: 'extractor_on' });
  });

  it('re-emits extractor_on after depower then repower', () => {
    const engine = makeEngine();
    const onSfx = vi.fn();
    engine.subscribeSfx(onSfx);

    engine.setSimulationTime(0.5);
    engine.grid.setResource(3, 3, ResourceType.Coal);
    const extractor = engine.placeBuilding('extractor_basic', { x: 3, y: 3 })!;
    const solar = engine.placeBuilding('solar_panel', { x: 6, y: 3 })!;
    expect(engine.connectBuildings(extractor, solar)).toBe(true);

    onSfx.mockClear();
    expect(engine.disconnectBuildings(extractor, solar)).toBe(true);
    onSfx.mockClear();

    expect(engine.connectBuildings(extractor, solar)).toBe(true);

    expect(onSfx).toHaveBeenCalledWith({ type: 'extractor_on' });
  });
});
