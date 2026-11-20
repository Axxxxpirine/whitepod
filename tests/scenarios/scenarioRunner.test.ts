import { describe, expect, it } from 'vitest';
import { getScenarioDefinition } from '@/game/scenarios/catalog';
import { runScenario } from '@/game/scenarios/runScenario';

describe('scenario runner', () => {
  it('builds the bootstrap scenario deterministically', () => {
    const result = runScenario(getScenarioDefinition('bootstrap-energy-grid'), 640, 480);

    expect(result.engine.getBuildings().size).toBeGreaterThan(6);
    expect(result.engine.getResourceCounts()).toEqual({
      regolith: 6,
      hydrogen: 6,
      oxygen: 0,
      ironOxide: 0, aluminumOxide: 0, siliconDioxide: 0, nitrogenGas: 0,
      water: 0, methane: 0, carbonDioxide: 0, ammonia: 0, ceramicPlates: 0,
    });
    expect(result.selectedTool).toEqual({ kind: 'building', buildingType: 'solar_panel' });
    expect(result.viewport).toEqual({
      centerX: 96,
      centerY: 320,
      zoom: 1.6,
    });
  });

  it('rejects unknown scenario ids with a clear error', () => {
    expect(() => getScenarioDefinition('missing-scenario')).toThrow('Unknown scenario: missing-scenario');
  });
});
