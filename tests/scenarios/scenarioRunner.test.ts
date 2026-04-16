import { describe, expect, it } from 'vitest';
import { getScenarioDefinition } from '@/game/scenarios/catalog';
import { runScenario } from '@/game/scenarios/runScenario';

describe('scenario runner', () => {
  it('builds the bootstrap scenario deterministically', () => {
    const result = runScenario(getScenarioDefinition('bootstrap-energy-grid'), 640, 480);

    expect(result.engine.getBuildings().size).toBe(6);
    expect(result.engine.getResourceCounts()).toEqual({
      coal: 6,
      ironOre: 6,
      copperOre: 0,
    });
    expect(result.selectedTool).toEqual({ kind: 'building', buildingType: 'solar_panel' });
    expect(result.viewport).toEqual({
      centerX: 384,
      centerY: 288,
      zoom: 1.6,
    });
  });

  it('rejects unknown scenario ids with a clear error', () => {
    expect(() => getScenarioDefinition('missing-scenario')).toThrow('Unknown scenario: missing-scenario');
  });
});
