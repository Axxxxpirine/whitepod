/**
 * Full ISRU (In-Situ Resource Utilisation) scenario generator.
 *
 * Demonstrates the complete resource processing pipeline with visible
 * conveyor chains connecting every stage:
 *
 *   Processing chain (west → east):
 *     – Extractor (Regolith) → belt → Converter 1 (IronOxide) → belt → Synthesizer.in_1
 *     – Extractor (Regolith) → belt → Converter 2 (AluminumOxide) → belt → Synthesizer.in_2
 *     → Synthesizer produces CeramicPlates
 *
 *   Storage wing (south):
 *     – Extractor (Hydrogen) → belt → Storage
 *     – Extractor (Oxygen)   → belt → Storage
 *
 *   Energy:
 *     – Subnet A: solars + battery → extractors
 *     – Subnet B: solars + battery → converters + synthesizer
 *
 *   All 3 base resources extracted, 2 tier-1 refined, 1 tier-2 synthesized.
 *   Belt flow is fully visible through the entire pipeline.
 */

import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
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

export function generateFullIsruScenario(screenWidth: number, screenHeight: number): PreparedScenarioResult {
  const scenarioSeed = createScenarioSeed();
  const rng = mulberry32(scenarioSeed);
  const { engine, baseAnchor, mirrorY } = prepareEngine(screenWidth, screenHeight, rng, scenarioSeed);

  // Force mirrorX = 1: the processing chain relies on west→east port flow
  // (extractor.out_east → converter.in_west → converter.out_east → synthesizer.in_west).
  // Mirroring X would reverse the chain direction while ports keep facing fixed
  // directions, making belt routing unreliable. Y-axis mirror still provides variety.
  const toWorld = (dx: number, dy: number): TileCoord =>
    clampTile({ x: baseAnchor.x + dx, y: baseAnchor.y + dy * mirrorY });

  // ============================================================
  //  Layout overview (relative offsets from baseAnchor)
  //
  //  Processing chain (two parallel rows, west→east):
  //
  //    Row 1 (y = -4):
  //      Extractor(-14,-4) → belt → Converter1(-8,-5) → belt → Synth(2,-5)
  //                                  (3×3, in@(-8,-4)W, out@(-6,-4)E)     (4×4, in_1@(2,-4)W)
  //
  //    Row 2 (y = -1):
  //      Extractor(-14,-1) → belt → Converter2(-8,-2) → belt → Synth(2,-5)
  //                                  (3×3, in@(-8,-1)W, out@(-6,-1)E)     (in_2@(2,-3)W)
  //
  //  Storage wing (south, y = 4):
  //    Extractor(-14, 4) → belt → Storage(-4, 3)
  //    Extractor(-14, 7) → belt → Storage(-4, 3)
  //
  //  Solar farms:
  //    Farm A (north-west): powers extractors
  //    Farm B (north-east): powers converters + synthesizer
  // ============================================================

  // ============================================================
  //  Resource deposits
  // ============================================================

  // Processing chain extractors (Regolith — feeds converters)
  const chainDeposits = [
    { coord: toWorld(-14, -4), type: ResourceType.Regolith },
    { coord: toWorld(-14, -1), type: ResourceType.Regolith },
  ];

  // Storage wing extractors (Hydrogen + Oxygen)
  const storageDeposits = [
    { coord: toWorld(-14, 4), type: ResourceType.Hydrogen },
    { coord: toWorld(-14, 7), type: ResourceType.Oxygen },
  ];

  // Decorative deposits
  const decorativeDeposits: [number, number, ResourceType][] = [
    [-16, -7, ResourceType.Regolith],
    [-16, 9, ResourceType.Hydrogen],
    [10, -9, ResourceType.Oxygen],
    [10, 8, ResourceType.Regolith],
    [-4, -9, ResourceType.Hydrogen],
    [4, 9, ResourceType.Oxygen],
    [-10, 9, ResourceType.Regolith],
    [8, -9, ResourceType.Hydrogen],
  ];

  for (const { coord, type } of [...chainDeposits, ...storageDeposits]) {
    engine.placeResource(coord.x, coord.y, type);
  }
  for (const [dx, dy, type] of decorativeDeposits) {
    const c = toWorld(dx, dy);
    engine.placeResource(c.x, c.y, type);
  }

  // ============================================================
  //  Buildings — Processing chain
  // ============================================================

  // Extractors feeding converters
  const chainExtractor1 = mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, chainDeposits[0].coord, 0, rng);
  const chainExtractor2 = mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, chainDeposits[1].coord, 0, rng);

  // Converter 1: Regolith → IronOxide (3×3)
  // Port 'in' at offset(0,1) facing West → world input at (-8, -4)
  // Port 'out' at offset(2,1) facing East → world output at (-6, -4)
  const converter1 = mustPlaceBuilding(engine, CONVERTER_BUILDING_TYPE_ID, toWorld(-8, -5), 3, rng);

  // Converter 2: Regolith → AluminumOxide (3×3)
  // Port 'in' at offset(0,1) facing West → world input at (-8, -1)
  // Port 'out' at offset(2,1) facing East → world output at (-6, -1)
  const converter2 = mustPlaceBuilding(engine, CONVERTER_BUILDING_TYPE_ID, toWorld(-8, -2), 3, rng);

  // Synthesizer: IronOxide + AluminumOxide → CeramicPlates (4×4)
  // Port 'in_1' at offset(0,1) facing West → world input at (2, -4)
  // Port 'in_2' at offset(0,2) facing West → world input at (2, -3)
  // Port 'out' at offset(3,2) facing East → world output at (5, -3)
  const synthesizer = mustPlaceBuilding(engine, SYNTHESIZER_BUILDING_TYPE_ID, toWorld(2, -5), 3, rng);

  // ============================================================
  //  Buildings — Storage wing
  // ============================================================

  const storage = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(-4, 3), 3, rng);

  const storageExtractor1 = mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, storageDeposits[0].coord, 0, rng);
  const storageExtractor2 = mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, storageDeposits[1].coord, 0, rng);

  // ============================================================
  //  Solar farms + batteries
  // ============================================================

  // Farm A (powers all 4 extractors): 4 solars, 16kW for 4×4kW extractors
  const solarAOffsets: [number, number][] = [
    [-14, -8], [-12, -8], [-10, -8], [-14, -10],
  ];
  const solarAIds = solarAOffsets.map(([dx, dy]) =>
    mustPlaceBuilding(engine, SOLAR_PANEL_BUILDING_TYPE_ID, toWorld(dx, dy), 3, rng),
  );
  const batteryA = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(-11, -6), 3, rng);

  // Farm B (powers converters + synthesizer): 4 solars, 40kW for 6+6+10=22kW
  const solarBOffsets: [number, number][] = [
    [0, -9], [2, -9], [4, -9], [6, -9],
  ];
  const solarBIds = solarBOffsets.map(([dx, dy]) =>
    mustPlaceBuilding(engine, SOLAR_PANEL_BUILDING_TYPE_ID, toWorld(dx, dy), 3, rng),
  );
  const batteryB = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(-2, -8), 3, rng);

  // ============================================================
  //  Energy networks (two subnets)
  // ============================================================

  // Subnet A: solars → batteryA → extractors
  for (const solarId of solarAIds) {
    mustConnect(engine, solarId, batteryA);
  }
  mustConnect(engine, batteryA, chainExtractor1);
  mustConnect(engine, batteryA, chainExtractor2);
  mustConnect(engine, batteryA, storageExtractor1);
  mustConnect(engine, batteryA, storageExtractor2);

  // Subnet B: solars → batteryB → converters + synthesizer
  for (const solarId of solarBIds) {
    mustConnect(engine, solarId, batteryB);
  }
  mustConnect(engine, batteryB, converter1);
  mustConnect(engine, batteryB, converter2);
  mustConnect(engine, batteryB, synthesizer);

  // ============================================================
  //  Belt topology — full pipeline
  // ============================================================

  // Chain 1: Extractor → Converter 1 input
  tryBelt(engine, { building: chainExtractor1, port: 'out_east' }, { building: converter1, port: 'in' });

  // Chain 2: Extractor → Converter 2 input
  tryBelt(engine, { building: chainExtractor2, port: 'out_east' }, { building: converter2, port: 'in' });

  // Converter 1 output → Synthesizer in_1
  tryBelt(engine, { building: converter1, port: 'out' }, { building: synthesizer, port: 'in_1' });

  // Converter 2 output → Synthesizer in_2
  tryBelt(engine, { building: converter2, port: 'out' }, { building: synthesizer, port: 'in_2' });

  // Storage wing: extractors → storage
  const storageInputPorts = ['in_west', 'in_south', 'in_north', 'in_east'] as const;
  for (const extractorId of [storageExtractor1, storageExtractor2]) {
    for (const port of storageInputPorts) {
      if (tryBelt(engine, { building: extractorId, port: 'out_east' }, { building: storage, port })) break;
    }
  }

  // ============================================================
  //  Recipe assignment
  // ============================================================
  engine.setProcessorRecipe(converter1, 'iron_oxide');
  engine.setProcessorRecipe(converter2, 'aluminum_oxide');
  engine.setProcessorRecipe(synthesizer, 'ceramic_plates');

  // ============================================================
  //  Simulation — let the pipeline run to accumulate resources
  // ============================================================
  engine.setSimulationTime(0.28 + rng() * 0.16);

  // Seed base resources so converters can start immediately
  engine.playerStock.regolith = 20;
  engine.playerStock.hydrogen = 10;
  engine.playerStock.oxygen = 10;

  // Run 60s: extractors feed converters via playerStock,
  // converters produce IronOxide + AluminumOxide,
  // synthesizer consumes both for CeramicPlates.
  advanceSimulation(engine, 60, 0.2);

  if (countVisibleUncoveredDeposits(engine) < 4) {
    throw new Error('Generated full-ISRU scenario did not preserve enough visible deposits');
  }

  return {
    engine,
    selectedTool: { kind: 'select' },
    viewport: makeViewport(engine, baseAnchor, 0.45),
  };
}
