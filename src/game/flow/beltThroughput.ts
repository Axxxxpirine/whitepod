import { MERGER_BASIC_BUILDING_TYPE_ID, getBuildingType, isBeltTypeId } from '../data/buildingCatalog';
import type { Building, BuildingId, BuildingTypeId, Connection } from '../types';

/** Nodes a unit travels through on its way to a storage or a machine. */
function carriesThrough(typeId: BuildingTypeId): boolean {
  return isBeltTypeId(typeId) || typeId === MERGER_BASIC_BUILDING_TYPE_ID;
}

/**
 * Belt throughput: every belt run (a chain of belt segments between two
 * non-belt nodes) carries at most its capacity per minute. Units still move
 * instantly from producer to destination; the cap is a token bucket per run,
 * refilled at the run's rate. A transfer passes when every run on its path
 * has at least one token, then takes one token per unit from each run (a
 * processor pulling several units at once may leave a run in debt, so the
 * average rate stays the capacity). A refused transfer leaves the unit with
 * its producer, which retries later: nothing is lost.
 */

/** Seconds of capacity a run can store, so batched extraction ticks are not clipped. */
export const BELT_BURST_SECONDS = 2;
/** A run refused a transfer this recently counts as saturated (map and panel). */
const SATURATED_FOR_SECONDS = 4;

export interface ThroughputView {
  readonly connectionsVersion: number;
  getBuilding(id: BuildingId): Building | undefined;
  getBuildings(): ReadonlyMap<BuildingId, Building>;
  getConnectionsOf(id: BuildingId): readonly Connection[];
}

export interface BeltRunStats {
  /** Tail segment of the run, its stable id. */
  readonly runId: BuildingId;
  readonly capacityPerMinute: number;
  /** A transfer was refused on this run within the last few seconds. */
  readonly saturated: boolean;
}

export class BeltThroughput {
  private topologyVersion = -1;
  private readonly runOf = new Map<BuildingId, BuildingId>();
  /** Items per second, by run id. */
  private readonly ratePerSecond = new Map<BuildingId, number>();
  private readonly tokens = new Map<BuildingId, number>();
  private readonly paths = new Map<BuildingId, readonly BuildingId[]>();
  private readonly blockedAt = new Map<BuildingId, number>();
  private clock = 0;

  private readonly view: ThroughputView;

  constructor(view: ThroughputView) {
    this.view = view;
  }

  /** Advances the buckets by `dt` seconds of simulation. */
  refill(dt: number): void {
    this.sync();
    this.clock += dt;
    for (const [runId, rate] of this.ratePerSecond) {
      const max = rate * BELT_BURST_SECONDS;
      this.tokens.set(runId, Math.min(max, (this.tokens.get(runId) ?? max) + rate * dt));
    }
  }

  /**
   * Moves one unit from each of `producers` along its downstream path, if
   * every run on the way has room. All or nothing: a refusal changes nothing
   * but marks the full runs as saturated.
   */
  tryPass(producers: readonly BuildingId[]): boolean {
    this.sync();
    const load = new Map<BuildingId, number>();
    for (const producer of producers) {
      for (const runId of this.pathOf(producer)) load.set(runId, (load.get(runId) ?? 0) + 1);
    }
    let blocked = false;
    for (const runId of load.keys()) {
      if (this.tokenCount(runId) >= 1 - 1e-9) continue;
      this.blockedAt.set(runId, this.clock);
      blocked = true;
    }
    if (blocked) return false;
    for (const [runId, units] of load) this.tokens.set(runId, this.tokenCount(runId) - units);
    return true;
  }

  /**
   * Steady-state rates once belt caps apply, for display: each run shares its
   * capacity among the producers sending through it, pro rata, and a producer
   * keeps the share of its most loaded run.
   */
  cappedRates(nominal: ReadonlyMap<BuildingId, number>): Map<BuildingId, number> {
    this.sync();
    const demand = new Map<BuildingId, number>();
    for (const [producer, perMinute] of nominal) {
      for (const runId of this.pathOf(producer)) demand.set(runId, (demand.get(runId) ?? 0) + perMinute);
    }
    const capped = new Map<BuildingId, number>();
    for (const [producer, perMinute] of nominal) {
      let factor = 1;
      for (const runId of this.pathOf(producer)) {
        const load = demand.get(runId) ?? 0;
        const capacity = (this.ratePerSecond.get(runId) ?? 0) * 60;
        if (load > capacity) factor = Math.min(factor, capacity / load);
      }
      capped.set(producer, perMinute * factor);
    }
    return capped;
  }

