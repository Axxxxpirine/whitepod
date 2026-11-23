import { MAP_CENTER } from '@/game/constants';
import {
  getAllBuildingTypes,
  getBuildingType,
  isBeltTypeId,
  isProcessorTypeId,
  isStorageTypeId,
} from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import { MILESTONES } from '@/game/data/milestoneCatalog';
import { getRecipesForBuilding } from '@/game/data/recipeCatalog';
import { RESOURCE_STOCK_KEY } from '@/game/data/resourceStock';
import { mulberry32 } from '@/game/data/SeededRNG';
import { GameEngine, type ResourceStock } from '@/game/engine/GameEngine';
import { PortKind, ResourceType, type BuildingId, type Direction, type PortId } from '@/game/types';
import { comparableSnapshot, findInvariantViolations } from './invariants';

/**
 * A player who clicks everything, everywhere, in any order: random valid and
 * invalid actions through the public engine API, with the world invariants
 * checked along the way. Deterministic per seed, so a failure replays.
 */

export interface ChaosOptions {
  readonly seed: number;
  readonly gameMode: GameMode;
  readonly actions: number;
  /** Half-width of the square around the map centre the player builds in. */
  readonly radius?: number;
  /** Campaign: stock credited to the hub once everything is unlocked (0 keeps the player poor). */
  readonly stock?: number;
  /** Check invariants every N actions (they scan the whole grid). */
  readonly checkEvery?: number;
}

export interface ChaosReport {
  readonly engine: GameEngine;
  readonly log: readonly string[];
  readonly counts: Readonly<Record<string, number>>;
}

const STOCK_KEYS = Object.values(RESOURCE_STOCK_KEY);
const PLAYER_TYPES = getAllBuildingTypes().filter((type) => !type.systemPlaced && !isBeltTypeId(type.id));
const TIME_STEPS = [0.016, 0.033, 0.1, 0.25, 1, 2.5, 7.3, 30];

function creditHub(engine: GameEngine, amount: number): void {
  const hub = engine.storageInventories.get(engine.getHubId()!)!;
  for (const key of STOCK_KEYS) hub[key] += amount;
}

/** A campaign with every milestone done, so the chaos reaches every building and recipe. */
export function createUnlockedCampaign(seed: number, stock: number): GameEngine {
  const engine = new GameEngine(1280, 720, { gameMode: GameMode.Campaign });
  engine.generateMap(seed);
  const hub = engine.storageInventories.get(engine.getHubId()!)!;
  for (const milestone of MILESTONES) {
    for (const { resourceType, amount } of milestone.requirements) hub[RESOURCE_STOCK_KEY[resourceType]!] += amount;
    if (!engine.completeActiveMilestone()) throw new Error(`Could not complete ${milestone.id}`);
  }
  if (stock > 0) creditHub(engine, stock);
  return engine;
}

/** What the player owns: the stock plus what the buildings standing on the map cost. */
function wealth(engine: GameEngine): ResourceStock {
  const total = engine.getResourceCounts();
  for (const building of engine.getBuildings().values()) {
    for (const { resourceType, amount } of engine.getBuildingCost(building.typeId)) {
      total[RESOURCE_STOCK_KEY[resourceType]!] += amount;
    }
  }
  return total;
}

