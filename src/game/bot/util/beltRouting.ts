import { getBuildingType, isProcessorTypeId, isStorageTypeId } from '@/game/data/buildingCatalog';
import { Direction, type BuildingId, type BuildingTypeId, type PortId, type TileCoord, PortKind } from '@/game/types';
import type { GameEngine } from '@/game/engine/GameEngine';

export interface BeltPathSegment {
  tile: TileCoord;
  type: BuildingTypeId;
  rotation: Direction;
}

export interface BeltRouteResult {
  success: boolean;
  segmentsPlaced: number;
  error?: string;
}

export function findNearestStorage(engine: GameEngine, origin: TileCoord): BuildingId | null {
  const storage: Array<{ id: BuildingId; distance: number }> = [];

  for (const [id, building] of engine.getBuildings()) {
    if (!isStorageTypeId(building.typeId)) continue;

    const distance = Math.abs(building.origin.x - origin.x) + Math.abs(building.origin.y - origin.y);
    storage.push({ id, distance });
  }

  if (storage.length === 0) return null;

  storage.sort((a, b) => a.distance - b.distance || a.id - b.id);
  return storage[0]!.id;
}

export function findNearestProcessor(engine: GameEngine, origin: TileCoord): BuildingId | null {
  const processors: Array<{ id: BuildingId; distance: number }> = [];

  for (const [id, building] of engine.getBuildings()) {
    if (!isProcessorTypeId(building.typeId)) continue;

    const distance = Math.abs(building.origin.x - origin.x) + Math.abs(building.origin.y - origin.y);
    processors.push({ id, distance });
  }

  if (processors.length === 0) return null;

  processors.sort((a, b) => a.distance - b.distance || a.id - b.id);
  return processors[0]!.id;
}

export function findBestPortForApproach(
  buildingId: BuildingId,
  approachDirection: Direction,
  engine: GameEngine,
): PortId | null {
  const building = engine.getBuildings().get(buildingId);
  if (!building) return null;

  const type = getBuildingType(building.typeId);
  if (!type) return null;

  const inputPorts = type.ports.filter((p) => p.kind === PortKind.Input);
  if (inputPorts.length === 0) return null;

  const portDirectionMap: Record<PortId, Direction> = {
    in_west: Direction.West,
    in_north: Direction.North,
    in_east: Direction.East,
    in_south: Direction.South,
  };

  const preferredPort = inputPorts.find((p) => portDirectionMap[p.id] === approachDirection);
  if (preferredPort) return preferredPort.id;

  const secondChoice = inputPorts.find((p) => {
    const portDir = portDirectionMap[p.id];
    return portDir !== undefined && Math.abs(portDir - approachDirection) === 2;
  });

  if (secondChoice) return secondChoice.id;

  const sortedByCoordinate = [...inputPorts].sort((a, b) => {
    const aKey = a.id;
    const bKey = b.id;
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });

  return sortedByCoordinate[0]?.id ?? null;
}

export function routeExtractorToStorage(
  engine: GameEngine,
  extractorId: BuildingId,
  storageId: BuildingId,
  { tryAllInputs = false }: { readonly tryAllInputs?: boolean } = {},
): BeltRouteResult {
  const extractor = engine.getBuildings().get(extractorId);
  if (!extractor) return { success: false, segmentsPlaced: 0, error: 'extractor_not_found' };

  const storage = engine.getBuildings().get(storageId);
  if (!storage) return { success: false, segmentsPlaced: 0, error: 'storage_not_found' };
  const type = getBuildingType(storage.typeId);
  if (!type) return { success: false, segmentsPlaced: 0, error: 'storage_not_found' };

  const from = { building: extractorId, port: 'out_east' as PortId };
  if (engine.getConnectionsOf(extractorId).some((connection) => connection.from.building === extractorId)) {
    return { success: false, segmentsPlaced: 0, error: 'already_routed' };
  }

  // The input facing the extractor first; with `tryAllInputs` (campaign bots,
  // where an unbelted extractor is wasted money), the other free inputs by
  // route length when that one is taken or walled off.
  const approachDirection = calculateApproachDirection(extractor.origin, storage.origin);
  const preferred = findBestPortForApproach(storageId, approachDirection, engine);
  const quoteFor = (port: PortId) => ({ port, quote: engine.quoteBelt(from, { building: storageId, port }) });
  let choice = preferred ? quoteFor(preferred) : null;
  if (!choice?.quote.ok && tryAllInputs) {
    choice = type.ports
      .filter((port) => port.kind === PortKind.Input && port.id !== preferred && !engine.connections.isPortConnected(storageId, port.id))
      .map((port) => quoteFor(port.id))
      .filter((candidate) => candidate.quote.ok)
      .sort((a, b) => (a.quote.ok && b.quote.ok ? a.quote.plan.segments.length - b.quote.plan.segments.length : 0))[0] ?? null;
  }

  if (!choice?.quote.ok) return { success: false, segmentsPlaced: 0, error: 'belt_path_blocked' };
  if (choice.quote.missing.length > 0) return { success: false, segmentsPlaced: 0, error: 'insufficient_resources' };

  const result = engine.placeBelt(from, { building: storageId, port: choice.port });
  return { success: result.ok, segmentsPlaced: result.ok ? result.plan.segments.length : 0 };
}

