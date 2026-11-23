import { describe, expect, it, vi, afterEach } from 'vitest';
import { Container, type Application } from 'pixi.js';
import { GameEngine } from '@/game/engine/GameEngine';
import {
  EnergyLinkRenderer,
  classifyEnergyFlowPhase,
  collectEnergyLinkSegments,
  getEnergyLinkStyle,
  interpolateEnergyLinkStyle,
  type EnergyLinkMode,
  type EnergyLinkSegment,
  type EnergyLinkStyle,
} from '@/game/renderer/EnergyLinkRenderer';
import { ResourceType, TileType } from '@/game/types';
import { PIXI } from '@/design/tokens';
import { TILE_SIZE } from '@/game/constants';

type RendererTestApi = {
  linkSegments: EnergyLinkSegment[];
  flowComponents: Array<{
    directedDischargingToConsumers: Array<{ fromId: number; toId: number }>;
  }>;
  flowDotCountLastFrame: number;
  flowDotCountToConsumersLastFrame: number;
  flowDotCountToBatteriesLastFrame: number;
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
  engine.grid.revealAll();
  return engine;
}

function createRenderer(engine: GameEngine, getMode: () => EnergyLinkMode) {
  return new EnergyLinkRenderer({ stage: new Container() } as unknown as Application, engine, () => ({
    mode: getMode(),
    pendingSourceId: null,
    mouseWorldPos: null,
  }));
}

