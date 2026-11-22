import { describe, expect, it, vi } from 'vitest';
import { EXTRACTOR_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { resolveDownstreamTerminalFromOutput } from '@/game/flow/processorLogistics';
import { generateSimpleScenario } from '@/game/scenarios/generators/generateSimpleScenario';
import { generateBuildAllScenario } from '@/game/scenarios/generators/generateBuildAllScenario';
import { generateComplexScenario } from '@/game/scenarios/generators/generateComplexScenario';
import { generateMediumScenario } from '@/game/scenarios/generators/generateMediumScenario';

describe.each([
  { name: 'medium', generate: generateMediumScenario, extractors: 4 },
  { name: 'complex', generate: generateComplexScenario, extractors: 6 },
])('$name scenario production', ({ generate, extractors }) => {
  it.each([[640, 480], [240, 180]])('connects every producer at %i × %i across mirrored layouts', (width, height) => {
    const seedSpy = vi.spyOn(globalThis.crypto, 'getRandomValues');
    try {
      for (let seed = 1; seed <= 16; seed++) {
        seedSpy.mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
          (array as unknown as Uint32Array)[0] = seed;
          return array;
        });
        const { engine } = generate(width, height);
        const producers = [...engine.getBuildings().values()].filter((building) => building.typeId === EXTRACTOR_BUILDING_TYPE_ID);
        expect(producers).toHaveLength(extractors);
        for (const producer of producers) {
          const terminal = resolveDownstreamTerminalFromOutput(engine, producer.id, 'out_east');
          expect(terminal?.kind, `seed ${seed}, extractor ${producer.id}`).toBe('storage');
        }
      }
    } finally {
      seedSpy.mockRestore();
    }
  });
});

describe.each([
  { name: 'simple', generate: generateSimpleScenario, seed: 8, width: 375, height: 667 },
  { name: 'build all', generate: generateBuildAllScenario, seed: 1, width: 240, height: 180 },
])('$name scenario', ({ generate, seed, width, height }) => {
  it('keeps the same playable layout when deposits lie outside a small viewport', () => {
    const seedSpy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(
      <T extends ArrayBufferView | null>(array: T): T => {
        (array as unknown as Uint32Array)[0] = seed;
        return array;
      },
    );
    try {
      const large = generate(1280, 720).engine;
      const small = generate(width, height).engine;
      expect(small.getBuildings()).toEqual(large.getBuildings());
      expect(small.getResourceCounts()).toEqual(large.getResourceCounts());
    } finally {
      seedSpy.mockRestore();
    }
  });
});
