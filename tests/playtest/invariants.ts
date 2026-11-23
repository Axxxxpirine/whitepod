import { GRID_SIZE } from '@/game/constants';
import {
  getBuildingType,
  isExtractorTypeId,
  isProcessorTypeId,
  isStorageTypeId,
} from '@/game/data/buildingCatalog';
import { oppositeSide, unitVector, worldSideOf, worldTileOf } from '@/game/data/ConnectionRegistry';
import { toIndex } from '@/game/data/coords';
import type { GameEngine, ResourceStock } from '@/game/engine/GameEngine';
import { PortKind, type BuildingId } from '@/game/types';

/**
 * World invariants a player must never be able to break, whatever they click.
 * Returns every violation found (empty when the world is sound), so a failing
 * playtest names all of them at once.
 */
export function findInvariantViolations(engine: GameEngine): string[] {
  const violations: string[] = [];
  const buildings = engine.getBuildings();

  // Occupancy: every footprint tile belongs to its building, and nothing else is occupied.
  let footprintArea = 0;
  for (const [id, building] of buildings) {
    const type = getBuildingType(building.typeId);
    if (!type) {
      violations.push(`building ${id} has unknown type '${building.typeId}'`);
      continue;
    }
    if (building.id !== id) violations.push(`building ${id} stores id ${building.id}`);
    for (let dy = 0; dy < type.footprint.h; dy++) {
      for (let dx = 0; dx < type.footprint.w; dx++) {
        footprintArea += 1;
        const occupant = engine.buildings.occupantIdAt(toIndex(building.origin.x + dx, building.origin.y + dy));
        if (occupant !== id) {
          violations.push(`tile ${building.origin.x + dx},${building.origin.y + dy} of building ${id} is held by ${occupant}`);
        }
      }
    }
  }
  let occupiedTiles = 0;
  for (let index = 0; index < GRID_SIZE; index++) {
    const occupant = engine.buildings.occupantIdAt(index);
    if (occupant === 0) continue;
    occupiedTiles += 1;
    if (!buildings.has(occupant)) violations.push(`tile index ${index} is held by missing building ${occupant}`);
  }
  if (occupiedTiles !== footprintArea) {
    violations.push(`${occupiedTiles} tiles occupied for ${footprintArea} tiles of footprint`);
  }

  // Connections: both ends exist, face each other, and no port is used twice.
  const usedPorts = new Set<string>();
  for (const [id, connection] of engine.getConnections()) {
    const from = buildings.get(connection.from.building);
    const to = buildings.get(connection.to.building);
    if (!from || !to) {
      violations.push(`connection ${id} references a missing building`);
      continue;
    }
    const fromType = getBuildingType(from.typeId)!;
    const toType = getBuildingType(to.typeId)!;
    const fromPort = fromType.ports.find((port) => port.id === connection.from.port);
    const toPort = toType.ports.find((port) => port.id === connection.to.port);
    if (!fromPort || !toPort) {
      violations.push(`connection ${id} references a missing port`);
      continue;
    }
    if (fromPort.kind !== PortKind.Output || toPort.kind !== PortKind.Input) {
      violations.push(`connection ${id} does not go from an output to an input`);
    }
    for (const key of [`${from.id}:${fromPort.id}`, `${to.id}:${toPort.id}`]) {
      if (usedPorts.has(key)) violations.push(`port ${key} carries two connections`);
      usedPorts.add(key);
    }
    const fromTile = worldTileOf(fromPort, from.origin, from.rotation, fromType.footprint);
    const toTile = worldTileOf(toPort, to.origin, to.rotation, toType.footprint);
    const fromSide = worldSideOf(fromPort, from.rotation);
    const step = unitVector(fromSide);
    if (
      fromTile.x + step.x !== toTile.x ||
      fromTile.y + step.y !== toTile.y ||
      fromSide !== oppositeSide(worldSideOf(toPort, to.rotation))
    ) {
      violations.push(`connection ${id} links ports that do not face each other`);
    }
    if (!engine.getConnectionsOf(from.id).includes(connection) || !engine.getConnectionsOf(to.id).includes(connection)) {
      violations.push(`connection ${id} is missing from its buildings' index`);
    }
  }

  // Per-building state: exactly the buildings of the matching kind, with sane values.
  const expectKeys = (label: string, keys: Iterable<BuildingId>, belongs: (typeId: string) => boolean): void => {
    const present = new Set(keys);
    for (const id of present) {
      const building = buildings.get(id);
      if (!building) violations.push(`${label} holds removed building ${id}`);
      else if (!belongs(building.typeId)) violations.push(`${label} holds ${building.typeId} ${id}`);
    }
    for (const [id, building] of buildings) {
      if (belongs(building.typeId) && !present.has(id)) violations.push(`${label} misses ${building.typeId} ${id}`);
    }
  };
  expectKeys('batteryCharges', engine.batteryCharges.keys(), (typeId) => !!getBuildingType(typeId)?.energy?.battery);
  expectKeys('storageInventories', engine.storageInventories.keys(), isStorageTypeId);
  expectKeys('processorStates', engine.processorStates.keys(), isProcessorTypeId);
  expectKeys('producerOutputBuffers', engine.producerOutputBuffers.keys(), (typeId) => isExtractorTypeId(typeId) || isProcessorTypeId(typeId));
  for (const id of engine.processorReservations.keys()) {
    if (!buildings.has(id)) violations.push(`processorReservations holds removed building ${id}`);
  }

  for (const [id, charge] of engine.batteryCharges) {
    const capacity = getBuildingType(buildings.get(id)?.typeId ?? '')?.energy?.battery?.capacity ?? 0;
    if (!Number.isFinite(charge) || charge < -1e-9 || charge > capacity + 1e-9) {
      violations.push(`battery ${id} holds ${charge} of ${capacity}`);
    }
  }
  for (const [id, inventory] of engine.storageInventories) {
    for (const key of Object.keys(inventory) as (keyof ResourceStock)[]) {
      const amount = inventory[key];
      if (!Number.isInteger(amount) || amount < 0) violations.push(`storage ${id} holds ${amount} ${key}`);
    }
  }
  for (const [id, state] of engine.processorStates) {
    if (!Number.isFinite(state.cycleProgress) || state.cycleProgress < 0) {
      violations.push(`processor ${id} is at ${state.cycleProgress} s of its cycle`);
    }
  }

  // Energy links: symmetric, between existing buildings.
  for (const id of buildings.keys()) {
    for (const neighbor of engine.getEnergyLinkedBuildings(id)) {
      if (!buildings.has(neighbor)) violations.push(`building ${id} is power-linked to removed building ${neighbor}`);
      else if (!engine.areBuildingsEnergyLinked(neighbor, id)) violations.push(`power link ${id}-${neighbor} is one-way`);
    }
  }

  // The per-building power state (cached per network) agrees with the network balance the panels show.
  for (const [id, building] of buildings) {
    if (!getBuildingType(building.typeId)?.energy?.consumption) continue;
    const state = engine.getBuildingPowerState(id);
    const expected = engine.getEnergyStatsForBuilding(id)?.isPowered ? 'powered' : 'unpowered';
    if (state !== expected) violations.push(`building ${id} reads ${state} on a network that is ${expected}`);
  }

  // Read models the HUD shows every frame must stay finite.
  for (const [label, stock] of [['counts', engine.getResourceCounts()], ['rates', engine.getResourceRates()]] as const) {
    for (const key of Object.keys(stock) as (keyof ResourceStock)[]) {
      if (!Number.isFinite(stock[key])) violations.push(`resource ${label}.${key} is ${stock[key]}`);
    }
  }
  const energy = engine.getEnergyGlobalStats();
  for (const key of Object.keys(energy) as (keyof typeof energy)[]) {
    if (!Number.isFinite(energy[key])) violations.push(`energy stat ${key} is ${energy[key]}`);
  }
  const time = engine.simulationTime;
  if (!(time >= 0 && time < 1)) violations.push(`simulation time is ${time}`);

  return violations;
}

/** A world snapshot in a comparable form (the grid buffer becomes plain numbers). */
export function comparableSnapshot(engine: GameEngine): unknown {
  const snapshot = engine.serializeWorld();
  return JSON.parse(JSON.stringify({ ...snapshot, grid: Array.from(new Uint8Array(snapshot.grid)) }));
}
