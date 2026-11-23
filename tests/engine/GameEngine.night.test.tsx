import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GameHUD } from '@/components/GameHUD';
import { DAY_NIGHT_CYCLE_SECONDS } from '@/game/constants';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
} from '@/game/data/buildingCatalog';
import { GameEngine } from '@/game/engine/GameEngine';
import { NIGHT_WARNING_SECONDS, nightWarning } from '@/game/ui/nightPresentation';
import { ResourceType, TileType } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

const EXTRACTOR_KW = getBuildingType(EXTRACTOR_BUILDING_TYPE_ID)!.energy!.consumption!;

/** An extractor belted to a storage, powered by two panels and optionally a charged battery. */
function line(withBattery: boolean) {
  const engine = new GameEngine(800, 600);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.placeResource(4, 10, ResourceType.Regolith);
  const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 4, y: 10 })!;
  for (const x of [1, 2]) engine.connectBuildings(engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x, y: 7 })!, extractor);
  const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 10, y: 9 })!;
  engine.placeBelt({ building: extractor, port: 'out_east' }, { building: storage, port: 'in_west' });
  let battery: number | null = null;
  if (withBattery) {
    battery = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 4, y: 3 })!;
    engine.connectBuildings(battery, extractor);
    engine.batteryCharges.set(battery, getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!.capacity);
  }
  return { engine, extractor, storage, battery };
}

function simulate(engine: GameEngine, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) engine.update(0.1);
}

describe('lunar night', () => {
  it('lasts half of a cycle of DAY_NIGHT_CYCLE_SECONDS', () => {
    expect(DAY_NIGHT_CYCLE_SECONDS).toBe(240);
  });

  it('stops a line without reserve for the whole night', () => {
    const { engine, storage } = line(false);
    engine.setSimulationTime(0.8);
    simulate(engine, 1);
    const before = engine.getStorageInventory(storage)!.regolith;

    simulate(engine, DAY_NIGHT_CYCLE_SECONDS * 0.35);

    expect(engine.getStorageInventory(storage)!.regolith).toBe(before);
  });

  it('keeps a line with a charged battery running through the night', () => {
    const { engine, storage, extractor } = line(true);
    engine.setSimulationTime(0.8);

    simulate(engine, DAY_NIGHT_CYCLE_SECONDS * 0.35);

    expect(engine.getBuildingPowerState(extractor)).toBe('powered');
    expect(engine.getStorageInventory(storage)!.regolith).toBeGreaterThan(30);
  });

  it('tells how long until dusk and what demand has no reserve', () => {
    const bare = line(false).engine;
    bare.setSimulationTime(0.7);
    expect(bare.getNightOutlook().secondsToNight).toBeCloseTo(0.05 * DAY_NIGHT_CYCLE_SECONDS);
    expect(bare.getNightOutlook().uncoveredKw).toBe(EXTRACTOR_KW);

    const covered = line(true).engine;
    covered.setSimulationTime(0.7);
    expect(covered.getNightOutlook().uncoveredKw).toBe(0);

    covered.setSimulationTime(0.9);
    expect(covered.getNightOutlook().secondsToNight).toBeNull();
  });

  it('words the warning only shortly before dusk, in amber when power is short', () => {
    expect(nightWarning({ secondsToNight: NIGHT_WARNING_SECONDS + 5, uncoveredKw: 4 })).toBeNull();
    expect(nightWarning({ secondsToNight: null, uncoveredKw: 4 })).toBeNull();
    expect(nightWarning({ secondsToNight: 12.2, uncoveredKw: 0 })).toEqual({ text: 'Nuit dans 13 s', short: false });
    expect(nightWarning({ secondsToNight: 12.2, uncoveredKw: 4 })).toEqual({ text: 'Nuit dans 13 s · 4 kW sans réserve', short: true });
    expect(nightWarning({ secondsToNight: 12.2, uncoveredKw: 2.5 })?.text).toBe('Nuit dans 13 s · 2,5 kW sans réserve');
  });

  it('shows the warning in the HUD before dusk', () => {
    const { engine } = line(false);
    engine.setSimulationTime(0.7);
    useGameStore.setState({ engine, simulationTime: engine.simulationTime });

    render(<GameHUD />);

    expect(screen.getByText('Nuit dans 12 s · 4 kW sans réserve')).toHaveClass('text-accent-warm');
  });
});
