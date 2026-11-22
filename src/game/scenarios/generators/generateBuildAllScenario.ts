/**
 * Build All scenario generator.
 *
 * Dedicated connected chains produce and store every resource type without
 * relying on global stock. Base resources, tier-1 processor outputs, and final
 * synthesized products each get their own literal production line.
 */

import {
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import type { BuildingId, PortId, TileCoord } from '@/game/types';
import { ResourceType, TileType } from '@/game/types';
import { mulberry32 } from '@/game/data/SeededRNG';
import type { PreparedScenarioResult } from '../types';
import {
  advanceSimulation,
  clampTile,
  countRevealedUncoveredDeposits,
  createScenarioSeed,
  makeViewport,
  mustConnect,
  mustPlaceBuilding,
  prepareBuildZone,
  prepareEngine,
  tryBelt,
} from '../generatorUtils';

type OutputEndpoint = { readonly building: BuildingId; readonly port: PortId };

function providerOffsets(count: number): readonly number[] {
  switch (count) {
    case 1:
      return [0];
    case 2:
      return [-2, 2];
    case 3:
      return [-4, 0, 4];
    case 4:
      return [-6, -2, 2, 6];
    default:
      throw new Error(`Unsupported provider count: ${count}`);
  }
}

export function generateBuildAllScenario(screenWidth: number, screenHeight: number): PreparedScenarioResult {
  const scenarioSeed = createScenarioSeed();
  const rng = mulberry32(scenarioSeed);
  const { engine, baseAnchor } = prepareEngine(screenWidth, screenHeight, rng, scenarioSeed);

  const toWorld = (dx: number, dy: number): TileCoord =>
    clampTile({ x: baseAnchor.x + dx, y: baseAnchor.y + dy });

  prepareBuildZone(engine, baseAnchor.x, baseAnchor.y, 104);

  const mustRoute = (label: string, from: OutputEndpoint, to: { readonly building: BuildingId; readonly port: PortId }) => {
    if (!tryBelt(engine, from, to)) {
      throw new Error(`Failed to route ${label}`);
    }
  };

  const placeExtractor = (resourceType: ResourceType, dx: number, dy: number): BuildingId => {
    const coord = toWorld(dx, dy);
    engine.placeTile(coord.x, coord.y, TileType.Ground);
    engine.placeResource(coord.x, coord.y, resourceType);
    return mustPlaceBuilding(engine, EXTRACTOR_BUILDING_TYPE_ID, coord, 0, rng);
  };

  const placeExtractors = (resourceType: ResourceType, count: number, dx: number, centerDy: number): BuildingId[] =>
    providerOffsets(count).map((offset) => placeExtractor(resourceType, dx, centerDy + offset));

  const placeMerger = (dx: number, dy: number): BuildingId =>
    mustPlaceBuilding(engine, MERGER_BASIC_BUILDING_TYPE_ID, toWorld(dx, dy), 0, rng);

  const connectProviders = (
    label: string,
    providers: readonly OutputEndpoint[],
    target: { readonly building: BuildingId; readonly port: PortId },
    mergerDx: number,
    mergerDy: number,
  ): BuildingId[] => {
    if (providers.length === 0) {
      throw new Error(`Missing providers for ${label}`);
    }
    if (providers.length === 1) {
      mustRoute(label, providers[0]!, target);
      return [];
    }

    if (providers.length <= 3) {
      const merger = placeMerger(mergerDx, mergerDy);
      const inputPorts = ['in_north', 'in_west', 'in_south'] as const;
      providers.forEach((provider, index) => {
        mustRoute(`${label} provider ${index + 1}`, provider, { building: merger, port: inputPorts[index]! });
      });
      mustRoute(`${label} output`, { building: merger, port: 'out_east' }, target);
      return [merger];
    }

    if (providers.length === 4) {
      const collector = placeMerger(mergerDx - 6, mergerDy - 4);
      const finalMerger = placeMerger(mergerDx, mergerDy);
      const collectorPorts = ['in_north', 'in_west', 'in_south'] as const;

      providers.slice(0, 3).forEach((provider, index) => {
        mustRoute(`${label} collector ${index + 1}`, provider, { building: collector, port: collectorPorts[index]! });
      });
      mustRoute(`${label} collector output`, { building: collector, port: 'out_east' }, { building: finalMerger, port: 'in_north' });
      mustRoute(`${label} provider 4`, providers[3]!, { building: finalMerger, port: 'in_west' });
      mustRoute(`${label} final output`, { building: finalMerger, port: 'out_east' }, target);
      return [collector, finalMerger];
    }

    throw new Error(`Unsupported provider count for ${label}: ${providers.length}`);
  };

  const placeStorageChain = (label: string, resourceType: ResourceType, rowDy: number) => {
    const extractors = placeExtractors(resourceType, 1, -64, rowDy);
    const storage = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(-54, rowDy - 1), 0, rng);
    mustRoute(`${label} storage`, { building: extractors[0]!, port: 'out_east' }, { building: storage, port: 'in_west' });
    return { extractors, storage, mergers: [] as BuildingId[] };
  };

  const placeConverterChain = (
    label: string,
    recipeId: 'iron_oxide' | 'aluminum_oxide' | 'silicon_dioxide' | 'nitrogen_gas',
    resourceType: ResourceType,
    providerCount: number,
    rowDy: number,
  ) => {
    const extractors = placeExtractors(resourceType, providerCount, -64, rowDy);
    const converter = mustPlaceBuilding(engine, CONVERTER_BUILDING_TYPE_ID, toWorld(-40, rowDy - 1), 0, rng);
    const storage = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(-26, rowDy - 1), 0, rng);
    const mergers = connectProviders(
      `${label} input`,
      extractors.map((building) => ({ building, port: 'out_east' as const })),
      { building: converter, port: 'in' },
      -48,
      rowDy,
    );
    mustRoute(`${label} storage`, { building: converter, port: 'out' }, { building: storage, port: 'in_west' });
    if (!engine.setProcessorRecipe(converter, recipeId)) {
      throw new Error(`Failed to set recipe ${recipeId}`);
    }
    return { extractors, converter, storage, mergers };
  };

  const placeSynthChain = (
    label: string,
    recipeId: 'water' | 'methane' | 'carbon_dioxide' | 'ammonia',
    inputA: { readonly resourceType: ResourceType; readonly count: number; readonly x: number; readonly centerDy: number },
    inputB: { readonly resourceType: ResourceType; readonly count: number; readonly x: number; readonly centerDy: number },
    rowDy: number,
  ) => {
    const extractorsA = placeExtractors(inputA.resourceType, inputA.count, inputA.x, inputA.centerDy);
    const extractorsB = placeExtractors(inputB.resourceType, inputB.count, inputB.x, inputB.centerDy);
    const synthesizer = mustPlaceBuilding(engine, SYNTHESIZER_BUILDING_TYPE_ID, toWorld(22, rowDy - 2), 0, rng);
    const storage = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(36, rowDy - 1), 0, rng);
    const mergers = [
      ...connectProviders(
        `${label} input 1`,
        extractorsA.map((building) => ({ building, port: 'out_east' as const })),
        { building: synthesizer, port: 'in_1' },
        8,
        rowDy - 4,
      ),
      ...connectProviders(
        `${label} input 2`,
        extractorsB.map((building) => ({ building, port: 'out_east' as const })),
        { building: synthesizer, port: 'in_2' },
        14,
        rowDy + 4,
      ),
    ];
    mustRoute(`${label} storage`, { building: synthesizer, port: 'out' }, { building: storage, port: 'in_west' });
    if (!engine.setProcessorRecipe(synthesizer, recipeId)) {
      throw new Error(`Failed to set recipe ${recipeId}`);
    }
    return { extractors: [...extractorsA, ...extractorsB], synthesizer, storage, mergers };
  };

  const placeCeramicChain = (rowDy: number) => {
    const aluminumExtractors = placeExtractors(ResourceType.Regolith, 2, -20, rowDy - 4);
    const ironExtractors = placeExtractors(ResourceType.Regolith, 1, -20, rowDy + 4);
    const aluminumConverter = mustPlaceBuilding(engine, CONVERTER_BUILDING_TYPE_ID, toWorld(0, rowDy - 6), 0, rng);
    const ironConverter = mustPlaceBuilding(engine, CONVERTER_BUILDING_TYPE_ID, toWorld(0, rowDy + 2), 0, rng);
    const synthesizer = mustPlaceBuilding(engine, SYNTHESIZER_BUILDING_TYPE_ID, toWorld(22, rowDy - 2), 0, rng);
    const storage = mustPlaceBuilding(engine, STORAGE_BUILDING_TYPE_ID, toWorld(36, rowDy - 1), 0, rng);

    const mergers = connectProviders(
      'ceramic aluminum input',
      aluminumExtractors.map((building) => ({ building, port: 'out_east' as const })),
      { building: aluminumConverter, port: 'in' },
      -8,
      rowDy - 4,
    );
    const ironMergers = connectProviders(
      'ceramic iron input',
      ironExtractors.map((building) => ({ building, port: 'out_east' as const })),
      { building: ironConverter, port: 'in' },
      -8,
      rowDy + 4,
    );
    mustRoute('ceramic converter aluminum', { building: aluminumConverter, port: 'out' }, { building: synthesizer, port: 'in_1' });
    mustRoute('ceramic converter iron', { building: ironConverter, port: 'out' }, { building: synthesizer, port: 'in_2' });
    mustRoute('ceramic storage', { building: synthesizer, port: 'out' }, { building: storage, port: 'in_west' });

    if (!engine.setProcessorRecipe(aluminumConverter, 'aluminum_oxide')) {
      throw new Error('Failed to set ceramic aluminum recipe');
    }
    if (!engine.setProcessorRecipe(ironConverter, 'iron_oxide')) {
      throw new Error('Failed to set ceramic iron recipe');
    }
    if (!engine.setProcessorRecipe(synthesizer, 'ceramic_plates')) {
      throw new Error('Failed to set ceramic recipe');
    }

    return {
      extractors: [...aluminumExtractors, ...ironExtractors],
      converters: [aluminumConverter, ironConverter],
      synthesizer,
      storage,
      mergers: [...mergers, ...ironMergers],
    };
  };

  const poweredBuildings: BuildingId[] = [];
  const registerPowered = (...ids: readonly BuildingId[]) => {
    poweredBuildings.push(...ids);
  };

  const baseChains = [
    placeStorageChain('base-regolith', ResourceType.Regolith, -48),
    placeStorageChain('base-hydrogen', ResourceType.Hydrogen, -32),
    placeStorageChain('base-oxygen', ResourceType.Oxygen, -16),
  ];
  registerPowered(...baseChains.flatMap((chain) => chain.extractors));

  const converterChains = [
    placeConverterChain('iron-oxide', 'iron_oxide', ResourceType.Regolith, 1, 0),
    placeConverterChain('aluminum-oxide', 'aluminum_oxide', ResourceType.Regolith, 2, 16),
    placeConverterChain('silicon-dioxide', 'silicon_dioxide', ResourceType.Regolith, 4, 32),
    placeConverterChain('nitrogen-gas', 'nitrogen_gas', ResourceType.Oxygen, 3, 48),
  ];
  registerPowered(
    ...converterChains.flatMap((chain) => chain.extractors),
    ...converterChains.map((chain) => chain.converter),
  );

  const synthChains = [
    placeSynthChain(
      'water',
      'water',
      { resourceType: ResourceType.Hydrogen, count: 2, x: -12, centerDy: -44 },
      { resourceType: ResourceType.Oxygen, count: 1, x: -4, centerDy: -36 },
      -40,
    ),
    placeSynthChain(
      'methane',
      'methane',
      { resourceType: ResourceType.Hydrogen, count: 4, x: -12, centerDy: -24 },
      { resourceType: ResourceType.Oxygen, count: 1, x: -4, centerDy: -16 },
      -20,
    ),
    placeSynthChain(
      'carbon-dioxide',
      'carbon_dioxide',
      { resourceType: ResourceType.Hydrogen, count: 1, x: -12, centerDy: -4 },
      { resourceType: ResourceType.Oxygen, count: 1, x: -4, centerDy: 4 },
      0,
    ),
    placeSynthChain(
      'ammonia',
      'ammonia',
      { resourceType: ResourceType.Hydrogen, count: 3, x: -12, centerDy: 16 },
      { resourceType: ResourceType.Oxygen, count: 2, x: -4, centerDy: 24 },
      20,
    ),
  ];
  registerPowered(
    ...synthChains.flatMap((chain) => chain.extractors),
    ...synthChains.map((chain) => chain.synthesizer),
  );

  const ceramicChain = placeCeramicChain(40);
  registerPowered(...ceramicChain.extractors, ...ceramicChain.converters, ceramicChain.synthesizer);

  const solarIds = Array.from({ length: 40 }, (_, index) => {
    const column = index % 10;
    const row = Math.floor(index / 10);
    return mustPlaceBuilding(engine, SOLAR_PANEL_BUILDING_TYPE_ID, toWorld(-56 + column * 3, -72 + row * 3), 0, rng);
  });
  const hubSolar = solarIds[0];
  if (!hubSolar) {
    throw new Error('Missing solar hub');
  }
  for (const solarId of solarIds.slice(1)) {
    mustConnect(engine, hubSolar, solarId);
  }
  for (const buildingId of poweredBuildings) {
    mustConnect(engine, hubSolar, buildingId);
  }

  const decorativeDeposits: readonly [number, number, ResourceType][] = [
    [-34, -28, ResourceType.Regolith],
    [-18, -12, ResourceType.Hydrogen],
    [0, -4, ResourceType.Oxygen],
    [16, 10, ResourceType.Regolith],
    [30, 22, ResourceType.Hydrogen],
    [8, 34, ResourceType.Oxygen],
  ];
  const depositTiles = decorativeDeposits.map(([dx, dy, type]) => {
    const coord = toWorld(dx, dy);
    engine.placeResource(coord.x, coord.y, type);
    return coord;
  });

  engine.setSimulationTime(0.5);
  advanceSimulation(engine, 24, 0.2);

  const viewport = makeViewport(engine, { x: baseAnchor.x - 10, y: baseAnchor.y - 4 }, 0.18);

  if (countRevealedUncoveredDeposits(engine, depositTiles) < 4) {
    throw new Error('Generated Build All scenario did not preserve enough revealed deposits');
  }

  return {
    engine,
    selectedTool: { kind: 'select' },
    viewport,
  };
}
