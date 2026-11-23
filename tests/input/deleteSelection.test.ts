import { beforeEach, describe, expect, it } from 'vitest';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { deleteSelectedBuilding } from '@/game/input/deleteSelection';
import { ResourceType, TileType } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

function makeEngine(): GameEngine {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  return engine;
}

describe('deleteSelectedBuilding', () => {
  beforeEach(() => {
    useGameStore.setState({
      engine: null,
      selectedTool: { kind: 'select' },
      selectedBuildingId: null,
      selectedBuildingAnchor: null,
      pendingEnergyLinkSource: null,
    });
  });

  it('removes the selected building and clears the selection', () => {
    const engine = makeEngine();
    const id = engine.placeBuilding('solar_panel', { x: 4, y: 4 })!;
    useGameStore.setState({ engine, selectedBuildingId: id, selectedBuildingAnchor: { x: 10, y: 10 } });

    expect(deleteSelectedBuilding(useGameStore)).toBe(true);

    expect(engine.getBuildings().has(id)).toBe(false);
    expect(useGameStore.getState().selectedBuildingId).toBeNull();
    expect(useGameStore.getState().selectedBuildingAnchor).toBeNull();
  });

  it('removes the whole belt when the selection is one of its pieces', () => {
    const engine = makeEngine();
    engine.grid.setResource(2, 2, ResourceType.Hydrogen);
    const extractor = engine.placeBuilding('extractor_basic', { x: 2, y: 2 })!;
    const storage = engine.placeBuilding('storage_basic', { x: 8, y: 1 })!;
    const belt = engine.placeBelt({ building: extractor, port: 'out_east' }, { building: storage, port: 'in_west' });
    expect(belt.ok).toBe(true);
    if (!belt.ok) return;
    const piece = belt.segmentIds[1]!;
    useGameStore.setState({ engine, selectedBuildingId: piece, selectedBuildingAnchor: { x: 10, y: 10 } });

    expect(deleteSelectedBuilding(useGameStore)).toBe(true);

    for (const segmentId of belt.segmentIds) expect(engine.getBuildings().has(segmentId)).toBe(false);
    expect(engine.getBuildings().has(extractor)).toBe(true);
    expect(useGameStore.getState().selectedBuildingId).toBeNull();
  });

  it('forgets a pending power link that started from the removed building', () => {
    const engine = makeEngine();
    const id = engine.placeBuilding('solar_panel', { x: 4, y: 4 })!;
    useGameStore.setState({ engine, selectedBuildingId: id, pendingEnergyLinkSource: id });

    deleteSelectedBuilding(useGameStore);

    expect(useGameStore.getState().pendingEnergyLinkSource).toBeNull();
  });

  it('leaves a permanent building and its selection alone', () => {
    const engine = new GameEngine(640, 480, { gameMode: GameMode.Campaign });
    engine.generateMap(42);
    const hubId = engine.getHubId()!;
    useGameStore.setState({ engine, selectedBuildingId: hubId, selectedBuildingAnchor: { x: 10, y: 10 } });

    expect(deleteSelectedBuilding(useGameStore)).toBe(false);

    expect(engine.getBuildings().has(hubId)).toBe(true);
    expect(useGameStore.getState().selectedBuildingId).toBe(hubId);
  });

  it('does nothing without a selection', () => {
    const engine = makeEngine();
    useGameStore.setState({ engine });
    const count = engine.getBuildings().size;

    expect(deleteSelectedBuilding(useGameStore)).toBe(false);
    expect(engine.getBuildings().size).toBe(count);
  });
});