export function runChaos(options: ChaosOptions): ChaosReport {
  const random = mulberry32(options.seed);
  const radius = options.radius ?? 14;
  const checkEvery = options.checkEvery ?? 25;
  const log: string[] = [];
  const counts: Record<string, number> = {};
  const count = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const tile = () => ({
    x: MAP_CENTER.x + Math.floor((random() * 2 - 1) * radius),
    y: MAP_CENTER.y + Math.floor((random() * 2 - 1) * radius),
  });

  const engine =
    options.gameMode === GameMode.Campaign
      ? createUnlockedCampaign(options.seed, options.stock ?? 0)
      : new GameEngine(1280, 720, { gameMode: GameMode.Sandbox });
  if (options.gameMode !== GameMode.Campaign) engine.generateMap(options.seed);

  // Deposits of each base resource inside the play area, so extractors and recipes have something to chew on.
  const deposits: { x: number; y: number }[] = [];
  for (let index = 0; index < 40; index++) {
    const spot = tile();
    if (engine.getBuildingAt(spot.x, spot.y) === null && engine.placeResource(spot.x, spot.y, pick([ResourceType.Regolith, ResourceType.Hydrogen, ResourceType.Oxygen]))) {
      deposits.push(spot);
    }
  }
  // Sandbox worlds start at midnight: begin at noon so lines run, the random clock still brings nights.
  engine.setSimulationTime(0.5);

  const ids = () => [...engine.getBuildings().keys()];
  const fail = (message: string): never => {
    throw new Error(`[chaos seed ${options.seed}] ${message}\nLast actions:\n  ${log.slice(-12).join('\n  ')}`);
  };

  /** Construction actions never create or destroy wealth, except what a removed storage held. */
  const conserving = (label: string, lost: () => ResourceStock | null, action: () => void): void => {
    const before = wealth(engine);
    const expectedLoss = lost();
    action();
    const after = wealth(engine);
    for (const key of STOCK_KEYS) {
      const expected = before[key] - (expectedLoss?.[key] ?? 0);
      if (after[key] !== expected) fail(`${label} changed ${key} wealth from ${before[key]} to ${after[key]} (expected ${expected})`);
    }
  };
  const nothingLost = () => null;
  const linkable = (typeId: string): boolean => {
    const type = getBuildingType(typeId);
    return !!type && (!!type.fuel || !!type.energy);
  };

  const freePorts = (kind: PortKind): { building: BuildingId; port: PortId }[] => {
    const ports: { building: BuildingId; port: PortId }[] = [];
    for (const [id, building] of engine.getBuildings()) {
      if (isBeltTypeId(building.typeId)) continue;
      for (const port of getBuildingType(building.typeId)?.ports ?? []) {
        if (port.kind === kind && !engine.connections.isPortConnected(id, port.id)) ports.push({ building: id, port: port.id });
      }
    }
    return ports;
  };

  for (let step = 0; step < options.actions; step++) {
    const roll = random();
    try {
      if (roll < 0.1) {
        // A deliberate line: an extractor on a deposit, powered by a panel next to it.
        const origin = pick(deposits);
        const rotation = Math.floor(random() * 4) as Direction;
        log.push(`extractor line at ${origin.x},${origin.y} r${rotation}`);
        conserving('extractor line', nothingLost, () => {
          const extractor = engine.placeBuilding(random() < 0.2 ? 'extractor_mk2' : 'extractor_basic', origin, rotation);
          const panel = engine.placeBuilding('solar_panel', tile());
          if (extractor !== null && panel !== null) count(engine.connectBuildings(extractor, panel) ? 'line:ok' : 'line:unlinked');
        });
      } else if (roll < 0.3) {
        const type = pick(PLAYER_TYPES);
        const origin = tile();
        const rotation = Math.floor(random() * 4) as Direction;
        log.push(`place ${type.id} at ${origin.x},${origin.y} r${rotation}`);
        conserving('placeBuilding', nothingLost, () => {
          const placed = engine.placeBuilding(type.id, origin, rotation);
          count(placed === null ? 'place:refused' : 'place:ok');
        });
      } else if (roll < 0.42) {
        const all = ids();
        if (all.length === 0) continue;
        const id = pick(all);
        const building = engine.getBuildings().get(id)!;
        log.push(`remove ${building.typeId} ${id}`);
        const lost = () => (isStorageTypeId(building.typeId) && !getBuildingType(building.typeId)?.permanent ? engine.getStorageInventory(id) : null);
        conserving('removeBuilding', lost, () => {
          const removed = isBeltTypeId(building.typeId) ? engine.removeBelt(id) : engine.removeBuilding(id);
          count(removed ? 'remove:ok' : 'remove:refused');
        });
      } else if (roll < 0.62) {
        const outputs = freePorts(PortKind.Output);
        const inputs = freePorts(PortKind.Input);
        if (outputs.length === 0 || inputs.length === 0) continue;
        const from = pick(outputs);
        const to = pick(inputs);
        const tier = random() < 0.3 ? 'fast' : 'basic';
        log.push(`belt ${from.building}:${from.port} -> ${to.building}:${to.port} (${tier})`);
        conserving('placeBelt', nothingLost, () => {
          const result = engine.placeBelt(from, to, tier);
          count(result.ok ? 'belt:ok' : `belt:${result.reason}`);
        });
      } else if (roll < 0.7) {
        // Mostly between buildings that take a power link, sometimes anything at all.
        const all = random() < 0.85 ? ids().filter((id) => linkable(engine.getBuildings().get(id)!.typeId)) : ids();
        if (all.length < 2) continue;
        const a = pick(all);
        const b = pick(all);
        log.push(`power link ${a} <-> ${b}`);
        conserving('energy link', nothingLost, () => {
          if (engine.areBuildingsEnergyLinked(a, b)) engine.disconnectBuildings(a, b);
          else count(engine.connectBuildings(a, b) ? 'link:ok' : 'link:refused');
        });
      } else if (roll < 0.76) {
        const processors = ids().filter((id) => isProcessorTypeId(engine.getBuildings().get(id)!.typeId));
        if (processors.length === 0) continue;
        const id = pick(processors);
        const recipes = [...getRecipesForBuilding('converter'), ...getRecipesForBuilding('synthesizer')];
        const recipeId = random() < 0.15 ? null : pick(recipes).id;
        log.push(`recipe ${id} = ${recipeId}`);
        count(engine.setProcessorRecipe(id, recipeId) ? 'recipe:ok' : 'recipe:refused');
      } else if (roll < 0.8) {
        const all = ids();
        if (all.length === 0) continue;
        const id = pick(all);
        const building = engine.getBuildings().get(id)!;
        log.push(`upgrade ${building.typeId} ${id}`);
        conserving('upgrade', nothingLost, () => {
          if (isBeltTypeId(building.typeId)) count(engine.upgradeBelt(id, random() < 0.8 ? 'fast' : 'basic') ? 'upgradeBelt:ok' : 'upgradeBelt:refused');
          else {
            const target = getBuildingType(building.typeId)?.upgradesTo ?? pick(PLAYER_TYPES).id;
            count(engine.upgradeBuilding(id, target) ? 'upgrade:ok' : 'upgrade:refused');
          }
        });
      } else if (roll < 0.82) {
        const value = random();
        log.push(`set time ${value.toFixed(3)}`);
        engine.setSimulationTime(value);
      } else if (roll < 0.84 && options.gameMode === GameMode.Campaign && (options.stock ?? 0) > 0) {
        // Keeps a rich player rich, so placements keep succeeding.
        log.push('credit hub');
        creditHub(engine, 200);
      } else {
        const dt = pick(TIME_STEPS);
        log.push(`wait ${dt}s`);
        engine.update(dt, { emitSfx: false });
        count('wait');
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('[chaos')) throw error;
      fail(`action threw: ${error instanceof Error ? error.stack : String(error)}`);
    }

    if (step % checkEvery === checkEvery - 1) {
      const violations = findInvariantViolations(engine);
      if (violations.length > 0) fail(`invariants broken after step ${step}:\n  ${violations.slice(0, 10).join('\n  ')}`);
    }
  }

  return { engine, log, counts };
}