function focusViewportOnEnergyLinks(engine: GameEngine): void {
  engine.viewport.centerX = 4 * TILE_SIZE;
  engine.viewport.centerY = 3 * TILE_SIZE;
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
  it('keeps a link at rest readable: a thin cyan line, fainter than in link mode', () => {
    const rest = getEnergyLinkStyle('normal');
    const linking = getEnergyLinkStyle('energy_link');

    // DESIGN.md: energy lines are cyan. The border token at 40% vanished on the ground.
    expect(rest.color).toBe(PIXI.accent);
    expect(rest.width).toBe(1);
    expect(rest.alpha).toBeGreaterThanOrEqual(0.3);
    expect(rest.alpha).toBeLessThan(linking.alpha);
  });

  it('returns the highlighted style in energy-link mode', () => {
    expect(getEnergyLinkStyle('energy_link')).toEqual({
      color: PIXI.accent,
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

    // Both modes are cyan now: the colour blend is checked between two distinct colours.
    const blended = interpolateEnergyLinkStyle({ ...from, color: PIXI.border }, to, 0.5);
    expect(blended.color).not.toBe(PIXI.border);
    expect(blended.color).not.toBe(to.color);
  });

  it('classifies network flow phases using energy stats', () => {
    expect(classifyEnergyFlowPhase(null)).toBe('inactive');
    expect(classifyEnergyFlowPhase({ isPowered: false, production: 10, demandedConsumption: 4 })).toBe('inactive');
    expect(classifyEnergyFlowPhase({ isPowered: true, production: 0, demandedConsumption: 0 })).toBe('inactive');
    expect(classifyEnergyFlowPhase({ isPowered: true, production: 4, demandedConsumption: 4 })).toBe('serving');
    expect(classifyEnergyFlowPhase({ isPowered: true, production: 2, demandedConsumption: 4 })).toBe('discharging');
    expect(classifyEnergyFlowPhase({ isPowered: true, production: 8, demandedConsumption: 4 })).toBe('surplus');
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
  it('renders no animated dots in normal mode', () => {
    const engine = makeEngine();
    const solarId = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    const batteryId = engine.placeBuilding('battery_basic', { x: 4, y: 1 })!;
    expect(engine.connectBuildings(solarId, batteryId)).toBe(true);

    const renderer = createRenderer(engine, () => 'normal');
    const api = renderer as unknown as RendererTestApi;
    focusViewportOnEnergyLinks(engine);
    vi.spyOn(performance, 'now').mockReturnValue(100);

    renderer.render();
    expect(api.flowDotCountLastFrame).toBe(0);

    renderer.destroy();
  });

  it('renders no animated dots when network is inactive at night', () => {
    const engine = makeEngine();
    engine.setSimulationTime(0); // night
    engine.placeResource(2, 1, ResourceType.Regolith);
    const solarId = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    const extractorId = engine.placeBuilding('extractor_basic', { x: 2, y: 1 })!;
    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    const renderer = createRenderer(engine, () => 'energy_link');
    const api = renderer as unknown as RendererTestApi;
    focusViewportOnEnergyLinks(engine);
    vi.spyOn(performance, 'now').mockReturnValue(100);

    renderer.render();
    expect(api.flowDotCountLastFrame).toBe(0);

    renderer.destroy();
  });

  it('renders animated dots toward consumers when network is serving', () => {
    const engine = makeEngine();
    engine.setSimulationTime(0.5); // day
    engine.placeResource(2, 1, ResourceType.Regolith);
    const solarId = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    const extractorId = engine.placeBuilding('extractor_basic', { x: 2, y: 1 })!;
    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    const renderer = createRenderer(engine, () => 'energy_link');
    const api = renderer as unknown as RendererTestApi;
    focusViewportOnEnergyLinks(engine);
    vi.spyOn(performance, 'now').mockReturnValue(100);

    renderer.render();
    expect(api.flowDotCountLastFrame).toBeGreaterThan(0);

    renderer.destroy();
  });

  it('renders discharging flow dots at night when battery powers consumers', () => {
    const engine = makeEngine();
    engine.placeResource(2, 1, ResourceType.Regolith);
    const solarId = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    const batteryId = engine.placeBuilding('battery_basic', { x: 3, y: 1 })!;
    const extractorId = engine.placeBuilding('extractor_basic', { x: 2, y: 1 })!;
    expect(engine.connectBuildings(solarId, batteryId)).toBe(true);
    expect(engine.connectBuildings(batteryId, extractorId)).toBe(true);

    engine.setSimulationTime(0.5); // day charge window
    engine.update(20);
    engine.setSimulationTime(0); // night
    engine.update(0.5);

    const renderer = createRenderer(engine, () => 'energy_link');
    const api = renderer as unknown as RendererTestApi;
    focusViewportOnEnergyLinks(engine);
    vi.spyOn(performance, 'now').mockReturnValue(100);

    renderer.render();
    expect(api.flowDotCountLastFrame).toBeGreaterThan(0);

    renderer.destroy();
  });

  it('never orients discharging consumer flow into batteries', () => {
    const engine = makeEngine();
    engine.placeResource(3, 1, ResourceType.Regolith);
    engine.placeResource(5, 2, ResourceType.Regolith);
    const solarId = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    const batteryId = engine.placeBuilding('battery_basic', { x: 3, y: 2 })!;
    const extractorA = engine.placeBuilding('extractor_basic', { x: 3, y: 1 })!;
    const extractorB = engine.placeBuilding('extractor_basic', { x: 5, y: 2 })!;
    expect(engine.connectBuildings(solarId, batteryId)).toBe(true);
    expect(engine.connectBuildings(batteryId, extractorA)).toBe(true);
    expect(engine.connectBuildings(batteryId, extractorB)).toBe(true);

    engine.setSimulationTime(0.5);
    engine.update(20);
    engine.setSimulationTime(0);
    engine.update(0.5);

    const renderer = createRenderer(engine, () => 'energy_link');
    const api = renderer as unknown as RendererTestApi;
    focusViewportOnEnergyLinks(engine);
    vi.spyOn(performance, 'now').mockReturnValue(100);

    renderer.render();
    const batteryTargets = new Set([batteryId]);
    for (const component of api.flowComponents) {
      for (const segment of component.directedDischargingToConsumers) {
        expect(batteryTargets.has(segment.toId)).toBe(false);
      }
    }

    renderer.destroy();
  });

  it('renders surplus dots toward both consumers and batteries without reversing consumer branches', () => {
    const engine = makeEngine();
    engine.placeResource(2, 1, ResourceType.Regolith);
    const solarA = engine.placeBuilding('solar_panel', { x: 1, y: 1 })!;
    const solarB = engine.placeBuilding('solar_panel', { x: 1, y: 3 })!;
    const batteryId = engine.placeBuilding('battery_basic', { x: 4, y: 2 })!;
    const extractorId = engine.placeBuilding('extractor_basic', { x: 2, y: 1 })!;
    expect(engine.connectBuildings(solarA, batteryId)).toBe(true);
    expect(engine.connectBuildings(solarB, batteryId)).toBe(true);
    expect(engine.connectBuildings(batteryId, extractorId)).toBe(true);

    engine.setSimulationTime(0.5);
    const renderer = createRenderer(engine, () => 'energy_link');
    const api = renderer as unknown as RendererTestApi;
    focusViewportOnEnergyLinks(engine);
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(100);

    renderer.render();
    const firstCount = api.flowDotCountLastFrame;
    expect(firstCount).toBeGreaterThan(0);
    expect(api.flowDotCountToBatteriesLastFrame).toBeGreaterThan(0);
    expect(api.flowDotCountToConsumersLastFrame).toBeGreaterThan(0);

    // Different time step should still render without orientation flicker or pass loss.
    now.mockReturnValue(200);
    renderer.render();
    expect(api.flowDotCountLastFrame).toBeGreaterThan(0);
    expect(api.flowDotCountToBatteriesLastFrame).toBeGreaterThan(0);
    expect(api.flowDotCountToConsumersLastFrame).toBeGreaterThan(0);

    renderer.destroy();
  });

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
