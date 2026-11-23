import { describe, expect, it, vi } from 'vitest';
import { Container, type Application, type Graphics } from 'pixi.js';
import { GameEngine } from '@/game/engine/GameEngine';
import { InputHandler } from '@/game/engine/InputHandler';
import { BeltRenderer } from '@/game/renderer/BeltRenderer';
import { EnergyLinkRenderer, type EnergyLinkMode } from '@/game/renderer/EnergyLinkRenderer';
import { Direction, ResourceType, TileType, type BuildingId } from '@/game/types';
import { MAP_CENTER } from '@/game/constants';

/**
 * The simulation notifies the world several times a second (every extraction
 * beat): the map layers must only redraw when what they show changes.
 */

const app = () => ({ stage: new Container() }) as unknown as Application;
const graphicsOf = (renderer: unknown) => (renderer as { graphics: Graphics }).graphics;

/** A powered extractor delivering to a storage, in the middle of the view. */
function runningLine() {
  const engine = new GameEngine(800, 600);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.setSimulationTime(0.5);
  const { x, y } = MAP_CENTER;
  engine.placeResource(x, y, ResourceType.Regolith);
  const extractor = engine.placeBuilding('extractor_basic', { x, y })!;
  const storage = engine.placeBuilding('storage_basic', { x: x + 5, y: y - 1 })!;
  const solar = engine.placeBuilding('solar_panel', { x, y: y + 3 })!;
  engine.connectBuildings(solar, extractor);
  const belt = engine.placeBelt({ building: extractor, port: 'out_east' }, { building: storage, port: 'in_west' });
  if (!belt.ok) throw new Error(belt.reason);
  return { engine, extractor, storage, solar };
}

/** Plays `seconds` of simulation, counting world notifications. */
function simulate(engine: GameEngine, seconds: number): number {
  let notifications = 0;
  const unsubscribe = engine.subscribe((kind) => {
    if (kind === 'world') notifications += 1;
  });
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.1) engine.update(0.1);
  unsubscribe();
  return notifications;
}

