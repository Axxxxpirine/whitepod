import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BuildingStatsPanel } from '@/components/BuildingStatsPanel';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  FUEL_CELL_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  getBuildingType,
} from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType, type BuildingId } from '@/game/types';

const FUEL = getBuildingType(FUEL_CELL_BUILDING_TYPE_ID)!.fuel!;

/**
 * A fuel cell at (10,10) fed by a hydrogen and an oxygen extractor, one power
 * network for all three plus a solar panel to start the cell by day. The day
 * never moves on its own (very long cycle): tests set noon or midnight.
 */
function fuelCellWorld(fed = true) {
  const engine = new GameEngine(800, 600, { dayNightCycleSeconds: 1e9 });
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.setSimulationTime(0.5);
  const cell = engine.placeBuilding(FUEL_CELL_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
  const panel = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 10, y: 6 })!;
  engine.connectBuildings(panel, cell);
  const extractors: BuildingId[] = [];
  if (fed) {
    for (const [resource, y, port] of [[ResourceType.Hydrogen, 10, 'in_1'], [ResourceType.Oxygen, 14, 'in_2']] as const) {
      engine.placeResource(4, y, resource);
      const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 4, y })!;
      engine.connectBuildings(cell, extractor);
      const belt = engine.placeBelt({ building: extractor, port: 'out_east' }, { building: cell, port });
      if (!belt.ok) throw new Error(belt.reason);
      extractors.push(extractor);
    }
  }
  return { engine, cell, panel, extractors };
}

function simulate(engine: GameEngine, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) engine.update(0.1);
}

describe('fuel cell', () => {
  it('starts on solar power by day, then keeps its own line running through the night', () => {
    const { engine, cell, extractors } = fuelCellWorld();
    simulate(engine, 10);
    expect(engine.getFuelBurnRemaining(cell)).toBeGreaterThan(0);

    engine.setSimulationTime(0);
    simulate(engine, 60);

    expect(engine.getEnergyNetworkForBuilding(cell)?.production).toBe(FUEL.powerKw);
    for (const id of extractors) expect(engine.getBuildingPowerState(id)).toBe('powered');
  });

  it('counts no stock growth for the fuel its line burns', () => {
    const { engine } = fuelCellWorld();
    simulate(engine, 10);

    expect(engine.getResourceRates()).toMatchObject({ hydrogen: 0, oxygen: 0 });
  });

  it('gives no power without fuel', () => {
    const { engine, cell } = fuelCellWorld(false);
    engine.setSimulationTime(0);
    simulate(engine, 10);

    expect(engine.getFuelBurnRemaining(cell)).toBe(0);
    expect(engine.getEnergyNetworkForBuilding(cell)?.production).toBe(0);
  });

  it('burns one load of each input per cycle', () => {
    const { engine, cell } = fuelCellWorld();
    const loads: number[] = [];
    let last = 0;
    for (let t = 0; t < 60; t += 0.1) {
      engine.update(0.1);
      const remaining = engine.getFuelBurnRemaining(cell)!;
      if (remaining > last + 1e-6) loads.push(t);
      last = remaining;
    }

    // One load per burn: 60 s / 6 s, give or take the first.
    expect(loads.length).toBeGreaterThanOrEqual(60 / FUEL.burnSeconds - 1);
    expect(loads.length).toBeLessThanOrEqual(60 / FUEL.burnSeconds + 1);
  });

  it('charges a battery at night with what its line does not use', () => {
    const { engine, cell } = fuelCellWorld();
    const battery = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 14, y: 6 })!;
    engine.connectBuildings(cell, battery);
    simulate(engine, 10);
    engine.setSimulationTime(0);
    engine.batteryCharges.set(battery, 0);

    // A very long cycle makes an hour last ages: run a slice and expect some charge.
    simulate(engine, 60);

    expect(engine.batteryCharges.get(battery)!).toBeGreaterThan(0);
  });

  it('keeps its load through a save, so the reloaded world runs identically', () => {
    const { engine } = fuelCellWorld();
    simulate(engine, 9.3);

    const restored = GameEngine.fromSnapshot(engine.serializeWorld(), 800, 600);
    simulate(engine, 30);
    simulate(restored, 30);

    expect(restored.serializeWorld()).toEqual(engine.serializeWorld());
  });

  it('is locked in campaign until a milestone unlocks it', () => {
    const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
    engine.generateMap(42);

    expect(engine.isBuildingUnlocked(FUEL_CELL_BUILDING_TYPE_ID)).toBe(false);
  });

  it('says in its panel whether it is running or out of fuel', () => {
    const { engine, cell } = fuelCellWorld(false);
    const { unmount } = render(
      <BuildingStatsPanel building={engine.getBuildings().get(cell)!} engine={engine} worldTick={0} energyVersion={0} />,
    );
    expect(screen.getByText('À court')).toHaveClass('text-accent-warm');
    unmount();

    const fed = fuelCellWorld();
    simulate(fed.engine, 10);
    render(<BuildingStatsPanel building={fed.engine.getBuildings().get(fed.cell)!} engine={fed.engine} worldTick={1} energyVersion={1} />);
    expect(screen.getByText('En marche')).toBeInTheDocument();
    expect(screen.getByText(`${FUEL.powerKw} kW`)).toBeInTheDocument();
  });
});
