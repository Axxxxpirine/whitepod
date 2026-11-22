import { getBuildingType, isBeltTypeId } from '../data/buildingCatalog';
import type { Building, BuildingId, Connection } from '../types';

/** The belts, mergers and splitters a unit crosses (a FlowRoute's `nodes`). */
export type FlowPath = readonly BuildingId[];

/**
 * Belt throughput: every belt run (a chain of belt segments between two
 * non-belt nodes) carries at most its capacity per minute. Units still move
 * instantly from producer to destination along a route (flow/processorLogistics
 * resolveRoutesFromOutput); the cap is a token bucket per run, refilled at the
 * run's rate. A transfer passes when every run on its path has at least one token, then takes one token per unit from each run (a
 * processor pulling several units at once may leave a run in debt, so the
 * average rate stays the capacity). A refused transfer leaves the unit with
 * its producer, which retries later: nothing is lost.
 */

/** Seconds of capacity a run can store, so batched extraction ticks are not clipped. */
export const BELT_BURST_SECONDS = 2;
/** A run refused a transfer this recently counts as saturated (map and panel). */
const SATURATED_FOR_SECONDS = 4;

export interface ThroughputView {
  /** Changes whenever connections or belt types change (an upgrade keeps the connections). */
  topologyKey(): string;
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
  private topologyKey: string | null = null;
  private readonly runOf = new Map<BuildingId, BuildingId>();
  /** Items per second, by run id. */
  private readonly ratePerSecond = new Map<BuildingId, number>();
  private readonly tokens = new Map<BuildingId, number>();
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
   * Moves one unit along each of `paths` if every run on the way has room.
   * All or nothing: a refusal changes nothing but marks the full runs as saturated.
   */
  tryPass(paths: readonly FlowPath[]): boolean {
    const load = this.loadOf(paths);
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

  /** Whether `tryPass(paths)` would succeed now, without moving anything. */
  canPass(paths: readonly FlowPath[]): boolean {
    for (const runId of this.loadOf(paths).keys()) {
      if (this.tokenCount(runId) < 1 - 1e-9) return false;
    }
    return true;
  }

  private loadOf(paths: readonly FlowPath[]): Map<BuildingId, number> {
    this.sync();
    const load = new Map<BuildingId, number>();
    for (const path of paths) {
      for (const runId of this.runsOn(path)) load.set(runId, (load.get(runId) ?? 0) + 1);
    }
    return load;
  }

  /** Capped runs a path crosses, each once. */
  private runsOn(path: FlowPath): BuildingId[] {
    const runs: BuildingId[] = [];
    for (const node of path) {
      const runId = this.runOf.get(node);
      if (runId !== undefined && this.ratePerSecond.has(runId) && !runs.includes(runId)) runs.push(runId);
    }
    return runs;
  }

  /**
   * Steady-state rates once belt caps apply, for display: each run shares its
   * capacity among the flows crossing it, pro rata, and a flow keeps the share
   * of its most loaded run. Returns the capped rate of each flow, in order.
   */
  cappedRates(flows: readonly { readonly path: FlowPath; readonly perMinute: number }[]): number[] {
    this.sync();
    const demand = new Map<BuildingId, number>();
    for (const { path, perMinute } of flows) {
      for (const runId of this.runsOn(path)) demand.set(runId, (demand.get(runId) ?? 0) + perMinute);
    }
    return flows.map(({ path, perMinute }) => {
      let factor = 1;
      for (const runId of this.runsOn(path)) {
        const load = demand.get(runId) ?? 0;
        const capacity = (this.ratePerSecond.get(runId) ?? 0) * 60;
        if (load > capacity) factor = Math.min(factor, capacity / load);
      }
      return perMinute * factor;
    });
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

  /** The single building fed by `id`'s outputs, or null at a dead end or a fork. */
  private next(id: BuildingId): BuildingId | null {
    const outgoing = this.view.getConnectionsOf(id).filter((connection) => connection.from.building === id);
    return outgoing.length === 1 ? outgoing[0]!.to.building : null;
  }

  /** Rebuilds runs and paths after a connection change, keeping the tokens of runs that still exist. */
  private sync(): void {
    const key = this.view.topologyKey();
    if (this.topologyKey === key) return;
    this.topologyKey = key;
    this.runOf.clear();
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
