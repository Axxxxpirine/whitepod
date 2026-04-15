import { describe, expect, it, vi, afterEach } from 'vitest';
import { Container, type Application } from 'pixi.js';
import { GameEngine } from '@/game/engine/GameEngine';
import {
  EnergyLinkRenderer,
  collectEnergyLinkSegments,
  getEnergyLinkStyle,
  interpolateEnergyLinkStyle,
  type EnergyLinkMode,
  type EnergyLinkSegment,
  type EnergyLinkStyle,
} from '@/game/renderer/EnergyLinkRenderer';
import { TileType } from '@/game/types';

type RendererTestApi = {
  linkSegments: EnergyLinkSegment[];
  worldDirty: boolean;
  currentMode: EnergyLinkMode;
  fromStyle: EnergyLinkStyle;
  toStyle: EnergyLinkStyle;
  transitionStartedAt: number | null;
  getCurrentStyle(now: number): EnergyLinkStyle;
};

function makeEngine() {
  const engine = new GameEngine(800, 600);
  engine.grid.fill(TileType.Ground);
  return engine;
}

function createRenderer(engine: GameEngine, getMode: () => EnergyLinkMode) {
  return new EnergyLinkRenderer({ stage: new Container() } as unknown as Application, engine, () => ({
    mode: getMode(),
    pendingSourceId: null,
    mouseWorldPos: null,
  }));
}

function sortedPairs(segments: readonly EnergyLinkSegment[]): string[] {
  return segments
    .map((segment) => [segment.fromId, segment.toId].sort((a, b) => a - b).join(':'))
    .sort();
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('EnergyLinkRenderer helpers', () => {
  it('returns the expected default style in normal mode', () => {
    expect(getEnergyLinkStyle('normal')).toEqual({
      color: 0x111111,
      width: 1,
      alpha: 0.4,
    });
  });

  it('returns the highlighted style in energy-link mode', () => {
    expect(getEnergyLinkStyle('energy_link')).toEqual({
      color: 0xf8e16c,
      width: 2,
      alpha: 0.95,
    });
  });

  it('interpolates energy-link styles monotonically', () => {
    const from = getEnergyLinkStyle('normal');
    const to = getEnergyLinkStyle('energy_link');

    expect(interpolateEnergyLinkStyle(from, to, 0)).toEqual(from);
    expect(interpolateEnergyLinkStyle(from, to, 1)).toEqual(to);

    const mid = interpolateEnergyLinkStyle(from, to, 0.5);
    expect(mid.width).toBeGreaterThan(from.width);
    expect(mid.width).toBeLessThan(to.width);
    expect(mid.alpha).toBeGreaterThan(from.alpha);
    expect(mid.alpha).toBeLessThan(to.alpha);
    expect(mid.color).not.toBe(from.color);
    expect(mid.color).not.toBe(to.color);
  });
});

describe('collectEnergyLinkSegments', () => {
  it('deduplicates bidirectional energy links and includes multiple networks', () => {
    const engine = makeEngine();
    const solarA = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    const batteryA = engine.placeBuilding('battery_basic', { x: 4, y: 1 })!;
    const solarB = engine.placeBuilding('solar_panel', { x: 10, y: 1 })!;
    const batteryB = engine.placeBuilding('battery_basic', { x: 13, y: 1 })!;

    expect(engine.connectBuildings(solarA, batteryA)).toBe(true);
    expect(engine.connectBuildings(solarB, batteryB)).toBe(true);

    const segments = collectEnergyLinkSegments(engine);

    expect(segments).toHaveLength(2);
    expect(sortedPairs(segments)).toEqual([`${solarA}:${batteryA}`, `${solarB}:${batteryB}`]);
  });
});

describe('EnergyLinkRenderer', () => {
  it('rebuilds its cached segments when links are added or removed', () => {
    const engine = makeEngine();
    const renderer = createRenderer(engine, () => 'normal');
    const api = renderer as unknown as RendererTestApi;
    const solarId = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    const batteryId = engine.placeBuilding('battery_basic', { x: 4, y: 1 })!;

    vi.spyOn(performance, 'now').mockReturnValue(0);

    renderer.render();
    expect(api.worldDirty).toBe(false);
    expect(api.linkSegments).toHaveLength(0);

    expect(engine.connectBuildings(solarId, batteryId)).toBe(true);
    expect(api.worldDirty).toBe(true);

    renderer.render();
    expect(api.worldDirty).toBe(false);
    expect(sortedPairs(api.linkSegments)).toEqual([`${solarId}:${batteryId}`]);

    expect(engine.disconnectBuildings(solarId, batteryId)).toBe(true);
    expect(api.worldDirty).toBe(true);

    renderer.render();
    expect(api.linkSegments).toHaveLength(0);

    renderer.destroy();
  });

  it('drops cached segments after a linked building is removed', () => {
    const engine = makeEngine();
    const renderer = createRenderer(engine, () => 'normal');
    const api = renderer as unknown as RendererTestApi;
    const solarId = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    const batteryId = engine.placeBuilding('battery_basic', { x: 4, y: 1 })!;

    expect(engine.connectBuildings(solarId, batteryId)).toBe(true);

    vi.spyOn(performance, 'now').mockReturnValue(0);

    renderer.render();
    expect(api.linkSegments).toHaveLength(1);

    expect(engine.removeBuilding(batteryId)).toBe(true);
    expect(api.worldDirty).toBe(true);

    renderer.render();
    expect(api.linkSegments).toHaveLength(0);

    renderer.destroy();
  });

  it('animates transitions in both directions when the view mode changes', () => {
    const engine = makeEngine();
    const solarId = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    const batteryId = engine.placeBuilding('battery_basic', { x: 4, y: 1 })!;
    expect(engine.connectBuildings(solarId, batteryId)).toBe(true);

    let mode: EnergyLinkMode = 'normal';
    const renderer = createRenderer(engine, () => mode);
    const api = renderer as unknown as RendererTestApi;
    const now = vi.spyOn(performance, 'now');

    now.mockReturnValue(100);
    renderer.render();
    expect(api.currentMode).toBe('normal');
    expect(api.transitionStartedAt).toBeNull();

    mode = 'energy_link';
    now.mockReturnValue(150);
    renderer.render();

    expect(api.currentMode).toBe('energy_link');
    expect(api.transitionStartedAt).toBe(150);
    expect(api.fromStyle).toEqual(getEnergyLinkStyle('normal'));
    expect(api.toStyle).toEqual(getEnergyLinkStyle('energy_link'));

    const midwayForward = api.getCurrentStyle(250);
    expect(midwayForward.width).toBeGreaterThan(1);
    expect(midwayForward.width).toBeLessThan(2);
    expect(midwayForward.alpha).toBeGreaterThan(0.4);
    expect(midwayForward.alpha).toBeLessThan(0.95);

    mode = 'normal';
    now.mockReturnValue(260);
    renderer.render();

    expect(api.currentMode).toBe('normal');
    expect(api.transitionStartedAt).toBe(260);
    expect(api.fromStyle.width).toBeGreaterThan(1);
    expect(api.fromStyle.width).toBeLessThan(2);
    expect(api.toStyle).toEqual(getEnergyLinkStyle('normal'));

    const completedReverse = api.getCurrentStyle(500);
    expect(completedReverse).toEqual(getEnergyLinkStyle('normal'));
    expect(api.transitionStartedAt).toBeNull();

    renderer.destroy();
  });
});
