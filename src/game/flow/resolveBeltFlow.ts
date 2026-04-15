import {
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
  MERGER_BASIC_BUILDING_TYPE_ID,
  isBeltTypeId,
} from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import { ResourceType, type BuildingId, type ResourceType as ResourceTypeT } from '../types';

export interface BeltFlowEntry {
  readonly resourceType: ResourceTypeT;
  readonly ratePerMinute: number;
  readonly sources: ReadonlyArray<BuildingId>;
}

/**
 * Walk upstream from a belt through belts + mergers, collect every powered
 * extractor reachable, and aggregate their throughput per resource type.
 *
 * Returns entries in insertion order (deterministic) with deduplicated sources.
 */
export function resolveBeltFlow(engine: GameEngine, beltId: BuildingId): BeltFlowEntry[] {
  const visited = new Set<BuildingId>();
  const queue: BuildingId[] = [beltId];
  const byResource = new Map<ResourceTypeT, { rate: number; sources: Set<BuildingId> }>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const connection of engine.getConnectionsOf(current)) {
      if (connection.to.building !== current) continue;

      const upstream = engine.getBuildings().get(connection.from.building);
      if (!upstream) continue;

      if (upstream.typeId === EXTRACTOR_BUILDING_TYPE_ID) {
        if (engine.getBuildingPowerState(upstream.id) !== 'powered') continue;
        const resource = engine.getResourceAt(upstream.origin.x, upstream.origin.y);
        if (resource === ResourceType.None) continue;
        let entry = byResource.get(resource);
        if (!entry) {
          entry = { rate: 0, sources: new Set() };
          byResource.set(resource, entry);
        }
        if (!entry.sources.has(upstream.id)) {
          entry.sources.add(upstream.id);
          entry.rate += EXTRACTOR_RATE_PER_MIN;
        }
        continue;
      }

      if (isBeltTypeId(upstream.typeId) || upstream.typeId === MERGER_BASIC_BUILDING_TYPE_ID) {
        queue.push(upstream.id);
      }
    }
  }

  return [...byResource.entries()].map(([resourceType, { rate, sources }]) => ({
    resourceType,
    ratePerMinute: rate,
    sources: [...sources],
  }));
}
