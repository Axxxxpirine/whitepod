// BeltRouter — pure, stateless belt path planning.
//
// planBelt(engine, from, to) validates the request and produces a BeltPlan:
//   - a sequence of 1x1 belt segments covering the path between from's output
//     port and to's input port,
//   - the full list of connections (from-building → seg₀ → … → seg_last → to-building)
//     required to wire the conveyor into ConnectionRegistry.
//
// No state, no mutation. All side effects happen later in GameEngine.placeBelt,
// which re-validates everything before committing atomically.
//
//                                path
//   ┌──────────────┐              ·─·─·─·            ┌──────────────┐
//   │  extractor   │─out→ enter ─────────── exit →in─│   storage    │
//   │  (from)      │      tile                tile   │   (to)       │
//   └──────────────┘                                 └──────────────┘
//
// Flow reasoning (used for segmentation):
//   For each tile t_i of the path we know:
//     - moveInDir  : the direction the flow is moving when it enters t_i
//       - i = 0      → fromSide (flow exits fromBuilding along its port side)
//       - i > 0      → stepDir(t_{i-1} → t_i)
//     - moveOutDir : the direction the flow is moving when it exits t_i
//       - i = last   → opposite(toSide) (flow enters toBuilding from the side
//                       opposite its port's side)
//       - i < last   → stepDir(t_i → t_{i+1})
//   Turn classification: (moveOutDir - moveInDir + 4) % 4
//     0 → straight, 1 → CW corner, 3 → CCW corner, 2 → U-turn (impossible on
//     a 4-connex shortest path; flagged as error defensively).
//   Rotation formula for all three types: (moveInDir + 3) % 4.

import {
  Direction,
  PortKind,
  type BeltFailure,
  type BeltPlan,
  type BeltResult,
  type BeltSegment,
  type BuildingId,
  type BuildingTypeId,
  type PendingConnection,
  type PortId,
  type TileCoord,
  type TileType,
} from '../types';
import {
  BELT_STRAIGHT_BUILDING_TYPE_ID,
  beltTypeId,
  getBuildingType,
  type BeltTier,
} from '../data/buildingCatalog';
import {
  oppositeSide,
  unitVector,
  worldSideOf,
  worldTileOf,
} from '../data/ConnectionRegistry';
import { GRID_SIZE, GRID_WIDTH, REVEALED_FLAG } from '../constants';
import { isInBounds, toIndex } from '../data/coords';
import type { TileGrid } from '../data/TileGrid';
import type { BuildingRegistry } from '../data/BuildingRegistry';
import type { ConnectionRegistry } from '../data/ConnectionRegistry';

export interface BeltRouterView {
  readonly grid: TileGrid;
  readonly buildings: BuildingRegistry;
  readonly connections: ConnectionRegistry;
}

interface PortEndpoint {
  readonly building: BuildingId;
  readonly port: PortId;
}

// Deterministic neighbor order. Any change to this array changes the set of
// preferred paths chosen by the BFS and WILL cause determinism-sensitive tests
// (case 11) to fail. Do not reorder.
const NEIGHBOR_ORDER: readonly Direction[] = [
  Direction.North,
  Direction.East,
  Direction.South,
  Direction.West,
];

export function planBelt(
  view: BeltRouterView,
  from: PortEndpoint,
  to: PortEndpoint,
  tier: BeltTier = 'basic',
): BeltResult {
  // 1. Reject self-connection up front (same building on both ends).
  if (from.building === to.building) return fail('self_connection');

  // 2. Resolve both endpoints.
  const fromResolved = resolvePort(view, from);
  if (!fromResolved) return fail(endpointFailure(view, from));
  const toResolved = resolvePort(view, to);
  if (!toResolved) return fail(endpointFailure(view, to));

  // 3. Port kind rule: from must be Output, to must be Input.
  if (fromResolved.portKind !== PortKind.Output || toResolved.portKind !== PortKind.Input) {
    return fail('port_kind_mismatch');
  }

  // 4. Port availability — a port can only carry one connection at a time.
  if (view.connections.isPortConnected(from.building, from.port)) {
    return fail('source_port_taken');
  }
  if (view.connections.isPortConnected(to.building, to.port)) {
    return fail('target_port_taken');
  }

  // 5. Compute entry/exit tiles (one tile outside each port along the port's
  //    outward direction).
  const fromSide = fromResolved.worldSide;
  const toSide = toResolved.worldSide;
  const enterTile = stepFrom(fromResolved.worldTile, fromSide);
  const exitTile = stepFrom(toResolved.worldTile, toSide);

  // 6. BFS from enterTile to exitTile on the ground grid, avoiding occupied
  //    tiles. Deterministic ordering guarantees preview ≡ commit.
  const path = bfs(view, enterTile, exitTile);
  if (!path) return fail('no_path');

  // 7. Segment the path into belt building placements.
  const segments = segmentPath(path, fromSide, toSide, tier);
  if (!segments) return fail('no_path'); // U-turn impossible on shortest 4-connex path

  // 8. Build the connection list: from-building → seg₀ → … → seg_last → to-building.
  const connections = buildConnections(from, to, segments.length);

  const plan: BeltPlan = { segments, connections };
  return { ok: true, plan };
}

