import { expect, it } from 'vitest';
import { ConnectorBot } from '@/game/bot/ConnectorBot';
import { MasterBot } from '@/game/bot/MasterBot';
import { GameEngine } from '@/game/engine/GameEngine';
import { resolveDownstreamTerminalFromOutput } from '@/game/flow/processorLogistics';
import { ResourceType, TileType } from '@/game/types';

function makeWorld() {
  const engine = new GameEngine(640, 480);
  engine.grid.fill(TileType.Ground);
  engine.grid.revealAll();
  return engine;
}

it.each(['converter_basic', 'synthesizer_basic'])('connects the output of %s to storage', (typeId) => {
  const engine = makeWorld();
  const id = engine.placeBuilding(typeId, { x: 120, y: 125 })!;
  const storage = engine.placeBuilding('storage_basic', { x: 130, y: 125 })!;
  const bot = new ConnectorBot(engine, () => {});
  bot.start();
  bot.stop();
  expect(resolveDownstreamTerminalFromOutput(engine, id, 'out')?.buildingId).toBe(storage);
});

it('configures the first viable recipe using the converter’s own supply line', () => {
  const engine = makeWorld();
  engine.placeResource(98, 95, ResourceType.Oxygen);
  engine.placeBuilding('extractor_basic', { x: 98, y: 95 });
  engine.placeResource(115, 125, ResourceType.Regolith);
  const extractor = engine.placeBuilding('extractor_basic', { x: 115, y: 125 })!;
  const converter = engine.placeBuilding('converter_basic', { x: 120, y: 124 })!;
  const storage = engine.placeBuilding('storage_basic', { x: 130, y: 124 })!;
  const unconnected = engine.placeBuilding('converter_basic', { x: 135, y: 135 })!;
  expect(engine.placeBelt({ building: extractor, port: 'out_east' }, { building: converter, port: 'in' }).ok).toBe(true);
  expect(engine.placeBelt({ building: converter, port: 'out' }, { building: storage, port: 'in_west' }).ok).toBe(true);
  const bot = new MasterBot(engine, () => {});
  bot.start();
  bot.stop();
  expect(engine.getProcessorState(converter)?.recipeId).toBe('iron_oxide');
  expect(engine.getProcessorState(unconnected)?.recipeId).toBeNull();
});
