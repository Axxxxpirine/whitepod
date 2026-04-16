/**
 * Complex tier scenario generator.
 *
 * Produces a high-complexity layout with two operational wings:
 *
 *   Wing A (west): Regolith + Hydrogen extraction
 *     – 6 solar panels + 2 batteries + 4 extractors + 1 merger + 1 storage
 *     – Belt topology: 2 extractors → merger inputs → storage; 2 extractors → storage direct
 *
 *   Wing B (east): Oxygen extraction
 *     – 3 solar panels + 1 battery + 2 extractors + 1 storage
 *     – Belt topology: extractors → storage
 *
 *   Center: 1 watchtower (extends fog reveal)
 *
 *   – Two disjoint energy subnets (no cross-link between wings)
 *   – ~10 visible decorative deposits
 *   – All 3 resource types extracted
 *
 * Layout uses fixed structural offsets so belt routes have clear corridors.
 * Mergers are placed explicitly between their feeding extractors and the
 * downstream storage to guarantee a workable belt path.
 */

import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
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
  tryBelt,
} from '../generatorUtils';

export function generateComplexScenario(screenWidth: number, screenHeight: number): PreparedScenarioResult {
  const scenarioSeed = createScenarioSeed();
  const rng = mulberry32(scenarioSeed);
  const { engine, baseAnchor, mirrorX, mirrorY } = prepareEngine(screenWidth, screenHeight, rng, scenarioSeed);

  const toWorld = (dx: number, dy: number): TileCoord =>
    clampTile({ x: baseAnchor.x + dx * mirrorX, y: baseAnchor.y + dy * mirrorY });

  // ============================================================
  //  WING A — west, regolith + hydrogen, with merger
  // ============================================================
  // Layout (relative to baseAnchor):
  //
  //   solars(-12..-9, -5..-3)     storageA(-2..0, 0..2)
  //   batteries(-11..-10, -1..0 + -10..-9, 1..2)
  //
  //   extractor(-13, -3) → merger(-5,-2).in_west
  //   extractor(-13,  0) → merger(-5,-2).in_south
  //   extractor(-13,  4) → storageA.in_west (direct)
  //   extractor(-13,  7) → storageA.in_south (direct)
  //
  //   merger(-5,-2).out_east → storageA.in_west or in_north

  const wingAExtractorDeposits = [
    { coord: toWorld(-13, -3), type: ResourceType.Regolith },
    { coord: toWorld(-13, 0), type: ResourceType.Regolith },
    { coord: toWorld(-13, 4), type: ResourceType.Hydrogen },
    { coord: toWorld(-13, 7), type: ResourceType.Hydrogen },
  ];

  // Wing B: east, copper only, no merger
  const wingBExtractorDeposits = [
    { coord: toWorld(13, -1), type: ResourceType.Oxygen },
    { coord: toWorld(13, 3), type: ResourceType.Oxygen },
  ];

  // Decorative deposits scattered around the map
  const decorativeDeposits: [number, number, ResourceType][] = [
    [-15, 9, ResourceType.Regolith],
    [-15, -7, ResourceType.Hydrogen],
    [10, 7, ResourceType.Oxygen],
    [15, 7, ResourceType.Regolith],
    [-5, -8, ResourceType.Hydrogen],
    [5, -8, ResourceType.Oxygen],
    [-9, 9, ResourceType.Regolith],
    [9, -9, ResourceType.Hydrogen],
    [-2, 9, ResourceType.Oxygen],
    [2, -9, ResourceType.Regolith],
  ];

  for (const { coord, type } of [...wingAExtractorDeposits, ...wingBExtractorDeposits]) {
    engine.placeResource(coord.x, coord.y, type);
  }
  for (const [dx, dy, type] of decorativeDeposits) {
    const coord = toWorld(dx, dy);
    engine.placeResource(coord.x, coord.y, type);
  }

  // ---------- WING A buildings ----------
  // Storage A — east of extractor column, west of center
  const storageA = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(-2, 1), 3, rng);

  // Merger A — placed between extractor column (x=-13) and storage (x=-2)
  // Use x=-7 (midpoint) and y=-2 (aligned with top extractors).
  const mergerA = mustPlaceBuilding(engine, MERGER_BASIC_BUILDING_TYPE_ID, toWorld(-7, -2), 2, rng);

  // Solar farm A — north of the wing
  const wingASolarOffsets: [number, number][] = [
    [-12, -5], [-10, -5], [-8, -5],
    [-12, -7], [-10, -7], [-8, -7],
  ];
  const wingASolarIds = wingASolarOffsets.map(([dx, dy]) =>
    mustPlaceBuilding(engine, SOLAR_PANEL_BUILDING_TYPE_ID, toWorld(dx, dy), 3, rng),
  );

  // Batteries A
  const batteryA1 = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(-5, -6), 3, rng);
  const batteryA2 = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(-5, 6), 3, rng);

  // Extractors A
  const wingAExtractorIds = wingAExtractorDeposits.map((d) =>
    mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, d.coord, 0, rng),
  );

  // ---------- WING B buildings ----------
  const storageB = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(7, 1), 3, rng);

  const wingBSolarOffsets: [number, number][] = [
    [10, -5], [12, -5], [14, -5],
  ];
  const wingBSolarIds = wingBSolarOffsets.map(([dx, dy]) =>
    mustPlaceBuilding(engine, SOLAR_PANEL_BUILDING_TYPE_ID, toWorld(dx, dy), 3, rng),
  );

  const batteryB = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(11, -2), 3, rng);

  const wingBExtractorIds = wingBExtractorDeposits.map((d) =>
    mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, d.coord, 0, rng),
  );

  // ---------- Watchtower (center, extends fog reveal) ----------
  const watchtower = mustPlaceBuilding(engine, WATCHTOWER_BUILDING_TYPE_ID, toWorld(3, -5), 3, rng);
  void watchtower;

  // ============================================================
  //  Energy networks (two disjoint subnets)
  // ============================================================
  // Subnet A
  for (const solarId of wingASolarIds) {
    mustConnect(engine, solarId, batteryA1);
  }
  mustConnect(engine, batteryA1, batteryA2);
  for (const extractorId of wingAExtractorIds) {
    mustConnect(engine, batteryA2, extractorId);
  }

  // Subnet B (no cross-link to A)
  for (const solarId of wingBSolarIds) {
    mustConnect(engine, solarId, batteryB);
  }
  for (const extractorId of wingBExtractorIds) {
    mustConnect(engine, batteryB, extractorId);
  }

  // ============================================================
  //  Belt topology
  // ============================================================
  const storageInputPorts = ['in_west', 'in_north', 'in_south', 'in_east'] as const;

  // Wing A: route 2 top extractors through merger, 2 bottom directly to storage
  // extractor(-13,-3) → mergerA.in_west (straight East along y=-3 then turn South)
  // extractor(-13, 0) → mergerA.in_south (route South-East, enter from below)
  const mergerInputAttempts: readonly (readonly string[])[] = [
    ['in_west', 'in_north', 'in_south'], // first feeder prefers West (straight horizontal)
    ['in_south', 'in_west', 'in_north'], // second feeder prefers South
  ];
  for (let index = 0; index < 2 && index < wingAExtractorIds.length; index++) {
    const ports = mergerInputAttempts[index]!;
    for (const port of ports) {
      if (tryBelt(engine, { building: wingAExtractorIds[index]!, port: 'out_east' }, { building: mergerA, port })) {
        break;
      }
    }
  }

  // Merger A → Storage A
  for (const port of storageInputPorts) {
    if (tryBelt(engine, { building: mergerA, port: 'out_east' }, { building: storageA, port })) break;
  }

  // Remaining wing A extractors → storage A directly
  const wingAStoragePortPrefs: readonly (readonly string[])[] = [
    ['in_west', 'in_north', 'in_south', 'in_east'],
    ['in_south', 'in_west', 'in_east', 'in_north'],
  ];
  for (let index = 2; index < wingAExtractorIds.length; index++) {
    const ports = wingAStoragePortPrefs[index - 2] ?? storageInputPorts;
    for (const port of ports) {
      if (tryBelt(engine, { building: wingAExtractorIds[index]!, port: 'out_east' }, { building: storageA, port })) {
        break;
      }
    }
  }

  // Wing B: extractors → storage B
  // Extractors are EAST of storage, so they need belts looping back West.
  // Try in_east first since that's the closest face.
  const wingBStoragePortPrefs = ['in_east', 'in_south', 'in_north', 'in_west'] as const;
  for (const extractorId of wingBExtractorIds) {
    for (const port of wingBStoragePortPrefs) {
      if (tryBelt(engine, { building: extractorId, port: 'out_east' }, { building: storageB, port })) break;
    }
  }

  engine.setSimulationTime(0.28 + rng() * 0.16);
  advanceSimulation(engine, 30, 0.2);

  if (countVisibleUncoveredDeposits(engine) < 6) {
    throw new Error('Generated complex scenario did not preserve enough visible deposits');
  }

  return {
    engine,
    selectedTool: { kind: 'select' },
    viewport: makeViewport(engine, baseAnchor, 0.5),
  };
}
