/**
 * Simple tier scenario generator.
 *
 * Produces a small, beginner-friendly layout:
 *   – 4 solar panels + 1 battery + 3 extractors + 3 storages
 *   – 2 resource types extracted, ~5 visible deposits
 *   – Single energy subnet (solar → battery → extractors)
 *   – Each extractor routes into its own nearby storage for deterministic accumulation
 */

import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { ResourceType, type TileCoord } from '@/game/types';
import type { PreparedScenarioResult } from '../types';
import {
  advanceSimulation,
  clampTile,
  countVisibleUncoveredDeposits,
  createScenarioSeed,
  makeViewport,
  mustConnect,
  mustPlaceBuilding,
  prepareBuildZone,
  prepareEngine,
  randomInt,
  tryBelt,
} from '../generatorUtils';
import { mulberry32 } from '@/game/data/SeededRNG';

interface LayoutTemplate {
  readonly extractorDeposits: readonly { readonly dx: number; readonly dy: number; readonly type: ResourceType }[];
  readonly extractorStorages: readonly { readonly dx: number; readonly dy: number }[];
  readonly visibleDeposits: readonly { readonly dx: number; readonly dy: number; readonly type: ResourceType }[];
  readonly solarTargets: readonly { readonly dx: number; readonly dy: number }[];
  readonly batteryTarget: { readonly dx: number; readonly dy: number };
}

const STARTER_LAYOUTS: readonly LayoutTemplate[] = [
  {
    extractorDeposits: [
      { dx: -8, dy: -4, type: ResourceType.Regolith },
      { dx: -8, dy: 0, type: ResourceType.Hydrogen },
      { dx: -8, dy: 4, type: ResourceType.Regolith },
    ],
    extractorStorages: [
      { dx: -2, dy: -5 },
      { dx: -2, dy: -1 },
      { dx: -2, dy: 3 },
    ],
    visibleDeposits: [
      { dx: 6, dy: -7, type: ResourceType.Hydrogen },
      { dx: 8, dy: -1, type: ResourceType.Oxygen },
      { dx: 7, dy: 5, type: ResourceType.Regolith },
      { dx: -4, dy: 8, type: ResourceType.Hydrogen },
      { dx: 5, dy: 8, type: ResourceType.Regolith },
    ],
    solarTargets: [
      { dx: 4, dy: -3 },
      { dx: 6, dy: -3 },
      { dx: 4, dy: 1 },
      { dx: 6, dy: 1 },
    ],
    batteryTarget: { dx: 5, dy: -1 },
  },
];

export function generateSimpleScenario(screenWidth: number, screenHeight: number): PreparedScenarioResult {
  const scenarioSeed = createScenarioSeed();
  const rng = mulberry32(scenarioSeed);
  const { engine, baseAnchor, mirrorX, mirrorY } = prepareEngine(screenWidth, screenHeight, rng, scenarioSeed);
  prepareBuildZone(engine, baseAnchor.x, baseAnchor.y, 18);

  const layout = STARTER_LAYOUTS[randomInt(rng, 0, STARTER_LAYOUTS.length - 1)] ?? STARTER_LAYOUTS[0];
  const toWorld = (dx: number, dy: number): TileCoord =>
    clampTile({ x: baseAnchor.x + dx * mirrorX, y: baseAnchor.y + dy * mirrorY });

  const extractorDeposits = layout.extractorDeposits.map((d) => ({ coord: toWorld(d.dx, d.dy), type: d.type }));
  const visibleDeposits = layout.visibleDeposits.map((d) => ({ coord: toWorld(d.dx, d.dy), type: d.type }));

  for (const deposit of [...extractorDeposits, ...visibleDeposits]) {
    engine.placeResource(deposit.coord.x, deposit.coord.y, deposit.type);
  }

  const solarIds = layout.solarTargets.map((target) =>
    mustPlaceBuilding(engine, SOLAR_PANEL_BUILDING_TYPE_ID, toWorld(target.dx, target.dy), 4, rng),
  );
  const battery = mustPlaceBuilding(
    engine,
    BATTERY_BASIC_BUILDING_TYPE_ID,
    toWorld(layout.batteryTarget.dx, layout.batteryTarget.dy),
    5,
    rng,
  );
  const extractorIds = extractorDeposits.map((deposit) =>
    mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, deposit.coord, 0, rng),
  );
  const storageIds = layout.extractorStorages.map((target) =>
    mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(target.dx, target.dy), 2, rng),
  );

  for (const solarId of solarIds) {
    mustConnect(engine, solarId, battery);
  }
  for (const extractorId of extractorIds) {
    mustConnect(engine, battery, extractorId);
  }

  extractorIds.forEach((extractorId, index) => {
    const storageId = storageIds[index];
    if (!storageId) {
      throw new Error(`Missing starter storage for extractor ${extractorId}`);
    }
    if (!tryBelt(engine, { building: extractorId, port: 'out_east' }, { building: storageId, port: 'in_west' })) {
      throw new Error(`Failed to route starter extractor ${extractorId} to storage ${storageId}`);
    }
  });

  engine.setSimulationTime(0.45);
  advanceSimulation(engine, 18, 0.2);

  if (countVisibleUncoveredDeposits(engine) < 3) {
    throw new Error('Generated simple scenario did not preserve enough visible deposits');
  }

  return {
    engine,
    selectedTool: { kind: 'select' },
    viewport: makeViewport(engine, baseAnchor, 0.7),
  };
}
