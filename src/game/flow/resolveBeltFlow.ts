import {
  EXTRACTOR_BUILDING_TYPE_ID,
  EXTRACTOR_RATE_PER_MIN,
  SPLITTER_BASIC_BUILDING_TYPE_ID,
  carriesFlowThrough,
  isProcessorTypeId,
} from '../data/buildingCatalog';
import { getRecipe } from '../data/recipeCatalog';
import type { GameEngine } from '../engine/GameEngine';
import { ResourceType, type BuildingId, type ResourceType as ResourceTypeT } from '../types';

export interface BeltFlowEntry {
  readonly resourceType: ResourceTypeT;
  readonly ratePerMinute: number;
  readonly sources: ReadonlyArray<BuildingId>;
}

/**
 * Walk upstream from a belt through belts, mergers and splitters, collect every powered
 * extractor reachable, and aggregate their throughput per resource type.
 *
 * Returns entries in insertion order (deterministic) with deduplicated sources.
 */
export function resolveBeltFlow(engine: GameEngine, beltId: BuildingId): BeltFlowEntry[] {
  const visited = new Set<BuildingId>();
  // Each entry carries the share of upstream flow reaching the belt: a splitter
  // divides what passes through it evenly among its connected outputs.
  const queue: { id: BuildingId; share: number }[] = [{ id: beltId, share: 1 }];
  const byResource = new Map<ResourceTypeT, { rate: number; sources: Set<BuildingId> }>();

  while (queue.length > 0) {
    const { id: current, share } = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    for (const connection of engine.getConnectionsOf(current)) {
      if (connection.to.building !== current) continue;

      const upstream = engine.getBuildings().get(connection.from.building);
      if (!upstream) continue;

      if (upstream.typeId === EXTRACTOR_BUILDING_TYPE_ID) {
        if (engine.getBuildingPowerState(upstream.id) !== 'powered') continue;
        if (engine.getDepositRemaining(upstream.id) === 0) continue;
        const resource = engine.getResourceAt(upstream.origin.x, upstream.origin.y);
        if (resource === ResourceType.None) continue;
        let entry = byResource.get(resource);
        if (!entry) {
          entry = { rate: 0, sources: new Set() };
          byResource.set(resource, entry);
        }
        if (!entry.sources.has(upstream.id)) {
          entry.sources.add(upstream.id);
          entry.rate += EXTRACTOR_RATE_PER_MIN * share;
        }
        continue;
      }

      // Processors (converter/synthesizer) act as sources — do NOT traverse upstream through them
      if (isProcessorTypeId(upstream.typeId)) {
        if (engine.getBuildingPowerState(upstream.id) !== 'powered') continue;
        const state = engine.getProcessorState(upstream.id);
        if (!state?.recipeId) continue;
        const logistics = engine.getProcessorLogisticsStatus(upstream.id);
        if (!logistics || logistics.badInput || logistics.missingInput || logistics.blockedOutput) continue;
        const recipe = getRecipe(state.recipeId);
        if (!recipe) continue;
        const resource = recipe.output.resourceType;
        const rate = (recipe.output.amount / recipe.cycleSeconds) * 60;
        let entry = byResource.get(resource);
        if (!entry) {
          entry = { rate: 0, sources: new Set() };
          byResource.set(resource, entry);
        }
        if (!entry.sources.has(upstream.id)) {
          entry.sources.add(upstream.id);
          entry.rate += rate * share;
        }
        continue;
      }

      if (upstream.typeId === SPLITTER_BASIC_BUILDING_TYPE_ID) {
        const outputs = engine.getConnectionsOf(upstream.id).filter((c) => c.from.building === upstream.id).length;
        queue.push({ id: upstream.id, share: share / Math.max(1, outputs) });
      } else if (carriesFlowThrough(upstream.typeId)) {
        queue.push({ id: upstream.id, share });
      }
    }
  }

  return [...byResource.entries()].map(([resourceType, { rate, sources }]) => ({
    resourceType,
    ratePerMinute: rate,
    sources: [...sources],
  }));
}
