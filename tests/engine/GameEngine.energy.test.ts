import { beforeEach, describe, expect, it } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';

function groundEverywhere(engine: GameEngine) {
  engine.grid.fill(TileType.Ground);
}

describe('GameEngine energy networks', () => {
  let engine: GameEngine;

  beforeEach(() => {
    engine = new GameEngine(800, 600);
    groundEverywhere(engine);
  });

  it('computes production, consumption and remaining for a linked network', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.placeResource(2, 1, ResourceType.IronOre);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;

    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);

    const network = engine.getEnergyNetworkForBuilding(extractorId);
    expect(network).toEqual({
      buildingIds: [solarId, extractorId].sort((a, b) => a - b),
      production: 8,
      consumption: 5,
      remaining: 3,
    });
  });

  it('merges networks when linking through an existing connected building', () => {
    const solarA = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.placeResource(2, 1, ResourceType.IronOre);
    const extractor = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;
    const solarB = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 3, y: 1 })!;

    engine.connectBuildings(solarA, extractor);
    engine.connectBuildings(solarB, solarA);

    const network = engine.getEnergyNetworkForBuilding(solarB)!;
    expect(network.buildingIds).toEqual([solarA, extractor, solarB].sort((a, b) => a - b));
    expect(network.production).toBe(16);
    expect(network.consumption).toBe(5);
    expect(network.remaining).toBe(11);
  });

  it('tracks isolated buildings as separate one-node networks', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 5, y: 5 })!;
    engine.placeResource(7, 5, ResourceType.IronOre);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 7, y: 5 })!;

    const networks = engine.getEnergyNetworkBalances();
    expect(networks).toHaveLength(2);

    const solarNetwork = networks.find((network) => network.buildingIds.includes(solarId));
    const extractorNetwork = networks.find((network) => network.buildingIds.includes(extractorId));

    expect(solarNetwork).toMatchObject({ production: 8, consumption: 0, remaining: 8 });
    expect(extractorNetwork).toMatchObject({ production: 0, consumption: 5, remaining: -5 });
  });

  it('drops links and recalculates balance when a building is removed', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.placeResource(11, 10, ResourceType.IronOre);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 11, y: 10 })!;
    engine.connectBuildings(solarId, extractorId);

    expect(engine.removeBuilding(solarId)).toBe(true);

    const network = engine.getEnergyNetworkForBuilding(extractorId)!;
    expect(network).toMatchObject({ production: 0, consumption: 5, remaining: -5 });
  });

  it('computes power states (neutral, powered, unpowered)', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.placeResource(2, 1, ResourceType.IronOre);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;

    expect(engine.getBuildingPowerState(solarId)).toBe('neutral');
    expect(engine.getBuildingPowerState(extractorId)).toBe('unpowered');

    engine.connectBuildings(solarId, extractorId);
    expect(engine.getBuildingPowerState(extractorId)).toBe('powered');

    expect(engine.removeBuilding(solarId)).toBe(true);
    expect(engine.getBuildingPowerState(extractorId)).toBe('unpowered');
  });

  it('aggregates global energy stats with online/offline consumers', () => {
    const solarA = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 10, y: 10 })!;
    engine.placeResource(11, 10, ResourceType.IronOre);
    const extractorA = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 11, y: 10 })!;
    engine.connectBuildings(solarA, extractorA);

    engine.placeResource(20, 20, ResourceType.IronOre);
    const extractorB = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 20, y: 20 })!;

    const stats = engine.getEnergyGlobalStats();
    expect(stats).toEqual({
      production: 8,
      consumption: 5,
      remaining: -2,
      onlineConsumers: 1,
      offlineConsumers: 1,
    });
    expect(engine.getBuildingPowerState(extractorA)).toBe('powered');
    expect(engine.getBuildingPowerState(extractorB)).toBe('unpowered');
  });

  it('can disconnect an existing energy link', () => {
    const solarId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 1, y: 1 })!;
    engine.placeResource(2, 1, ResourceType.IronOre);
    const extractorId = engine.placeBuilding(EXTRACTOR_BUILDING_TYPE_ID, { x: 2, y: 1 })!;

    expect(engine.connectBuildings(solarId, extractorId)).toBe(true);
    expect(engine.areBuildingsEnergyLinked(solarId, extractorId)).toBe(true);
    expect(engine.disconnectBuildings(solarId, extractorId)).toBe(true);
    expect(engine.areBuildingsEnergyLinked(solarId, extractorId)).toBe(false);

    const solarNetwork = engine.getEnergyNetworkForBuilding(solarId)!;
    const extractorNetwork = engine.getEnergyNetworkForBuilding(extractorId)!;
    expect(solarNetwork).toMatchObject({ production: 8, consumption: 0, remaining: 8 });
    expect(extractorNetwork).toMatchObject({ production: 0, consumption: 5, remaining: -5 });
  });
});
