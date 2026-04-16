import { describe, expect, it } from 'vitest';
import {
  applyIdleCatchup,
  computeElapsedMs,
  runExactCatchup,
} from '@/game/idle/IdleCatchup';
import { GameEngine } from '@/game/engine/GameEngine';
import { ResourceType, TileType } from '@/game/types';

function makePoweredExtractorEngine(): GameEngine {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  engine.setSimulationTime(0.5);
  engine.grid.setResource(5, 5, ResourceType.Regolith);
  const solarId = engine.placeBuilding('solar_panel', { x: 4, y: 5 });
  const extractorId = engine.placeBuilding('extractor_basic', { x: 5, y: 5 });
  const storageId = engine.placeBuilding('storage_basic', { x: 9, y: 4 });
  if (solarId !== null && extractorId !== null) {
    engine.connectBuildings(solarId, extractorId);
  }
  if (extractorId !== null && storageId !== null) {
    engine.placeBelt(
      { building: extractorId, port: 'out_east' },
      { building: storageId, port: 'in_west' },
    );
  }
  return engine;
}

describe('IdleCatchup', () => {
  it('computes elapsed time with clamp and invalid timestamps', () => {
    expect(computeElapsedMs(10_000, 1_000, 8_000)).toEqual({ elapsedMs: 8_000, capped: true });
    expect(computeElapsedMs(1_000, 10_000, 8_000)).toEqual({ elapsedMs: 0, capped: false });
    expect(computeElapsedMs(1_000, null, 8_000)).toEqual({ elapsedMs: 0, capped: false });
  });

  it('replays exact catchup and matches same-step active simulation', () => {
    const idleEngine = makePoweredExtractorEngine();
    const activeEngine = GameEngine.fromSnapshot(idleEngine.serializeWorld(), 640, 480);

    const idleResult = applyIdleCatchup(idleEngine, 3_600_000);

    for (let i = 0; i < 3600; i++) {
      activeEngine.update(1);
    }

    expect(idleResult.appliedSeconds).toBe(3600);
    expect(idleEngine.simulationTime).toBeCloseTo(activeEngine.simulationTime, 8);
    expect(idleEngine.getResourceCounts()).toEqual(activeEngine.getResourceCounts());
    expect(idleResult.resourceDelta.regolith).toBeGreaterThan(0);
  });

  it('caps catchup to 8h', () => {
    const engine = makePoweredExtractorEngine();

    const result = applyIdleCatchup(engine, 12 * 60 * 60 * 1000);

    expect(result.capped).toBe(true);
    expect(result.appliedSeconds).toBe(8 * 60 * 60);
  });

  it('returns zero applied seconds for non-positive or invalid elapsed', () => {
    const engine = makePoweredExtractorEngine();
    expect(applyIdleCatchup(engine, 0).appliedSeconds).toBe(0);
    expect(applyIdleCatchup(engine, -500).appliedSeconds).toBe(0);
    expect(applyIdleCatchup(engine, Number.NaN).appliedSeconds).toBe(0);
  });

  it('does not replay time that was already live-simulated', () => {
    const idleEngine = makePoweredExtractorEngine();
    const referenceEngine = GameEngine.fromSnapshot(idleEngine.serializeWorld(), 640, 480);

    // Live-simulate 5s on the idle engine.
    for (let i = 0; i < 5; i++) {
      idleEngine.update(1);
    }

    // Catchup should only replay the *remaining* 60s, not 65s.
    applyIdleCatchup(idleEngine, 60 * 1000);

    // Reference advances a full 65s in one active stream.
    for (let i = 0; i < 65; i++) {
      referenceEngine.update(1);
    }

    expect(idleEngine.getResourceCounts()).toEqual(referenceEngine.getResourceCounts());
  });

  it('emits a single world notification during a catchup batch', () => {
    const engine = makePoweredExtractorEngine();
    let worldNotifications = 0;
    engine.subscribe((kind) => {
      if (kind === 'world') worldNotifications += 1;
    });

    runExactCatchup(engine, 120, 1);

    expect(worldNotifications).toBe(1);
  });
});
