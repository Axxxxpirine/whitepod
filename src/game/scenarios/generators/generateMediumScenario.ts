import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { ResourceType, type TileCoord } from '@/game/types';
import { mulberry32 } from '@/game/data/SeededRNG';
import type { PreparedScenarioResult } from '../types';
import {
  advanceSimulation, createScenarioSeed, makeViewport, mustConnect, mustPlaceBuilding,
  placeScenarioFeeder, placeScenarioStorage, prepareBuildZone, prepareEngine, randomInt,
} from '../generatorUtils';

export function generateMediumScenario(screenWidth: number, screenHeight: number): PreparedScenarioResult {
  const scenarioSeed = createScenarioSeed();
  const rng = mulberry32(scenarioSeed);
  const { engine, baseAnchor, mirrorX, mirrorY } = prepareEngine(screenWidth, screenHeight, rng, scenarioSeed);
  prepareBuildZone(engine, baseAnchor.x, baseAnchor.y, 17);
  const toWorld = (dx: number, dy: number): TileCoord => ({
    x: baseAnchor.x + dx * mirrorX, y: baseAnchor.y + dy * mirrorY,
  });

  // One straight corridor per storage input. Vary its length without crossing another feeder.
  const storage = placeScenarioStorage(engine, toWorld(2, 1), rng);
  const distance = () => randomInt(rng, 6, 8);
  const deposits: [TileCoord, ResourceType][] = [
    [toWorld(2 - distance(), 1), ResourceType.Regolith],
    [toWorld(2, 1 - distance()), ResourceType.Hydrogen],
    [toWorld(2 + distance(), 1), ResourceType.Regolith],
    [toWorld(2, 1 + distance()), ResourceType.Hydrogen],
  ];
  const extractors = deposits.map(([origin, resource]) => {
    engine.placeResource(origin.x, origin.y, resource);
    return placeScenarioFeeder(engine, EXTRACTOR_BUILDING_TYPE_ID, origin, storage, rng);
  });

  const visibleDeposits: [number, number, ResourceType][] = [
    [8, -4, ResourceType.Regolith], [9, 2, ResourceType.Hydrogen],
    [-3, 8, ResourceType.Regolith], [4, 8, ResourceType.Hydrogen],
    [8, 7, ResourceType.Regolith], [-9, 8, ResourceType.Hydrogen], [-9, -7, ResourceType.Regolith],
  ];
  for (const [dx, dy, resource] of visibleDeposits) {
    const tile = toWorld(dx, dy);
    engine.placeResource(tile.x, tile.y, resource);
  }

  // Place power equipment after the belts to keep those corridors open in all four mirrors.
  const batteryA = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(5, -3), 4, rng);
  const batteryB = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(5, 5), 4, rng);
  for (const [dx, dy] of [[-4, -4], [-2, -4], [0, -4], [-4, -2], [-2, -2], [0, -2]]) {
    const solar = mustPlaceBuilding(engine, SOLAR_PANEL_BUILDING_TYPE_ID, toWorld(dx, dy), 4, rng);
    mustConnect(engine, solar, batteryA);
  }
  mustConnect(engine, batteryA, batteryB);
  for (const extractor of extractors) mustConnect(engine, batteryB, extractor);

  engine.setSimulationTime(0.28 + rng() * 0.16);
  advanceSimulation(engine, 24, 0.2);
  return { engine, selectedTool: { kind: 'select' }, viewport: makeViewport(engine, baseAnchor, 0.6) };
}
