import {
  SPLITTER_BASIC_BUILDING_TYPE_ID,
  carriesFlowThrough,
  getBuildingType,
  isExtractorTypeId,
  isProcessorTypeId,
  isStorageTypeId,
} from '@/game/data/buildingCatalog';
import { getRecipe } from '@/game/data/recipeCatalog';
import type { GameEngine } from '@/game/engine/GameEngine';
import { PortKind, type BuildingId, type PortId, type ResourceType } from '@/game/types';

export interface InputPortSupply {
  readonly portId: PortId;
  readonly reachableProviders: readonly BuildingId[];
  readonly reachableResourceTypes: readonly ResourceType[];
}

export interface ProcessorInputAssignment {
  readonly portId: PortId;
  readonly requiredResourceType: ResourceType;
}

export interface ProcessorLogisticsStatus {
  readonly badInput: boolean;
  readonly missingInput: boolean;
  readonly blockedOutput: boolean;
  readonly assignments: readonly ProcessorInputAssignment[];
}

export interface DownstreamTerminal {
  readonly kind: 'storage' | 'processor';
  readonly buildingId: BuildingId;
  readonly portId: PortId;
}

interface AssignmentEvaluation {
  readonly assignments: readonly ProcessorInputAssignment[];
  readonly badInput: boolean;
  readonly missingInput: boolean;
  readonly score: number;
}

export function resolveUpstreamProvidersForInputPort(
  engine: GameEngine,
  buildingId: BuildingId,
  portId: PortId,
): InputPortSupply {
  const reachableProviders: BuildingId[] = [];
  const reachableResourceTypes: ResourceType[] = [];
  const visited = new Set<BuildingId>();
  const queue = engine
    .getConnectionsOf(buildingId)
    .filter((connection) => connection.to.building === buildingId && connection.to.port === portId)
    .map((connection) => connection.from.building);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const building = engine.getBuildings().get(currentId);
    if (!building) continue;

    if (isExtractorTypeId(building.typeId) || isProcessorTypeId(building.typeId)) {
      const resourceType = engine.getProducerResourceType(currentId);
      if (resourceType === null) continue;
      reachableProviders.push(currentId);
      if (!reachableResourceTypes.includes(resourceType)) {
        reachableResourceTypes.push(resourceType);
      }
      continue;
    }

    if (carriesFlowThrough(building.typeId)) {
      for (const connection of engine.getConnectionsOf(currentId)) {
        if (connection.to.building !== currentId) continue;
        queue.push(connection.from.building);
      }
    }
  }

  reachableProviders.sort((a, b) => a - b);
  return { portId, reachableProviders, reachableResourceTypes };
}

/** The output a splitter sends a unit to on a given route. */
export interface SplitterChoice {
  readonly splitter: BuildingId;
  readonly port: PortId;
}

/**
 * One way a unit can go from a producer's output to a storage or a machine.
 * Without splitters a producer has at most one route; each splitter on the
 * way branches it once per connected output.
 */
export interface FlowRoute {
  readonly terminal: DownstreamTerminal;
  /** Belts, mergers and splitters crossed on the way, in order. */
  readonly nodes: readonly BuildingId[];
  /** Splitter outputs taken on the way, in order. */
  readonly choices: readonly SplitterChoice[];
}

/** Every route from `buildingId`'s `outputPortId`, splitter outputs in catalog port order. */
export function resolveRoutesFromOutput(engine: GameEngine, buildingId: BuildingId, outputPortId: PortId): FlowRoute[] {
  const routes: FlowRoute[] = [];

  const walk = (
    fromId: BuildingId,
    fromPort: PortId,
    nodes: readonly BuildingId[],
    choices: readonly SplitterChoice[],
    visited: ReadonlySet<BuildingId>,
  ): void => {
    for (const connection of engine.getConnectionsOf(fromId)) {
      if (connection.from.building !== fromId || connection.from.port !== fromPort) continue;
      const nextId = connection.to.building;
      if (visited.has(nextId)) continue;
      const building = engine.getBuildings().get(nextId);
      if (!building) continue;
      if (isStorageTypeId(building.typeId)) {
        routes.push({ terminal: { kind: 'storage', buildingId: nextId, portId: connection.to.port }, nodes, choices });
        continue;
      }
      if (isProcessorTypeId(building.typeId)) {
        routes.push({ terminal: { kind: 'processor', buildingId: nextId, portId: connection.to.port }, nodes, choices });
        continue;
      }
      if (!carriesFlowThrough(building.typeId)) continue;
      const nextVisited = new Set(visited).add(nextId);
      const isSplitter = building.typeId === SPLITTER_BASIC_BUILDING_TYPE_ID;
      for (const port of getBuildingType(building.typeId)?.ports ?? []) {
        if (port.kind !== PortKind.Output) continue;
        walk(
          nextId,
          port.id,
          [...nodes, nextId],
          isSplitter ? [...choices, { splitter: nextId, port: port.id }] : choices,
          nextVisited,
        );
      }
    }
  };

  walk(buildingId, outputPortId, [], [], new Set([buildingId]));
  return routes;
}