describe('map layers redraw on change only', () => {
  it('does not redraw the belts on simulation beats, only when a belt changes', () => {
    const { engine, extractor } = runningLine();
    const renderer = new BeltRenderer(app(), engine);
    renderer.render();
    const clear = vi.spyOn(graphicsOf(renderer), 'clear');

    expect(simulate(engine, 10)).toBeGreaterThan(0);
    renderer.render();
    expect(clear).not.toHaveBeenCalled();

    // Removing the extractor takes its belt with it.
    engine.removeBuilding(extractor);
    renderer.render();
    expect(clear).toHaveBeenCalledTimes(1);
    renderer.destroy();
  });

  it('redraws the belts when a run becomes saturated', () => {
    const { engine, storage } = runningLine();
    const { x, y } = MAP_CENTER;
    // Three extractors merged onto one belt: 90/min asked of a 60/min run.
    const merger = engine.placeBuilding('merger_basic', { x: x + 3, y: y + 6 })!;
    const extractors: BuildingId[] = [];
    for (const dy of [4, 6, 8]) {
      engine.placeResource(x - 2, y + dy, ResourceType.Regolith);
      extractors.push(engine.placeBuilding('extractor_basic', { x: x - 2, y: y + dy })!);
    }
    const solar = engine.placeBuilding('solar_panel', { x: x - 4, y: y + 6 })!;
    const solar2 = engine.placeBuilding('solar_panel', { x: x - 5, y: y + 6 })!;
    engine.connectBuildings(solar, solar2);
    for (const id of extractors) engine.connectBuildings(solar, id);
    const ports = ['in_north', 'in_west', 'in_south'] as const;
    extractors.forEach((id, index) => {
      const belt = engine.placeBelt({ building: id, port: 'out_east' }, { building: merger, port: ports[index]! });
      if (!belt.ok) throw new Error(`feeder ${index}: ${belt.reason}`);
    });
    const trunk = engine.placeBelt({ building: merger, port: 'out_east' }, { building: storage, port: 'in_south' });
    if (!trunk.ok) throw new Error(`trunk: ${trunk.reason}`);

    const renderer = new BeltRenderer(app(), engine);
    renderer.render();
    const clear = vi.spyOn(graphicsOf(renderer), 'clear');

    simulate(engine, 30);
    expect(engine.getSaturatedBeltSegments().length).toBeGreaterThan(0);
    renderer.render();
    expect(clear).toHaveBeenCalledTimes(1);
    renderer.destroy();
  });

  it('leaves the power links alone at rest, and redraws them when a link changes', () => {
    const { engine, extractor, solar } = runningLine();
    let mode: EnergyLinkMode = 'normal';
    const renderer = new EnergyLinkRenderer(app(), engine, () => ({ mode, pendingSourceId: null, mouseWorldPos: null }));
    renderer.render();
    const clear = vi.spyOn(graphicsOf(renderer), 'clear');

    simulate(engine, 5);
    renderer.render();
    renderer.render();
    expect(clear).not.toHaveBeenCalled();

    engine.disconnectBuildings(solar, extractor);
    renderer.render();
    expect(clear).toHaveBeenCalledTimes(1);

    // The link tool animates the layer: every frame draws.
    mode = 'energy_link';
    renderer.render();
    renderer.render();
    expect(clear).toHaveBeenCalledTimes(3);
    renderer.destroy();
  });

  it('moves belts and power links with the camera without redrawing them', () => {
    const { engine } = runningLine();
    const belts = new BeltRenderer(app(), engine);
    const links = new EnergyLinkRenderer(app(), engine, () => ({ mode: 'normal', pendingSourceId: null, mouseWorldPos: null }));
    belts.render();
    links.render();
    const clearBelts = vi.spyOn(graphicsOf(belts), 'clear');
    const clearLinks = vi.spyOn(graphicsOf(links), 'clear');

    // Across the map and back, zoomed out and in: what is drawn does not depend on the view.
    for (const [dx, dy, zoom] of [[4000, 0, 0.5], [-8000, 3000, 0.5], [2000, -2000, 2]] as const) {
      engine.viewport.pan(dx, dy);
      engine.viewport.zoomAt(400, 300, zoom);
      belts.render();
      links.render();
    }

    expect(clearBelts).not.toHaveBeenCalled();
    expect(clearLinks).not.toHaveBeenCalled();
    belts.destroy();
    links.destroy();
  });

  it('reports a hovered tile once, however many times the pointer moves inside it', () => {
    const { engine } = runningLine();
    const hover = vi.fn();
    const handler = new InputHandler(engine, () => ({ kind: 'select' }), () => Direction.North);
    handler.setHoverCallback(hover);

    handler.onPointerMove(400, 300);
    handler.onPointerMove(401, 300);
    handler.onPointerMove(402, 301);
    expect(hover).toHaveBeenCalledTimes(1);

    handler.onPointerMove(400 + 64, 300);
    expect(hover).toHaveBeenCalledTimes(2);
    handler.onPointerLeave();
    handler.onPointerMove(400 + 64, 300);
    expect(hover).toHaveBeenCalledTimes(4);
    handler.destroy();
  });

  it('keeps the extraction beat from marking the map dirty until a deposit runs out', () => {
    const engine = new GameEngine(800, 600, { gameMode: 'campaign' });
    engine.generateMap(42);
    const hub = engine.getBuildings().get(engine.getHubId()!)!;
    const spot = { x: hub.origin.x - 4, y: hub.origin.y + 2 };
    engine.grid.setResource(spot.x, spot.y, ResourceType.Oxygen, 3);
    const extractor = engine.placeBuilding('extractor_basic', spot)!;
    const solar = engine.placeBuilding('solar_panel', { x: spot.x, y: spot.y + 2 })!;
    engine.connectBuildings(solar, extractor);
    const belt = engine.placeBelt({ building: extractor, port: 'out_east' }, { building: hub.id, port: 'in_west_1' });
    if (!belt.ok) throw new Error(belt.reason);
    engine.setSimulationTime(0.5);
    engine.grid.clearDirty();
    const revision = engine.grid.revision;

    simulate(engine, 3);
    expect(engine.grid.getResourceAmount(spot.x, spot.y)).toBeGreaterThan(0);
    expect(engine.grid.getDirtyRegion()).toBeNull();
    expect(engine.grid.revision).toBe(revision);

    simulate(engine, 6);
    expect(engine.grid.getResourceAmount(spot.x, spot.y)).toBe(0);
    expect(engine.grid.getDirtyRegion()).toEqual({ x0: spot.x, y0: spot.y, x1: spot.x, y1: spot.y });
    expect(engine.grid.revision).toBe(revision + 1);
  });
});