export function routeExtractorToMerger(
  engine: GameEngine,
  extractorId: BuildingId,
  mergerId: BuildingId,
): BeltRouteResult {
  const extractor = engine.getBuildings().get(extractorId);
  if (!extractor) return { success: false, segmentsPlaced: 0, error: 'extractor_not_found' };

  const merger = engine.getBuildings().get(mergerId);
  if (!merger) return { success: false, segmentsPlaced: 0, error: 'merger_not_found' };

  const outputPort = 'out_east' as PortId;
  const approachDirection = calculateApproachDirection(extractor.origin, merger.origin);
  const inputPort = findBestPortForApproach(mergerId, approachDirection, engine);

  if (!inputPort) return { success: false, segmentsPlaced: 0, error: 'no_input_port' };

  const from = { building: extractorId, port: outputPort };
  const to = { building: mergerId, port: inputPort };

  const canPlace = engine.canPlaceBelt(from, to);
  if (!canPlace.ok) return { success: false, segmentsPlaced: 0, error: 'belt_path_blocked' };

  const result = engine.placeBelt(from, to);
  return { success: result.ok, segmentsPlaced: result.ok ? result.plan.segments.length : 0 };
}

export function routeProcessorOutputToStorage(
  engine: GameEngine,
  processorId: BuildingId,
  storageId: BuildingId,
): BeltRouteResult {
  const processor = engine.getBuildings().get(processorId);
  if (!processor) return { success: false, segmentsPlaced: 0, error: 'processor_not_found' };

  const storage = engine.getBuildings().get(storageId);
  if (!storage) return { success: false, segmentsPlaced: 0, error: 'storage_not_found' };

  const outputPort = getBuildingType(processor.typeId)?.ports.find((port) => port.kind === PortKind.Output)?.id;
  if (!outputPort) return { success: false, segmentsPlaced: 0, error: 'no_output_port' };
  const approachDirection = calculateApproachDirection(processor.origin, storage.origin);
  const inputPort = findBestPortForApproach(storageId, approachDirection, engine);

  if (!inputPort) return { success: false, segmentsPlaced: 0, error: 'no_input_port' };

  const from = { building: processorId, port: outputPort };
  const to = { building: storageId, port: inputPort };

  const canPlace = engine.canPlaceBelt(from, to);
  if (!canPlace.ok) return { success: false, segmentsPlaced: 0, error: 'belt_path_blocked' };

  const result = engine.placeBelt(from, to);
  return { success: result.ok, segmentsPlaced: result.ok ? result.plan.segments.length : 0 };
}

export function routeToProcessorInput(
  engine: GameEngine,
  fromBuildingId: BuildingId,
  processorId: BuildingId,
): BeltRouteResult {
  const fromBuilding = engine.getBuildings().get(fromBuildingId);
  if (!fromBuilding) return { success: false, segmentsPlaced: 0, error: 'source_not_found' };

  const processor = engine.getBuildings().get(processorId);
  if (!processor) return { success: false, segmentsPlaced: 0, error: 'processor_not_found' };

  const outputPort = 'out_east' as PortId;
  const approachDirection = calculateApproachDirection(fromBuilding.origin, processor.origin);
  const inputPort = findBestPortForApproach(processorId, approachDirection, engine);

  if (!inputPort) return { success: false, segmentsPlaced: 0, error: 'no_input_port' };

  const from = { building: fromBuildingId, port: outputPort };
  const to = { building: processorId, port: inputPort };

  const canPlace = engine.canPlaceBelt(from, to);
  if (!canPlace.ok) return { success: false, segmentsPlaced: 0, error: 'belt_path_blocked' };

  const result = engine.placeBelt(from, to);
  return { success: result.ok, segmentsPlaced: result.ok ? result.plan.segments.length : 0 };
}

export function findBestStoragePortForApproach(engine: GameEngine, storageId: BuildingId, approachDirection: Direction): PortId | null {
  return findBestPortForApproach(storageId, approachDirection, engine);
}

export function findBestMergerPortForApproach(engine: GameEngine, mergerId: BuildingId, approachDirection: Direction): PortId | null {
  return findBestPortForApproach(mergerId, approachDirection, engine);
}

export function findBestProcessorPortForApproach(engine: GameEngine, processorId: BuildingId, approachDirection: Direction): PortId | null {
  return findBestPortForApproach(processorId, approachDirection, engine);
}

function calculateApproachDirection(from: TileCoord, to: TileCoord): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? Direction.East : Direction.West;
  }
  return dy > 0 ? Direction.South : Direction.North;
}

export function getExtractorOutputPort(): PortId {
  return 'out_east';
}

export function getProcessorInputPort(): PortId {
  return 'in';
}

export function getProcessorOutputPort(): PortId {
  return 'out';
}

export function isBeltPathBlocked(engine: GameEngine, from: { building: BuildingId; port: PortId }, to: { building: BuildingId; port: PortId }): boolean {
  const canPlace = engine.canPlaceBelt(from, to);
  return !canPlace.ok;
}