/**
 * Where a unit from `buildingId`'s output ends up when it has a single way to
 * go; with splitters, the first route (the engine picks among them in turn).
 */
export function resolveDownstreamTerminalFromOutput(
  engine: GameEngine,
  buildingId: BuildingId,
  outputPortId: PortId,
): DownstreamTerminal | null {
  return resolveRoutesFromOutput(engine, buildingId, outputPortId)[0]?.terminal ?? null;
}

export function resolveProcessorLogisticsStatus(
  engine: GameEngine,
  buildingId: BuildingId,
  recipeId = engine.getProcessorState(buildingId)?.recipeId,
): ProcessorLogisticsStatus | null {
  const building = engine.getBuildings().get(buildingId);
  if (!building || !isProcessorTypeId(building.typeId)) return null;

  const recipe = recipeId ? getRecipe(recipeId) : undefined;
  if (!recipe) return null;

  const buildingType = engine.getBuildingTypeDefinition(building.typeId);
  if (!buildingType) return null;

  const inputPorts = buildingType.ports.filter((port) => port.kind === PortKind.Input);
  const supplies = inputPorts.map((port) => resolveUpstreamProvidersForInputPort(engine, buildingId, port.id));
  const evaluations = evaluateAssignments(engine, recipe.inputs, supplies);
  const best = chooseBestEvaluation(evaluations);
  const outputPort = buildingType.ports.find((port) => port.kind === PortKind.Output);
  const downstreamTerminal = outputPort
    ? resolveDownstreamTerminalFromOutput(engine, buildingId, outputPort.id)
    : null;

  return {
    badInput: best.badInput,
    missingInput: best.missingInput,
    blockedOutput: downstreamTerminal === null,
    assignments: best.assignments,
  };
}

function evaluateAssignments(
  engine: GameEngine,
  ingredients: readonly { readonly resourceType: ResourceType; readonly amount: number }[],
  supplies: readonly InputPortSupply[],
): AssignmentEvaluation[] {
  if (supplies.length !== ingredients.length) {
    return [{
      assignments: [],
      badInput: false,
      missingInput: true,
      score: 100,
    }];
  }

  const ingredientIndexes = ingredients.map((_, index) => index);
  const permutations = permute(ingredientIndexes);
  return permutations.map((permutation) => {
    const assignments: ProcessorInputAssignment[] = [];
    let badInput = false;
    let missingInput = false;

    for (let supplyIndex = 0; supplyIndex < supplies.length; supplyIndex += 1) {
      const supply = supplies[supplyIndex]!;
      const ingredient = ingredients[permutation[supplyIndex]!]!;
      assignments.push({
        portId: supply.portId,
        requiredResourceType: ingredient.resourceType,
      });

      for (const resourceType of supply.reachableResourceTypes) {
        if (resourceType !== ingredient.resourceType) {
          badInput = true;
        }
      }

      const matchingProviders = supply.reachableProviders.filter(
        (providerId) => engine.getProducerResourceType(providerId) === ingredient.resourceType,
      );
      if (matchingProviders.length < ingredient.amount) {
        missingInput = true;
      }
    }

    return {
      assignments,
      badInput,
      missingInput,
      score: Number(badInput) * 10 + Number(missingInput),
    };
  });
}

function chooseBestEvaluation(evaluations: readonly AssignmentEvaluation[]): AssignmentEvaluation {
  return evaluations.reduce((best, current) => (current.score < best.score ? current : best));
}

function permute(values: readonly number[]): number[][] {
  if (values.length <= 1) return [Array.from(values)];
  const out: number[][] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    const rest = values.filter((_, restIndex) => restIndex !== index);
    for (const tail of permute(rest)) {
      out.push([value, ...tail]);
    }
  }
  return out;
}
