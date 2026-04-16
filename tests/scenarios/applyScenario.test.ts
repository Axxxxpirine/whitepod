import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import { applyScenarioGeneratorToLiveSession, applyScenarioToLiveSession } from '@/game/scenarios/applyScenario';
import { clearPendingScenarioInstall, hasPendingScenarioInstall } from '@/game/scenarios/devScenarios';
import { loadPersistedSession, clearPersistedSession } from '@/game/persistence/sessionStorage';
import { Direction, ResourceType, TileType } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

describe('applyScenarioToLiveSession', () => {
  beforeEach(() => {
    clearPersistedSession();
    clearPendingScenarioInstall();
    window.localStorage.clear();
    useGameStore.setState({
      engine: null,
      simulationTime: 0,
      simulationSpeed: 1,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      hoverTile: { x: 3, y: 4 },
      selectedTool: { kind: 'belt' },
      selectedBuildingId: 42,
      selectedBuildingAnchor: { x: 10, y: 20 },
      beltPreview: { kind: 'belt', isValid: true, tiles: [] },
      currentBuildingRotation: Direction.South,
      sessionEpoch: 0,
      worldVersion: 0,
      pendingEnergyLinkSource: 42,
      linkSolarOnPlacement: true,
      idleSummary: {
        appliedSeconds: 60,
        resourceDelta: {
          regolith: 1, hydrogen: 2, oxygen: 3,
          ironOxide: 0, aluminumOxide: 0, siliconDioxide: 0, nitrogenGas: 0,
          water: 0, methane: 0, carbonDioxide: 0, ammonia: 0, ceramicPlates: 0,
        },
        capped: false,
      },
    });
    vi.restoreAllMocks();
  });

  it('persists and activates the selected scenario immediately', () => {
    const engine = new GameEngine(640, 480);
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    applyScenarioToLiveSession(engine, 'bootstrap-energy-grid');

    const state = useGameStore.getState();
    expect(state.engine?.getBuildings().size).toBe(6);
    expect(state.selectedTool).toEqual({ kind: 'building', buildingType: 'solar_panel' });
    expect(state.simulationTime).toBeCloseTo(0.6);
    expect(state.sessionEpoch).toBe(1);
    expect(state.hoverTile).toBeNull();
    expect(state.selectedBuildingId).toBeNull();
    expect(state.selectedBuildingAnchor).toBeNull();
    expect(state.beltPreview).toBeNull();
    expect(state.pendingEnergyLinkSource).toBeNull();
    expect(state.idleSummary).toBeNull();
    expect(hasPendingScenarioInstall()).toBe(true);
    expect(infoSpy).toHaveBeenCalledWith(
      '[scenarios] Installed "bootstrap-energy-grid" and applied it to the live session.',
    );

    const loaded = loadPersistedSession(640, 480);
    expect(loaded?.engine.getBuildings().size).toBe(6);
    expect(loaded?.selectedTool).toEqual({ kind: 'building', buildingType: 'solar_panel' });
  });

  it('generates and persists a playable starter scenario immediately', () => {
    const engine = new GameEngine(640, 480);
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    applyScenarioGeneratorToLiveSession(engine, 'tier-simple');

    const state = useGameStore.getState();
    expect(state.engine?.getBuildings().size).toBe(8);
    expect(state.selectedTool).toEqual({ kind: 'select' });
    expect(state.simulationTime).toBeGreaterThan(0);
    expect(state.pendingEnergyLinkSource).toBeNull();
    expect(state.idleSummary).toBeNull();
    expect(hasPendingScenarioInstall()).toBe(true);
    expect(infoSpy).toHaveBeenCalledWith('[scenarios] Generated "tier-simple" and applied it to the live session.');

    let visibleUncoveredDeposits = 0;
    const visible = state.engine!.getVisibleTiles();
    for (let y = visible.y0; y <= visible.y1; y++) {
      for (let x = visible.x0; x <= visible.x1; x++) {
        if (state.engine!.getResourceAt(x, y) === ResourceType.None) continue;
        if (state.engine!.getBuildingAt(x, y) !== null) continue;
        visibleUncoveredDeposits += 1;
      }
    }

    expect(visibleUncoveredDeposits).toBeGreaterThanOrEqual(3);
    expect(state.engine?.getResourceCounts().regolith ?? 0).toBeGreaterThan(0);
    expect(state.engine?.getResourceCounts().hydrogen ?? 0).toBeGreaterThan(0);

    const loaded = loadPersistedSession(640, 480);
    expect(loaded?.engine.getBuildings().size).toBeGreaterThanOrEqual(8);
    expect(loaded?.selectedTool).toEqual({ kind: 'select' });
  });
});
