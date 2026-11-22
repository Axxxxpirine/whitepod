import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { ResourceType, type BuildingId, type TileCoord } from '@/game/types';
import { mulberry32 } from '@/game/data/SeededRNG';
import type { PreparedScenarioResult } from '../types';
import {
  advanceSimulation, createScenarioSeed, makeViewport, mustConnect, mustPlaceBuilding,
  placeScenarioFeeder, placeScenarioStorage, prepareBuildZone, prepareEngine,
} from '../generatorUtils';

export function generateComplexScenario(screenWidth: number, screenHeight: number): PreparedScenarioResult {
  const scenarioSeed = createScenarioSeed();
  const rng = mulberry32(scenarioSeed);
  const { engine, baseAnchor, mirrorX, mirrorY } = prepareEngine(screenWidth, screenHeight, rng, scenarioSeed);
  prepareBuildZone(engine, baseAnchor.x, baseAnchor.y, 20);
  const toWorld = (dx: number, dy: number): TileCoord => ({
    x: baseAnchor.x + dx * mirrorX, y: baseAnchor.y + dy * mirrorY,
  });
  const placeExtractor = (dx: number, dy: number, resource: ResourceType, target: BuildingId) => {
    const origin = toWorld(dx, dy);
    engine.placeResource(origin.x, origin.y, resource);
    return placeScenarioFeeder(engine, EXTRACTOR_BUILDING_TYPE_ID, origin, target, rng);
  };

  // The first wing merges two regolith streams and feeds hydrogen to the two vertical storage ports.
  const storageA = placeScenarioStorage(engine, toWorld(-2, 1), rng);
  const merger = placeScenarioFeeder(engine, MERGER_BASIC_BUILDING_TYPE_ID, toWorld(-7, -2), storageA, rng);
  const wingA = [
    placeExtractor(-13, -2, ResourceType.Regolith, merger),
    placeExtractor(-7, -7, ResourceType.Regolith, merger),
    placeExtractor(-2, -7, ResourceType.Hydrogen, storageA),
    placeExtractor(-2, 7, ResourceType.Hydrogen, storageA),
  ];

  const storageB = placeScenarioStorage(engine, toWorld(7, 1), rng);
  const wingB = [
    placeExtractor(13, 1, ResourceType.Oxygen, storageB),
    placeExtractor(7, 7, ResourceType.Oxygen, storageB),
  ];

  const visibleDeposits: [number, number, ResourceType][] = [
    [-15, 9, ResourceType.Regolith], [-15, -7, ResourceType.Hydrogen], [10, 7, ResourceType.Oxygen],
    [15, 7, ResourceType.Regolith], [-5, -8, ResourceType.Hydrogen], [5, -8, ResourceType.Oxygen],
    [-9, 9, ResourceType.Regolith], [9, -9, ResourceType.Hydrogen], [-3, 9, ResourceType.Oxygen],
    [2, -9, ResourceType.Regolith],
  ];
  for (const [dx, dy, resource] of visibleDeposits) {
    const tile = toWorld(dx, dy);
    engine.placeResource(tile.x, tile.y, resource);
  }

  const batteryA1 = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(-5, -6), 3, rng);
  const batteryA2 = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(-5, 6), 3, rng);
  const batteryB = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(11, -2), 3, rng);
  mustConnect(engine, batteryA1, batteryA2);
  for (const id of wingA) mustConnect(engine, batteryA2, id);
  for (const id of wingB) mustConnect(engine, batteryB, id);
  for (const [dx, dy] of [[-12, -5], [-10, -5], [-8, -5], [-12, -7], [-10, -7], [-8, -7]]) {
    const solar = mustPlaceBuilding(engine, SOLAR_PANEL_BUILDING_TYPE_ID, toWorld(dx, dy), 3, rng);
    mustConnect(engine, solar, batteryA1);
  }
  for (const dx of [10, 12, 14]) {
    const solar = mustPlaceBuilding(engine, SOLAR_PANEL_BUILDING_TYPE_ID, toWorld(dx, -5), 3, rng);
    mustConnect(engine, solar, batteryB);
  }
  mustPlaceBuilding(engine, WATCHTOWER_BUILDING_TYPE_ID, toWorld(3, -5), 3, rng);

  engine.setSimulationTime(0.28 + rng() * 0.16);
  advanceSimulation(engine, 30, 0.2);
  return { engine, selectedTool: { kind: 'select' }, viewport: makeViewport(engine, baseAnchor, 0.5) };
}