// ─── BFS ──────────────────────────────────────────────────────────────────

/** One step in each direction of `NEIGHBOR_ORDER`, in that order. */
const NEIGHBOR_STEPS: readonly TileCoord[] = NEIGHBOR_ORDER.map(unitVector);

/** Search buffers shared by every route: a search runs on each pointer move while a belt is being drawn. */
const searchParent = new Int32Array(GRID_SIZE);
const searchQueue = new Int32Array(GRID_SIZE);
/** Tiles reached by the search numbered `searchStamp`; avoids clearing the buffers between searches. */
const searchVisited = new Uint32Array(GRID_SIZE);
let searchStamp = 0;

function bfs(
  view: BeltRouterView,
  start: TileCoord,
  goal: TileCoord,
): readonly TileCoord[] | null {
  if (!isTraversable(view, start)) return null;
  if (start.x === goal.x && start.y === goal.y) return [start];
  if (!isTraversable(view, goal)) return null;

  searchStamp += 1;
  if (searchStamp === 0xffffffff) {
    searchVisited.fill(0);
    searchStamp = 1;
  }
  const startIndex = toIndex(start.x, start.y);
  const goalIndex = toIndex(goal.x, goal.y);
  searchVisited[startIndex] = searchStamp;
  searchParent[startIndex] = -1;
  let head = 0;
  let tail = 0;
  searchQueue[tail++] = startIndex;

  while (head < tail) {
    const current = searchQueue[head++]!;
    const x = current % GRID_WIDTH;
    const y = (current - x) / GRID_WIDTH;
    for (const step of NEIGHBOR_STEPS) {
      const nx = x + step.x;
      const ny = y + step.y;
      if (!isInBounds(nx, ny)) continue;
      const next = toIndex(nx, ny);
      if (searchVisited[next] === searchStamp) continue;
      if (!isTraversableIndex(view, next)) continue;
      searchVisited[next] = searchStamp;
      searchParent[next] = current;
      if (next === goalIndex) return reconstruct(next);
      searchQueue[tail++] = next;
    }
  }
  return null;
}

function reconstruct(endIndex: number): readonly TileCoord[] {
  const path: TileCoord[] = [];
  for (let cursor = endIndex; cursor !== -1; cursor = searchParent[cursor]!) {
    const x = cursor % GRID_WIDTH;
    path.push({ x, y: (cursor - x) / GRID_WIDTH });
  }
  return path.reverse();
}

/** Belts require Ground — both belt tiers declare allowedTiles=[Ground]. */
function beltAllowedTiles(): readonly TileType[] {
  return getBuildingType(BELT_STRAIGHT_BUILDING_TYPE_ID)!.allowedTiles;
}

function isTraversable(view: BeltRouterView, tile: TileCoord): boolean {
  return isInBounds(tile.x, tile.y) && isTraversableIndex(view, toIndex(tile.x, tile.y));
}

function isTraversableIndex(view: BeltRouterView, idx: number): boolean {
  if (view.buildings.occupantIdAt(idx) !== 0) return false;
  // Same rule as placement: nothing is built in the fog, so no route goes through it.
  if (!(view.grid.flags[idx] & REVEALED_FLAG)) return false;
  return beltAllowedTiles().includes(view.grid.tileType[idx] as TileType);
}

