import {
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  isBeltTypeId,
  isProcessorTypeId,
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

    if (building.typeId === EXTRACTOR_BUILDING_TYPE_ID || isProcessorTypeId(building.typeId)) {
      const resourceType = engine.getProducerResourceType(currentId);
      if (resourceType === null) continue;
      reachableProviders.push(currentId);
      if (!reachableResourceTypes.includes(resourceType)) {
        reachableResourceTypes.push(resourceType);
      }
      continue;
    }

    if (isBeltTypeId(building.typeId) || building.typeId === MERGER_BASIC_BUILDING_TYPE_ID) {
      for (const connection of engine.getConnectionsOf(currentId)) {
        if (connection.to.building !== currentId) continue;
        queue.push(connection.from.building);
      }
    }
  }

  reachableProviders.sort((a, b) => a - b);
  return { portId, reachableProviders, reachableResourceTypes };
}

export function resolveDownstreamTerminalFromOutput(
  engine: GameEngine,
  buildingId: BuildingId,
  outputPortId: PortId,
): DownstreamTerminal | null {
  const startConnections = engine
    .getConnectionsOf(buildingId)
    .filter((connection) => connection.from.building === buildingId && connection.from.port === outputPortId);

  if (startConnections.length !== 1) return null;

  const visited = new Set<BuildingId>([buildingId]);
  let currentBuildingId = startConnections[0]!.to.building;
  let currentPortId = startConnections[0]!.to.port;

  while (true) {
    if (visited.has(currentBuildingId)) return null;
    visited.add(currentBuildingId);

    const building = engine.getBuildings().get(currentBuildingId);
    if (!building) return null;

    if (building.typeId === STORAGE_BUILDING_TYPE_ID) {
      return { kind: 'storage', buildingId: currentBuildingId, portId: currentPortId };
    }

    if (isProcessorTypeId(building.typeId)) {
      return { kind: 'processor', buildingId: currentBuildingId, portId: currentPortId };
    }

    if (!isBeltTypeId(building.typeId) && building.typeId !== MERGER_BASIC_BUILDING_TYPE_ID) {
      return null;
    }

    const nextConnections = engine
      .getConnectionsOf(currentBuildingId)
      .filter((connection) => connection.from.building === currentBuildingId);

    if (nextConnections.length !== 1) return null;

    currentBuildingId = nextConnections[0]!.to.building;
    currentPortId = nextConnections[0]!.to.port;
  }
}

export function resolveProcessorLogisticsStatus(
  engine: GameEngine,
  buildingId: BuildingId,
): ProcessorLogisticsStatus | null {
  const building = engine.getBuildings().get(buildingId);
  if (!building || !isProcessorTypeId(building.typeId)) return null;

  const state = engine.getProcessorState(buildingId);
  if (!state?.recipeId) return null;

  const recipe = getRecipe(state.recipeId);
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
