/**
 * Build All scenario generator.
 *
 * Clean left-to-right production graph showing how all 12 resources are made.
 * Every processor outputs to its own dedicated storage via belt.
 *
 * Production graph:
 *
 *   Regolith → [Conv iron_oxide]      → IronOxide      → [Synth ceramic_plates] → CeramicPlates
 *   Regolith → [Conv aluminum_oxide]  → AluminumOxide  ↗
 *   Regolith → [Conv silicon_dioxide] → SiliconDioxide
 *   Oxygen   → [Conv nitrogen_gas]    → NitrogenGas
 *
 *   Hydrogen + Oxygen → [Synth water]          → Water
 *   Hydrogen + Oxygen → [Synth methane]        → Methane
 *   Hydrogen + Oxygen → [Synth carbon_dioxide] → CarbonDioxide
 *   Hydrogen + Oxygen → [Synth ammonia]        → Ammonia
 *
 * Layout (dx, dy offsets from baseAnchor, fixed orientation):
 *
 *   dx=-22  Extractors:  Regolith(-22,-7)  Hydrogen(-22,-3)  Oxygen(-22,1)
 *   dx=-19  Base storages (3×3): Regolith(-19,-8)  Hydrogen(-19,-4)  Oxygen(-19,0)
 *   dx=-12  Converters (3×3):   IronOx(-12,-11) AlumOx(-12,-7) SiO2(-12,-3) N2(-12,1)
 *   dx=-6   Conv output storages:  IronOx(-6,-11) AlumOx(-6,-7) SiO2(-6,-3) N2(-6,1)
 *   dx=0    Synthesizers (4×4): Ceramic(0,-14) Water(0,-9) Methane(0,-4) CO2(0,1) Ammonia(0,6)
 *   dx=7    Synth output storages: Ceramic(7,-13) Water(7,-8) Methane(7,-3) CO2(7,2) Ammonia(7,7)
 *   dy=-17  Solar farm (9 panels) + battery at (-10,-15)
 *
 * Belts: each building has exactly one output belt → dedicated storage.
 * Processor inputs come from playerStock (pre-seeded with 200 of each base resource).
 * One energy subnet powers everything (9×10 kW = 90 kW vs 86 kW demand).
 */

import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { ResourceType, TileType, type TileCoord } from '@/game/types';
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
  prepareBuildZone,
  prepareEngine,
  tryBelt,
} from '../generatorUtils';

