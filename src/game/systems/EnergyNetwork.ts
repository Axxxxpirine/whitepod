import type { BuildingId } from '../types';

export class EnergyNetwork {
  private readonly adjacency = new Map<BuildingId, Set<BuildingId>>();
  private versionValue = 0;
  private readonly componentForCache = new Map<BuildingId, readonly BuildingId[]>();
  private componentsCache: readonly (readonly BuildingId[])[] | null = null;

  get version(): number {
    return this.versionValue;
  }

  registerBuilding(id: BuildingId): void {
    if (!this.adjacency.has(id)) {
      this.adjacency.set(id, new Set());
      this.invalidateCaches();
    }
  }

  unregisterBuilding(id: BuildingId): void {
    const neighbors = this.adjacency.get(id);
    if (!neighbors) return;

    for (const neighborId of neighbors) {
      this.adjacency.get(neighborId)?.delete(id);
    }
    this.adjacency.delete(id);
    this.invalidateCaches();
  }

  connect(a: BuildingId, b: BuildingId): boolean {
    if (a === b) return false;

    const aNeighbors = this.adjacency.get(a);
    const bNeighbors = this.adjacency.get(b);
    if (!aNeighbors || !bNeighbors) return false;

    const before = aNeighbors.size;
    aNeighbors.add(b);
    bNeighbors.add(a);
    const changed = aNeighbors.size !== before;
    if (changed) {
      this.invalidateCaches();
    }
    return changed;
  }

  disconnect(a: BuildingId, b: BuildingId): boolean {
    if (a === b) return false;

    const aNeighbors = this.adjacency.get(a);
    const bNeighbors = this.adjacency.get(b);
    if (!aNeighbors || !bNeighbors) return false;
    if (!aNeighbors.has(b) || !bNeighbors.has(a)) return false;

    aNeighbors.delete(b);
    bNeighbors.delete(a);
    this.invalidateCaches();
    return true;
  }

  isConnected(a: BuildingId, b: BuildingId): boolean {
    return this.adjacency.get(a)?.has(b) ?? false;
  }

  getComponentFor(startId: BuildingId): BuildingId[] {
    if (!this.adjacency.has(startId)) return [];
    const cached = this.componentForCache.get(startId);
    if (cached) {
      return [...cached];
    }

    const component = this.computeComponentFor(startId);
    const frozenComponent = Object.freeze([...component]);
    for (const member of frozenComponent) {
      this.componentForCache.set(member, frozenComponent);
    }
    return [...frozenComponent];
  }

  getNeighbors(id: BuildingId): BuildingId[] {
    const neighbors = this.adjacency.get(id);
    if (!neighbors) return [];
    return Array.from(neighbors.values());
  }

  getComponents(): BuildingId[][] {
    if (this.componentsCache) {
      return this.componentsCache.map((component) => [...component]);
    }

    const visited = new Set<BuildingId>();
    const components: BuildingId[][] = [];

    for (const id of this.adjacency.keys()) {
      if (visited.has(id)) continue;
      const component = this.computeComponentFor(id);
      const frozenComponent = Object.freeze([...component]);
      for (const member of component) {
        visited.add(member);
        this.componentForCache.set(member, frozenComponent);
      }
      components.push([...frozenComponent]);
    }

    this.componentsCache = components.map((component) => Object.freeze([...component]));
    return components;
  }

  private computeComponentFor(startId: BuildingId): BuildingId[] {
    const visited = new Set<BuildingId>();
    const queue: BuildingId[] = [startId];
    visited.add(startId);

    for (let i = 0; i < queue.length; i++) {
      const current = queue[i];
      const neighbors = this.adjacency.get(current);
      if (!neighbors) continue;

      for (const next of neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    return queue;
  }

  private invalidateCaches(): void {
    this.versionValue += 1;
    this.componentForCache.clear();
    this.componentsCache = null;
  }
}
