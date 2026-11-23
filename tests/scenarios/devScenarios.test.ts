import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameEngine } from '@/game/engine/GameEngine';
import {
  clearPendingScenarioInstall,
  createDevScenarioApi,
  hasPendingScenarioInstall,
} from '@/game/scenarios/devScenarios';
import { IDLE_SIDECAR_KEY, clearPersistedSession, loadPersistedSession, writeIdleSidecar } from '@/game/persistence/sessionStorage';
import { ResourceType, TileType } from '@/game/types';

describe('dev scenario api', () => {
  beforeEach(() => {
    clearPersistedSession();
    window.localStorage.clear();
    clearPendingScenarioInstall();
    vi.restoreAllMocks();
  });

  it('lists the available named scenarios', () => {
    const engine = new GameEngine(640, 480);
    const api = createDevScenarioApi(engine);

    expect(api.list()).toEqual([
      {
        id: 'bootstrap-energy-grid',
        label: 'Bootstrap Energy Grid',
      },
    ]);
  });

  it('lists the available scenario generators', () => {
    const engine = new GameEngine(640, 480);
    const api = createDevScenarioApi(engine);

    expect(api.listGenerators()).toEqual([
      {
        id: 'tier-simple',
        label: 'Simple',
        description: 'Starter layout: 4 solar + 1 battery + 3 extractors + 3 storages. Single energy subnet with belts.',
      },
      {
        id: 'tier-medium',
        label: 'Moyen',
        description: 'Mid-complexity: storage, belts, 2 resource types, branched energy network.',
      },
      {
        id: 'tier-complex',
        label: 'Complexe',
        description: 'Full complexity: 2 subnets, mergers, watchtower, all 3 resource types.',
      },
      {
        id: 'tier-build-all',
        label: 'Tout construire',
        description: 'Complete pipeline: all 4 converters + all 5 synthesizers. All 12 resource types produced.',
      },
    ]);
  });

  it('installs a scenario into persisted storage and clears stale idle state', () => {
    const engine = new GameEngine(640, 480);
    engine.grid.fill(TileType.Ground);
    const api = createDevScenarioApi(engine);
    writeIdleSidecar('stale-session', 123_456);

    api.install('bootstrap-energy-grid');

    const loaded = loadPersistedSession(640, 480);
    expect(loaded).not.toBeNull();
    expect(loaded?.selectedTool).toEqual({ kind: 'building', buildingType: 'solar_panel' });
    expect(loaded?.engine.getResourceCounts()).toEqual({
      regolith: 6,
      hydrogen: 6,
      oxygen: 0,
      ironOxide: 0, aluminumOxide: 0, siliconDioxide: 0, nitrogenGas: 0,
      water: 0, methane: 0, carbonDioxide: 0, ammonia: 0, ceramicPlates: 0, carbon: 0,
    });
    expect(loaded?.engine.getViewportSnapshot()).toEqual({
      centerX: 384,
      centerY: 288,
      zoom: 1.6,
    });
    expect(window.localStorage.getItem(IDLE_SIDECAR_KEY)).toBeNull();
  });

  it('marks a pending scenario install so remount handlers can avoid overwriting it', () => {
    const engine = new GameEngine(640, 480);
    const api = createDevScenarioApi(engine);
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    expect(hasPendingScenarioInstall()).toBe(false);

    api.install('bootstrap-energy-grid');

    expect(hasPendingScenarioInstall()).toBe(true);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[scenarios] Installed "bootstrap-energy-grid" and applied it to the live session.',
    );
  });

  it('generates a functional starter scenario through the dev api', () => {
    const engine = new GameEngine(640, 480);
    const api = createDevScenarioApi(engine);
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    api.generate();

    const loaded = loadPersistedSession(640, 480);
    expect(loaded).not.toBeNull();
    expect(loaded?.selectedTool).toEqual({ kind: 'select' });
    expect(loaded?.engine.getBuildings().size).toBeGreaterThanOrEqual(9);
    expect(loaded?.engine.getResourceCounts().regolith ?? 0).toBeGreaterThan(0);
    expect(loaded?.engine.getResourceCounts().hydrogen ?? 0).toBeGreaterThan(0);

    let visibleUncoveredDeposits = 0;
    const visible = loaded!.engine.getVisibleTiles();
    for (let y = visible.y0; y <= visible.y1; y++) {
      for (let x = visible.x0; x <= visible.x1; x++) {
        if (loaded!.engine.getResourceAt(x, y) === ResourceType.None) continue;
        if (loaded!.engine.getBuildingAt(x, y) !== null) continue;
        visibleUncoveredDeposits += 1;
      }
    }

    expect(visibleUncoveredDeposits).toBeGreaterThanOrEqual(3);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[scenarios] Generated "tier-simple" and applied it to the live session.',
    );
  });
});
