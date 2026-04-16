/**
 * Medium tier scenario generator.
 *
 * Produces a mid-complexity layout:
 *   – 6 solar panels + 2 batteries + 4 extractors + 1 storage (3×3)
 *   – 2 resource types (Coal + IronOre), ~7 visible deposits
 *   – Single branched energy subnet (solars → batteries → extractors)
 *   – Extractors routed to storage via auto-planned belts
 *
 * Layout uses a structured "wing" pattern: extractors arranged in a column
 * to the west of the storage so belts route cleanly East into storage's
 * input ports. Light random jitter is applied to deposit positions.
 */

import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { ResourceType, type TileCoord } from '@/game/types';
import { mulberry32 } from '@/game/data/SeededRNG';
import type { PreparedScenarioResult } from '../types';
import {
  advanceSimulation,
  clampTile,
  countVisibleUncoveredDeposits,
  createScenarioSeed,
  makeViewport,
  mustConnect,
  mustPlaceBuilding,
  prepareEngine,
  randomInt,
  tryBelt,
} from '../generatorUtils';

export function generateMediumScenario(screenWidth: number, screenHeight: number): PreparedScenarioResult {
  const scenarioSeed = createScenarioSeed();
  const rng = mulberry32(scenarioSeed);
  const { engine, baseAnchor, mirrorX, mirrorY } = prepareEngine(screenWidth, screenHeight, rng, scenarioSeed);

  const toWorld = (dx: number, dy: number): TileCoord =>
    clampTile({ x: baseAnchor.x + dx * mirrorX, y: baseAnchor.y + dy * mirrorY });

  // --- Extractor deposits (fixed column, west of storage) ---
  // 4 extractors stacked vertically, all west of storage. Belts route East.
  const jitter = () => randomInt(rng, -1, 1);
  const extractorDepositTargets: { coord: TileCoord; type: ResourceType }[] = [
    { coord: toWorld(-7 + jitter(), -3), type: ResourceType.Coal },
    { coord: toWorld(-7 + jitter(), 0), type: ResourceType.IronOre },
    { coord: toWorld(-7 + jitter(), 3), type: ResourceType.Coal },
    { coord: toWorld(-7 + jitter(), 6), type: ResourceType.IronOre },
  ];

  // --- Visible (decorative) deposits ---
  const visibleDepositOffsets: [number, number, ResourceType][] = [
    [8, -4, ResourceType.Coal],
    [9, 2, ResourceType.IronOre],
    [-3, 8, ResourceType.Coal],
    [4, 8, ResourceType.IronOre],
    [8, 7, ResourceType.Coal],
    [-9, 8, ResourceType.IronOre],
    [-9, -7, ResourceType.Coal],
  ];

  for (const { coord, type } of extractorDepositTargets) {
    engine.placeResource(coord.x, coord.y, type);
  }
  for (const [dx, dy, type] of visibleDepositOffsets) {
    const coord = toWorld(dx, dy);
    engine.placeResource(coord.x, coord.y, type);
  }

  // --- Storage (east-center) ---
  // Place storage first so it gets a known position; belt routing depends on it.
  const storage = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(2, 1), 4, rng);

  // --- Solar farm (6 panels, north of storage) ---
  const solarOffsets: [number, number][] = [
    [-2, -4], [0, -4], [2, -4],
    [-2, -2], [0, -2], [2, -2],
  ];
  const solarIds = solarOffsets.map(([dx, dy]) =>
    mustPlaceBuilding(engine, SOLAR_PANEL_BUILDING_TYPE_ID, toWorld(dx, dy), 4, rng),
  );

  // --- Batteries (2, between solar farm and storage) ---
  const batteryA = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(5, -3), 4, rng);
  const batteryB = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(5, 5), 4, rng);

  // --- Extractors (placed on their deposits) ---
  const extractorIds = extractorDepositTargets.map((deposit) =>
    mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, deposit.coord, 0, rng),
  );

  // --- Energy network (single branched subnet) ---
  for (const solarId of solarIds) {
    mustConnect(engine, solarId, batteryA);
  }
  mustConnect(engine, batteryA, batteryB);
  for (const extractorId of extractorIds) {
    mustConnect(engine, batteryB, extractorId);
  }

  // --- Belts: each extractor → storage. Storage has 4 input ports;
  // pair each extractor with a preferred port based on its vertical position.
  const portPreferences: readonly (readonly string[])[] = [
    ['in_north', 'in_west', 'in_east', 'in_south'],   // top extractor → prefer north
    ['in_west', 'in_north', 'in_south', 'in_east'],   // upper-mid → prefer west
    ['in_west', 'in_south', 'in_north', 'in_east'],   // lower-mid → prefer west
    ['in_south', 'in_west', 'in_east', 'in_north'],   // bottom → prefer south
  ];
  for (let index = 0; index < extractorIds.length; index++) {
    const ports = portPreferences[index] ?? portPreferences[0]!;
    for (const port of ports) {
      if (tryBelt(engine, { building: extractorIds[index]!, port: 'out_east' }, { building: storage, port })) break;
    }
  }

  engine.setSimulationTime(0.28 + rng() * 0.16);
  advanceSimulation(engine, 24, 0.2);

  if (countVisibleUncoveredDeposits(engine) < 4) {
    throw new Error('Generated medium scenario did not preserve enough visible deposits');
  }

  return {
    engine,
    selectedTool: { kind: 'select' },
    viewport: makeViewport(engine, baseAnchor, 0.6),
  };
}
