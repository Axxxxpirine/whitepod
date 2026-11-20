import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { gridToWorld } from '@/game/engine/CoordinateTransform';
import { ResourceType, TileType } from '@/game/types';
import type { ScenarioDefinition, ScenarioListEntry } from './types';
import { tryBelt } from './generatorUtils';

// Camera target between the solar/battery chain and the storage (logical tile space).
const BOOTSTRAP_VIEW_CENTER = gridToWorld(11.5, 8.5);

const bootstrapEnergyScenario: ScenarioDefinition = {
  id: 'bootstrap-energy-grid',
  label: 'Bootstrap Energy Grid',
  build(engine) {
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    engine.setSimulationTime(0.5);

    engine.placeResource(8, 8, ResourceType.Regolith);
    engine.placeResource(12, 8, ResourceType.Hydrogen);

    const solarWest = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 6, y: 8 });
    const battery = engine.placeBuilding(BATTERY_BASIC_BUILDING_TYPE_ID, { x: 9, y: 10 });
    const solarEast = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 12, y: 10 });
    const regolithExtractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 8, y: 8 });
    const ironExtractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 12, y: 8 });
    const storage = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 15, y: 7 });

    if (
      solarWest === null ||
      battery === null ||
      solarEast === null ||
      regolithExtractor === null ||
      ironExtractor === null ||
      storage === null
    ) {
      throw new Error('Failed to build bootstrap-energy-grid scenario');
    }

    if (
      !engine.connectBuildings(solarWest, battery) ||
      !engine.connectBuildings(battery, solarEast) ||
      !engine.connectBuildings(battery, regolithExtractor) ||
      !engine.connectBuildings(solarEast, ironExtractor)
    ) {
      throw new Error('Failed to wire energy links in bootstrap-energy-grid scenario');
    }

    if (
      !tryBelt(engine, { building: regolithExtractor, port: 'out_east' }, { building: storage, port: 'in_west' }) ||
      !tryBelt(engine, { building: ironExtractor, port: 'out_east' }, { building: storage, port: 'in_north' })
    ) {
      throw new Error('Failed to route bootstrap-energy-grid belts');
    }
  },
  simulate: {
    totalSeconds: 12,
    stepSeconds: 0.2,
  },
  view: {
    selectedTool: { kind: 'building', buildingType: SOLAR_PANEL_BUILDING_TYPE_ID },
    viewport: {
      centerX: BOOTSTRAP_VIEW_CENTER.wx,
      centerY: BOOTSTRAP_VIEW_CENTER.wy,
      zoom: 1.6,
    },
  },
};

const scenarios = [bootstrapEnergyScenario] as const;

export function listScenarios(): ScenarioListEntry[] {
  return scenarios.map(({ id, label }) => ({ id, label }));
}

export function getScenarioDefinition(id: string): ScenarioDefinition {
  const scenario = scenarios.find((entry) => entry.id === id);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${id}`);
  }
  return scenario;
}