  statsFor(segmentId: BuildingId): BeltRunStats | null {
    this.sync();
    const runId = this.runOf.get(segmentId);
    if (runId === undefined) return null;
    const blockedAt = this.blockedAt.get(runId);
    return {
      runId,
      capacityPerMinute: (this.ratePerSecond.get(runId) ?? 0) * 60,
      saturated: blockedAt !== undefined && this.clock - blockedAt <= SATURATED_FOR_SECONDS,
    };
  }

  /** Segments of the runs refused a transfer recently, for the map overlay. */
  saturatedSegments(): BuildingId[] {
    this.sync();
    const saturated = new Set<BuildingId>();
    for (const [runId, at] of this.blockedAt) if (this.clock - at <= SATURATED_FOR_SECONDS) saturated.add(runId);
    if (saturated.size === 0) return [];
    return [...this.runOf].filter(([, runId]) => saturated.has(runId)).map(([segment]) => segment);
  }

  serialize(): { readonly id: BuildingId; readonly tokens: number }[] {
    this.sync();
    return [...this.tokens].map(([id, tokens]) => ({ id, tokens }));
  }

  restore(entries: readonly { readonly id: BuildingId; readonly tokens: number }[] | undefined): void {
    this.sync();
    for (const { id, tokens } of entries ?? []) {
      const rate = this.ratePerSecond.get(id);
      if (rate === undefined || !Number.isFinite(tokens)) continue;
      this.tokens.set(id, Math.min(rate * BELT_BURST_SECONDS, tokens));
    }
  }

  private tokenCount(runId: BuildingId): number {
    return this.tokens.get(runId) ?? (this.ratePerSecond.get(runId) ?? 0) * BELT_BURST_SECONDS;
  }

  private pathOf(producer: BuildingId): readonly BuildingId[] {
    let path = this.paths.get(producer);
    if (path) return path;
    const runs: BuildingId[] = [];
    const visited = new Set<BuildingId>([producer]);
    let current = this.next(producer);
    while (current !== null && !visited.has(current)) {
      visited.add(current);
      const building = this.view.getBuilding(current);
      // The unit stops at its destination (a storage or a machine): later belts are not on its way.
      if (!building || !carriesThrough(building.typeId)) break;
      const runId = this.runOf.get(current);
      if (runId !== undefined && this.ratePerSecond.has(runId) && runs[runs.length - 1] !== runId) runs.push(runId);
      current = this.next(current);
    }
    path = runs;
    this.paths.set(producer, path);
    return path;
  }

  /** The single building fed by `id`'s outputs, or null at a dead end or a fork. */
  private next(id: BuildingId): BuildingId | null {
    const outgoing = this.view.getConnectionsOf(id).filter((connection) => connection.from.building === id);
    return outgoing.length === 1 ? outgoing[0]!.to.building : null;
  }

  /** Rebuilds runs and paths after a connection change, keeping the tokens of runs that still exist. */
  private sync(): void {
    if (this.topologyVersion === this.view.connectionsVersion) return;
    this.topologyVersion = this.view.connectionsVersion;
    this.runOf.clear();
    this.paths.clear();
    const rates = new Map<BuildingId, number>();

    const belts = [...this.view.getBuildings().values()].filter((building) => isBeltTypeId(building.typeId));
    for (const belt of belts) {
      // Follow the chain downstream to its tail: the last belt before a non-belt node.
      const chain: BuildingId[] = [];
      let current: BuildingId = belt.id;
      let tail: BuildingId | undefined;
      while (true) {
        const known = this.runOf.get(current);
        if (known !== undefined) {
          tail = known;
          break;
        }
        chain.push(current);
        const next = this.next(current);
        const nextBuilding = next === null ? undefined : this.view.getBuilding(next);
        if (!nextBuilding || !isBeltTypeId(nextBuilding.typeId) || chain.includes(next!)) {
          tail = current;
          break;
        }
        current = next!;
      }
      for (const segment of chain) this.runOf.set(segment, tail);
    }

    for (const belt of belts) {
      const runId = this.runOf.get(belt.id)!;
      const perMinute = getBuildingType(belt.typeId)?.beltCapacityPerMinute ?? Infinity;
      rates.set(runId, Math.min(rates.get(runId) ?? Infinity, perMinute / 60));
    }

    this.ratePerSecond.clear();
    for (const [runId, rate] of rates) {
      if (Number.isFinite(rate)) this.ratePerSecond.set(runId, rate);
    }
    for (const runId of [...this.tokens.keys()]) {
      if (!this.ratePerSecond.has(runId)) this.tokens.delete(runId);
    }
    for (const runId of [...this.blockedAt.keys()]) {
      if (!this.ratePerSecond.has(runId)) this.blockedAt.delete(runId);
    }
  }
}
