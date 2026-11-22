import { describe, expect, it, vi } from 'vitest';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_MK2_BUILDING_TYPE_ID,
  EXTRACTOR_MK2_RATE_PER_MIN,
  EXTRACTOR_RATE_PER_MIN,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
} from '@/game/data/buildingCatalog';
import { toIndex } from '@/game/data/coords';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { InputHandler } from '@/game/engine/InputHandler';
import { gridToWorld, worldToScreen } from '@/game/engine/CoordinateTransform';
import { TILE_SIZE } from '@/game/constants';
import { Direction, ResourceType, TileType } from '@/game/types';

/** An extractor of `typeId` on a deposit, two panels, belted to a storage; built in sandbox, loaded in `gameMode`. */
function line(typeId: string, gameMode: GameMode = GameMode.Sandbox, amount = 1500) {
  const sandbox = new GameEngine(800, 600, { dayNightCycleSeconds: 1e9 });
  sandbox.grid.fill(TileType.Ground);
  sandbox.grid.revealAll();
  sandbox.setSimulationTime(0.5);
  sandbox.placeResource(4, 10, ResourceType.Regolith);
  sandbox.grid.resourceAmount[toIndex(4, 10)] = amount;
  const extractor = sandbox.placeBuilding(typeId, { x: 4, y: 10 })!;
  for (const x of [1, 2]) sandbox.connectBuildings(sandbox.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x, y: 7 })!, extractor);
  const storage = sandbox.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 10, y: 9 })!;
  sandbox.placeBelt({ building: extractor, port: 'out_east' }, { building: storage, port: 'in_west' });
  const engine = gameMode === GameMode.Sandbox ? sandbox : GameEngine.fromSnapshot({ ...sandbox.serializeWorld(), gameMode }, 800, 600);
  return { engine, extractor, storage };
}

function simulate(engine: GameEngine, seconds: number): void {
  for (let t = 0; t < seconds; t += 0.1) engine.update(0.1);
}

describe('extractor mk2', () => {
  it('extracts twice as fast as the basic extractor', () => {
    const basic = line(EXTRACTOR_BUILDING_TYPE_ID);
    const mk2 = line(EXTRACTOR_MK2_BUILDING_TYPE_ID);

    simulate(basic.engine, 60);
    simulate(mk2.engine, 60);

    expect(basic.engine.getStorageInventory(basic.storage)!.regolith).toBeCloseTo(EXTRACTOR_RATE_PER_MIN, -1);
    expect(mk2.engine.getStorageInventory(mk2.storage)!.regolith).toBeCloseTo(EXTRACTOR_MK2_RATE_PER_MIN, -1);
    expect(mk2.engine.getResourceRates().regolith).toBe(EXTRACTOR_MK2_RATE_PER_MIN);
  });

  it('drains its deposit at its own rate in campaign', () => {
    const { engine, extractor } = line(EXTRACTOR_MK2_BUILDING_TYPE_ID, GameMode.Campaign);

    simulate(engine, 30);

    expect(1500 - engine.getDepositRemaining(extractor)!).toBeCloseTo(EXTRACTOR_MK2_RATE_PER_MIN / 2, -1);
  });

  it('upgrades an extractor in place: same id, belt and power links, new rate and demand', () => {
    const { engine, extractor, storage } = line(EXTRACTOR_BUILDING_TYPE_ID);
    const connections = engine.getConnectionsOf(extractor).length;

    expect(engine.upgradeBuilding(extractor, EXTRACTOR_MK2_BUILDING_TYPE_ID)).toBe(true);

    expect(engine.getBuildings().get(extractor)?.typeId).toBe(EXTRACTOR_MK2_BUILDING_TYPE_ID);
    expect(engine.getConnectionsOf(extractor)).toHaveLength(connections);
    expect(engine.getEnergyNetworkForBuilding(extractor)?.consumption).toBe(8);
    simulate(engine, 60);
    expect(engine.getStorageInventory(storage)!.regolith).toBeCloseTo(EXTRACTOR_MK2_RATE_PER_MIN, -1);
  });

  it('refuses an upgrade it does not allow, or a locked one in campaign', () => {
    const sandbox = line(EXTRACTOR_BUILDING_TYPE_ID);
    expect(sandbox.engine.quoteBuildingUpgrade(sandbox.storage, EXTRACTOR_MK2_BUILDING_TYPE_ID)).toEqual({ ok: false, reason: 'not_upgradable' });

    const campaign = line(EXTRACTOR_BUILDING_TYPE_ID, GameMode.Campaign);
    expect(campaign.engine.quoteBuildingUpgrade(campaign.extractor, EXTRACTOR_MK2_BUILDING_TYPE_ID)).toEqual({ ok: false, reason: 'locked' });
  });

  it('charges the difference in campaign', () => {
    const { engine, extractor, storage } = line(EXTRACTOR_BUILDING_TYPE_ID, GameMode.Campaign);
    vi.spyOn(engine, 'isBuildingUnlocked').mockReturnValue(true);
    const stock = engine.storageInventories.get(storage)!;
    stock.regolith = 10;
    stock.ironOxide = 10;

    expect(engine.quoteBuildingUpgrade(extractor, EXTRACTOR_MK2_BUILDING_TYPE_ID)).toMatchObject({
      ok: true,
      net: [
        { resourceType: ResourceType.Regolith, amount: 10 },
        { resourceType: ResourceType.IronOxide, amount: 10 },
      ],
    });
    expect(engine.upgradeBuilding(extractor, EXTRACTOR_MK2_BUILDING_TYPE_ID)).toBe(true);
    expect(stock).toMatchObject({ regolith: 0, ironOxide: 0 });
  });

  it('keeps each tier on its cadence through a save', () => {
    const { engine } = line(EXTRACTOR_MK2_BUILDING_TYPE_ID);
    engine.placeResource(4, 14, ResourceType.Oxygen);
    simulate(engine, 3.7);

    const restored = GameEngine.fromSnapshot(engine.serializeWorld(), 800, 600);
    simulate(engine, 20);
    simulate(restored, 20);

    expect(restored.serializeWorld()).toEqual(engine.serializeWorld());
  });

  it('upgrades on click with the mk2 tool selected', () => {
    const { engine, extractor } = line(EXTRACTOR_BUILDING_TYPE_ID);
    const handler = new InputHandler(engine, () => ({ kind: 'building', buildingType: EXTRACTOR_MK2_BUILDING_TYPE_ID }), () => Direction.North);
    const { wx, wy } = gridToWorld(4, 10);
    const { sx, sy } = worldToScreen(engine.viewport, wx + TILE_SIZE / 2, wy + TILE_SIZE / 2);

    handler.onPointerDown(sx, sy, 0);

    expect(engine.getBuildings().get(extractor)?.typeId).toBe(EXTRACTOR_MK2_BUILDING_TYPE_ID);
  });
});