export function generateBuildAllScenario(screenWidth: number, screenHeight: number): PreparedScenarioResult {
  const scenarioSeed = createScenarioSeed();
  const rng = mulberry32(scenarioSeed);
  const { engine, baseAnchor } = prepareEngine(screenWidth, screenHeight, rng, scenarioSeed);
  // mirrorX / mirrorY intentionally not used — fixed layout for graph clarity

  const toWorld = (dx: number, dy: number): TileCoord =>
    clampTile({ x: baseAnchor.x + dx, y: baseAnchor.y + dy });

  // Radius 30 covers all buildings (furthest: solar at dx=-20,dy=-17, dist≈26.2 tiles)
  prepareBuildZone(engine, baseAnchor.x, baseAnchor.y, 30);

  // ============================================================
  //  Resource deposits
  // ============================================================

  const regolithCoord = toWorld(-22, -7);
  const hydrogenCoord = toWorld(-22, -3);
  const oxygenCoord   = toWorld(-22,  1);

  engine.placeTile(regolithCoord.x, regolithCoord.y, TileType.Ground);
  engine.placeTile(hydrogenCoord.x, hydrogenCoord.y, TileType.Ground);
  engine.placeTile(oxygenCoord.x,   oxygenCoord.y,   TileType.Ground);
  engine.placeResource(regolithCoord.x, regolithCoord.y, ResourceType.Regolith);
  engine.placeResource(hydrogenCoord.x, hydrogenCoord.y, ResourceType.Hydrogen);
  engine.placeResource(oxygenCoord.x,   oxygenCoord.y,   ResourceType.Oxygen);

  // Decorative uncovered deposits visible in viewport (avoid all building footprints)
  const decorativeDeposits: [number, number, ResourceType][] = [
    [-15, -14, ResourceType.Regolith],
    [-15,   6, ResourceType.Hydrogen],
    [  5, -13, ResourceType.Oxygen],
    [  5,   5, ResourceType.Regolith],
    [ 11,  -9, ResourceType.Hydrogen],
    [ 11,   1, ResourceType.Oxygen],
  ];
  for (const [dx, dy, type] of decorativeDeposits) {
    const c = toWorld(dx, dy);
    engine.placeResource(c.x, c.y, type);
  }

  // ============================================================
  //  Extractors (placed on deposits)
  // ============================================================

  const extRegolith = mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, regolithCoord, 0, rng);
  const extHydrogen = mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, hydrogenCoord, 0, rng);
  const extOxygen   = mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, oxygenCoord,   0, rng);

  // ============================================================
  //  Base resource storages (3×3, in_west aligns with extractor out_east)
  //  Storage at (sx,sy): in_west port at (sx, sy+1)
  //  Extractor at (ex,ey): out_east port at (ex, ey) → belt east to (sx-1, ey)
  // ============================================================

  const storageRegolith = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(-19, -8), 0, rng);
  const storageHydrogen = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(-19, -4), 0, rng);
  const storageOxygen   = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(-19,  0), 0, rng);

  // ============================================================
  //  Converters (3×3, out port at offset (2,1) east)
  //  Placed at dx=-12, spaced 4 rows apart (3 height + 1 gap)
  // ============================================================

  const convIronOxide      = mustPlaceBuilding(engine, CONVERTER_BUILDING_TYPE_ID, toWorld(-12, -11), 0, rng);
  const convAluminumOxide  = mustPlaceBuilding(engine, CONVERTER_BUILDING_TYPE_ID, toWorld(-12,  -7), 0, rng);
  const convSiliconDioxide = mustPlaceBuilding(engine, CONVERTER_BUILDING_TYPE_ID, toWorld(-12,  -3), 0, rng);
  const convNitrogenGas    = mustPlaceBuilding(engine, CONVERTER_BUILDING_TYPE_ID, toWorld(-12,   1), 0, rng);

  // ============================================================
  //  Converter output storages — in_west aligns with converter out port
  //  Conv at (-12,dy): out at (-10, dy+1). Storage at (-6,dy): in_west at (-6, dy+1). ✓
  // ============================================================

  const storageIronOxide      = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(-6, -11), 0, rng);
  const storageAluminumOxide  = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(-6,  -7), 0, rng);
  const storageSiliconDioxide = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(-6,  -3), 0, rng);
  const storageNitrogenGas    = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(-6,   1), 0, rng);

  // ============================================================
  //  Synthesizers (4×4, out port at offset (3,2) east)
  //  Placed at dx=0, spaced 5 rows apart (4 height + 1 gap)
  // ============================================================

  const synthCeramic = mustPlaceBuilding(engine, SYNTHESIZER_BUILDING_TYPE_ID, toWorld(0, -14), 0, rng);
  const synthWater   = mustPlaceBuilding(engine, SYNTHESIZER_BUILDING_TYPE_ID, toWorld(0,  -9), 0, rng);
  const synthMethane = mustPlaceBuilding(engine, SYNTHESIZER_BUILDING_TYPE_ID, toWorld(0,  -4), 0, rng);
  const synthCo2     = mustPlaceBuilding(engine, SYNTHESIZER_BUILDING_TYPE_ID, toWorld(0,   1), 0, rng);
  const synthAmmonia = mustPlaceBuilding(engine, SYNTHESIZER_BUILDING_TYPE_ID, toWorld(0,   6), 0, rng);

  // ============================================================
  //  Synthesizer output storages — in_west aligns with synthesizer out port
  //  Synth at (0,dy): out at (3, dy+2). Storage at (7,sy): in_west at (7, sy+1).
  //  → sy = dy+1 for in_west.y = dy+2
  // ============================================================

  const storageCeramicPlates = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(7, -13), 0, rng);
  const storageWater         = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(7,  -8), 0, rng);
  const storageMethane       = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(7,  -3), 0, rng);
  const storageCarbonDioxide = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(7,   2), 0, rng);
  const storageAmmonia       = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(7,   7), 0, rng);

  // ============================================================
  //  Solar farm + battery
  //  9 panels × 10 kW = 90 kW > 86 kW total demand
  //  (3 extractors × 4 kW + 4 converters × 6 kW + 5 synthesizers × 10 kW)
  // ============================================================

  const solarOffsets: [number, number][] = [
    [-20, -17], [-17, -17], [-14, -17], [-11, -17], [-8, -17],
    [ -5, -17], [ -2, -17], [  1, -17], [  4, -17],
  ];
  const solarIds = solarOffsets.map(([dx, dy]) =>
    mustPlaceBuilding(engine, SOLAR_PANEL_BUILDING_TYPE_ID, toWorld(dx, dy), 0, rng),
  );
  const battery = mustPlaceBuilding(engine, BATTERY_BASIC_BUILDING_TYPE_ID, toWorld(-10, -15), 0, rng);

  // ============================================================
  //  Single energy subnet
  // ============================================================

  for (const solarId of solarIds) mustConnect(engine, solarId, battery);
  mustConnect(engine, battery, extRegolith);
  mustConnect(engine, battery, extHydrogen);
  mustConnect(engine, battery, extOxygen);
  mustConnect(engine, battery, convIronOxide);
  mustConnect(engine, battery, convAluminumOxide);
  mustConnect(engine, battery, convSiliconDioxide);
  mustConnect(engine, battery, convNitrogenGas);
  mustConnect(engine, battery, synthCeramic);
  mustConnect(engine, battery, synthWater);
  mustConnect(engine, battery, synthMethane);
  mustConnect(engine, battery, synthCo2);
  mustConnect(engine, battery, synthAmmonia);

  // ============================================================
  //  Belts — each output connects to its dedicated storage
  // ============================================================

  // Base extractors → base storages
  tryBelt(engine, { building: extRegolith, port: 'out_east' }, { building: storageRegolith, port: 'in_west' });
  tryBelt(engine, { building: extHydrogen, port: 'out_east' }, { building: storageHydrogen, port: 'in_west' });
  tryBelt(engine, { building: extOxygen,   port: 'out_east' }, { building: storageOxygen,   port: 'in_west' });

  // Converters → converter output storages
  tryBelt(engine, { building: convIronOxide,      port: 'out' }, { building: storageIronOxide,      port: 'in_west' });
  tryBelt(engine, { building: convAluminumOxide,  port: 'out' }, { building: storageAluminumOxide,  port: 'in_west' });
  tryBelt(engine, { building: convSiliconDioxide, port: 'out' }, { building: storageSiliconDioxide, port: 'in_west' });
  tryBelt(engine, { building: convNitrogenGas,    port: 'out' }, { building: storageNitrogenGas,    port: 'in_west' });

  // Synthesizers → synthesizer output storages
  tryBelt(engine, { building: synthCeramic, port: 'out' }, { building: storageCeramicPlates, port: 'in_west' });
  tryBelt(engine, { building: synthWater,   port: 'out' }, { building: storageWater,         port: 'in_west' });
  tryBelt(engine, { building: synthMethane, port: 'out' }, { building: storageMethane,       port: 'in_west' });
  tryBelt(engine, { building: synthCo2,     port: 'out' }, { building: storageCarbonDioxide, port: 'in_west' });
  tryBelt(engine, { building: synthAmmonia, port: 'out' }, { building: storageAmmonia,       port: 'in_west' });

  // ============================================================
  //  Recipes
  // ============================================================

  engine.setProcessorRecipe(convIronOxide,      'iron_oxide');
  engine.setProcessorRecipe(convAluminumOxide,  'aluminum_oxide');
  engine.setProcessorRecipe(convSiliconDioxide, 'silicon_dioxide');
  engine.setProcessorRecipe(convNitrogenGas,    'nitrogen_gas');
  engine.setProcessorRecipe(synthCeramic,       'ceramic_plates');
  engine.setProcessorRecipe(synthWater,         'water');
  engine.setProcessorRecipe(synthMethane,       'methane');
  engine.setProcessorRecipe(synthCo2,           'carbon_dioxide');
  engine.setProcessorRecipe(synthAmmonia,       'ammonia');

  // ============================================================
  //  Simulation
  // ============================================================

  engine.setSimulationTime(0.28 + rng() * 0.16);

  // Seed generous stock so all processors can start immediately.
  engine.playerStock.regolith = 200;
  engine.playerStock.hydrogen = 200;
  engine.playerStock.oxygen   = 200;

  // 90 s gives every processor multiple cycles.
  advanceSimulation(engine, 90, 0.2);

  // Center viewport on the layout midpoint (dx=-6, dy=-4 from baseAnchor)
  const layoutCenter = { x: baseAnchor.x - 6, y: baseAnchor.y - 4 };
  const viewport = makeViewport(engine, layoutCenter, 0.28);

  if (countVisibleUncoveredDeposits(engine) < 4) {
    throw new Error('Generated Build All scenario did not preserve enough visible deposits');
  }

  return {
    engine,
    selectedTool: { kind: 'select' },
    viewport,
  };
}