// ─── Segmentation ─────────────────────────────────────────────────────────

function segmentPath(
  path: readonly TileCoord[],
  fromSide: Direction,
  toSide: Direction,
  tier: BeltTier,
): BeltSegment[] | null {
  const last = path.length - 1;
  const segments: BeltSegment[] = [];
  for (let i = 0; i <= last; i++) {
    const moveInDir = i === 0 ? fromSide : stepDir(path[i - 1], path[i]);
    const moveOutDir = i === last ? oppositeSide(toSide) : stepDir(path[i], path[i + 1]);
    const seg = chooseSegment(path[i], moveInDir, moveOutDir, tier);
    if (!seg) return null;
    segments.push(seg);
  }
  return segments;
}

function chooseSegment(
  coord: TileCoord,
  moveInDir: Direction,
  moveOutDir: Direction,
  tier: BeltTier,
): BeltSegment | null {
  const turn = (moveOutDir - moveInDir + 4) % 4;
  const rotation = ((moveInDir + 3) % 4) as Direction;
  let typeId: BuildingTypeId;
  switch (turn) {
    case 0:
      typeId = beltTypeId(tier, 'straight');
      break;
    case 1:
      typeId = beltTypeId(tier, 'cw');
      break;
    case 3:
      typeId = beltTypeId(tier, 'ccw');
      break;
    default:
      // turn === 2: U-turn, impossible on a 4-connex shortest path.
      return null;
  }
  return { coord, typeId, rotation };
}

// ─── Connection list construction ─────────────────────────────────────────

function buildConnections(
  from: PortEndpoint,
  to: PortEndpoint,
  segmentCount: number,
): readonly PendingConnection[] {
  const out: PendingConnection[] = [];
  // from-building.out → segment[0].in
  out.push({
    from: { kind: 'building', building: from.building, port: from.port },
    to: { kind: 'segment', segmentIndex: 0, port: 'in' },
  });
  // segment[i].out → segment[i+1].in
  for (let i = 0; i < segmentCount - 1; i++) {
    out.push({
      from: { kind: 'segment', segmentIndex: i, port: 'out' },
      to: { kind: 'segment', segmentIndex: i + 1, port: 'in' },
    });
  }
  // segment[last].out → to-building.in
  out.push({
    from: { kind: 'segment', segmentIndex: segmentCount - 1, port: 'out' },
    to: { kind: 'building', building: to.building, port: to.port },
  });
  return out;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

interface ResolvedPort {
  readonly worldTile: TileCoord;
  readonly worldSide: Direction;
  readonly portKind: PortKind;
}

function resolvePort(view: BeltRouterView, endpoint: PortEndpoint): ResolvedPort | null {
  const building = view.buildings.get(endpoint.building);
  if (!building) return null;
  const type = getBuildingType(building.typeId);
  if (!type) return null;
  const port = type.ports.find((p) => p.id === endpoint.port);
  if (!port) return null;
  return {
    worldTile: worldTileOf(port, building.origin, building.rotation, type.footprint),
    worldSide: worldSideOf(port, building.rotation),
    portKind: port.kind,
  };
}

function endpointFailure(
  view: BeltRouterView,
  endpoint: PortEndpoint,
): 'unknown_building' | 'unknown_port' {
  const building = view.buildings.get(endpoint.building);
  if (!building) return 'unknown_building';
  const type = getBuildingType(building.typeId);
  if (!type) return 'unknown_building';
  if (!type.ports.find((p) => p.id === endpoint.port)) return 'unknown_port';
  return 'unknown_building';
}

function stepFrom(tile: TileCoord, side: Direction): TileCoord {
  const v = unitVector(side);
  return { x: tile.x + v.x, y: tile.y + v.y };
}

function stepDir(a: TileCoord, b: TileCoord): Direction {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 1 && dy === 0) return Direction.East;
  if (dx === -1 && dy === 0) return Direction.West;
  if (dx === 0 && dy === 1) return Direction.South;
  if (dx === 0 && dy === -1) return Direction.North;
  throw new Error(`stepDir: tiles are not 4-connex neighbors (${a.x},${a.y}) → (${b.x},${b.y})`);
}

function fail(reason: BeltFailure): BeltResult {
  return { ok: false, reason };
}
