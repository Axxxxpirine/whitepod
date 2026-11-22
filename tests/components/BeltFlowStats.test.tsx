import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BeltFlowStats } from '@/components/BeltFlowStats';
import {
  BELT_CAPACITY_PER_MIN,
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { GameEngine } from '@/game/engine/GameEngine';
import { Direction, ResourceType, TileType, type BuildingId, type PortId } from '@/game/types';

/** `count` extractors on a merger belted to a storage; returns the trunk's first segment. */
function line(count: number): { engine: GameEngine; trunk: BuildingId } {
  const engine = new GameEngine(800, 600, { dayNightCycleSeconds: 1e9 });
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.setSimulationTime(0.5);
  const merger = engine.placeBuilding(MERGER_BASIC_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
  const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 20, y: 9 })!;
  const spots: [number, number, Direction, PortId][] = [
    [6, 10, Direction.North, 'in_west'],
    [10, 6, Direction.East, 'in_north'],
    [10, 14, Direction.West, 'in_south'],
  ];
  for (const [x, y, rotation, port] of spots.slice(0, count)) {
    engine.placeResource(x, y, ResourceType.Regolith);
    const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x, y }, rotation)!;
    engine.connectBuildings(engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: x - 2, y: y - 2 })!, extractor);
    engine.placeBelt({ building: extractor, port: 'out_east' }, { building: merger, port });
  }
  const trunk = engine.placeBelt({ building: merger, port: 'out_east' }, { building: storage, port: 'in_west' });
  if (!trunk.ok) throw new Error(trunk.reason);
  return { engine, trunk: trunk.segmentIds[0]! };
}

describe('BeltFlowStats load', () => {
  it('shows the demand against the belt capacity', () => {
    const { engine, trunk } = line(2);
    render(<BeltFlowStats building={engine.getBuildings().get(trunk)!} engine={engine} />);

    expect(screen.getByRole('status')).toHaveTextContent(`Débit max60 / ${BELT_CAPACITY_PER_MIN}/min`);
  });

  it('turns amber and says saturated when the sources exceed the capacity', () => {
    const { engine, trunk } = line(3);
    for (let t = 0; t < 10; t += 0.1) engine.update(0.1);
    render(<BeltFlowStats building={engine.getBuildings().get(trunk)!} engine={engine} />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(`Saturé90 / ${BELT_CAPACITY_PER_MIN}/min`);
    expect(status.querySelector('.text-accent-warm')).not.toBeNull();
  });
});