/** Reloads the world from its own save, then plays both for a while: they must stay identical. */
export function expectReloadIsIdentical(engine: GameEngine, seconds: number, label: string): void {
  const reloaded = GameEngine.fromSnapshot(structuredClone(engine.serializeWorld()), 1280, 720);
  const first = JSON.stringify(comparableSnapshot(engine));
  const second = JSON.stringify(comparableSnapshot(reloaded));
  if (first !== second) throw new Error(`${label}: a reloaded world differs from the one that was saved${describeDifference(first, second)}`);
  for (let elapsed = 0; elapsed < seconds; elapsed += 0.1) {
    engine.update(0.1, { emitSfx: false });
    reloaded.update(0.1, { emitSfx: false });
  }
  const a = JSON.stringify(comparableSnapshot(engine));
  const b = JSON.stringify(comparableSnapshot(reloaded));
  if (a !== b) throw new Error(`${label}: ${seconds}s after a reload, the world differs from the one that kept running${describeDifference(a, b)}`);
}

function describeDifference(a: string, b: string): string {
  const left = JSON.parse(a) as Record<string, unknown>;
  const right = JSON.parse(b) as Record<string, unknown>;
  const keys = Object.keys(left).filter((key) => JSON.stringify(left[key]) !== JSON.stringify(right[key]));
  return `\n  differing fields: ${keys.join(', ')}\n${keys
    .filter((key) => key !== 'grid')
    .map((key) => `  ${key}:\n    kept:     ${JSON.stringify(left[key]).slice(0, 400)}\n    reloaded: ${JSON.stringify(right[key]).slice(0, 400)}`)
    .join('\n')}`;
}
