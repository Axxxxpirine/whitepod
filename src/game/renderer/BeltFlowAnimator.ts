import { Container, Sprite, type Application } from 'pixi.js';
import { TILE_SIZE } from '../constants';
import { getBuildingType, isBeltTypeId } from '../data/buildingCatalog';
import { worldSideOf } from '../data/ConnectionRegistry';
import type { GameEngine } from '../engine/GameEngine';
import { resolveBeltFlow } from '../flow/resolveBeltFlow';
import { Direction, PortKind, type Building, type BuildingId, type ResourceType as ResourceTypeT } from '../types';
import { getResourceTexture } from './TileSprite';
import { BELT_INSET } from './BeltRenderer';

const ITEM_SIZE = Math.round(TILE_SIZE * 0.52);
const SPEED_TILES_PER_MS = 1 / 1000;
const MAX_VISUAL_SPRITES_PER_COMPONENT = 24;
const KEY_SPACE_PER_COMPONENT = 64;

interface Point {
  x: number;
  y: number;
}

interface BeltGeometry {
  readonly inPoint: Point;
  readonly center: Point;
  readonly outPoint: Point;
}

interface FlowComponent {
  readonly componentId: BuildingId;
  readonly orderedBeltIds: readonly BuildingId[];
  readonly orderedPathPoints: readonly Point[];
  readonly cumulativeLengths: readonly number[];
  readonly pathLength: number;
  readonly totalRatePerMinute: number;
  readonly resourceTypes: ReadonlyArray<ResourceTypeT>;
  visualCount: number;
  phase: number;
  textureIndex: number;
}

export class BeltFlowAnimator {
  private readonly particleContainer: Container;
  private readonly engine: GameEngine;
  private readonly spritePool: Sprite[] = [];
  // key = componentId * KEY_SPACE_PER_COMPONENT + slot
  private readonly activeSprites: Map<number, Sprite> = new Map();
  private readonly wantedSpriteKeys: Set<number> = new Set();
  private flowComponents: Map<BuildingId, FlowComponent> = new Map();
  private readonly positionScratch: Point = { x: 0, y: 0 };
  private worldDirty = true;
  private readonly unsubscribeEngine: () => void;

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.particleContainer = new Container();
    app.stage.addChild(this.particleContainer);
    this.unsubscribeEngine = engine.subscribe((kind) => {
      if (kind === 'world') this.worldDirty = true;
    });
  }

  update(deltaMS: number): void {
    if (this.worldDirty) {
      this.rebuildFlowComponents();
      this.worldDirty = false;
    }

    const step = deltaMS * SPEED_TILES_PER_MS * TILE_SIZE;
    for (const component of this.flowComponents.values()) {
      component.visualCount = this.computeVisualCount(component.pathLength, component.totalRatePerMinute);
      if (component.pathLength <= 0 || component.resourceTypes.length === 0 || component.visualCount <= 0) continue;

      component.phase += step;
      if (component.phase >= component.pathLength) {
        const wraps = Math.floor(component.phase / component.pathLength);
        component.phase %= component.pathLength;
        component.textureIndex += wraps;
      }
    }
  }

  render(): void {
    const { viewport } = this.engine;
    const visibleRange = this.engine.getVisibleTiles();

    this.particleContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.particleContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.particleContainer.scale.set(viewport.zoom);

    const wanted = this.wantedSpriteKeys;
    wanted.clear();

    for (const component of this.flowComponents.values()) {
      if (component.resourceTypes.length === 0 || component.pathLength <= 0 || component.visualCount <= 0) continue;
      const spacing = component.pathLength / component.visualCount;

      for (let slot = 0; slot < component.visualCount; slot++) {
        const key = component.componentId * KEY_SPACE_PER_COMPONENT + slot;
        const distance = (component.phase + slot * spacing) % component.pathLength;
        this.samplePathPosition(component, distance, this.positionScratch);
        const tileX = Math.floor(this.positionScratch.x / TILE_SIZE);
        const tileY = Math.floor(this.positionScratch.y / TILE_SIZE);
        if (
          tileX < visibleRange.x0 ||
          tileX > visibleRange.x1 ||
          tileY < visibleRange.y0 ||
          tileY > visibleRange.y1
        ) {
          continue;
        }

        wanted.add(key);

        let sprite = this.activeSprites.get(key);
        if (!sprite) {
          sprite = this.acquireSprite();
          this.particleContainer.addChild(sprite);
          this.activeSprites.set(key, sprite);
        }

        const resourceType = component.resourceTypes[(component.textureIndex + slot) % component.resourceTypes.length];
        const texture = getResourceTexture(resourceType);
        if (texture && sprite.texture !== texture) {
          sprite.texture = texture;
        }

        sprite.x = this.positionScratch.x - ITEM_SIZE / 2;
        sprite.y = this.positionScratch.y - ITEM_SIZE / 2;
        sprite.visible = true;
      }
    }

    for (const [key, sprite] of this.activeSprites) {
      if (wanted.has(key)) continue;
      this.releaseSprite(key, sprite);
    }
  }

  destroy(): void {
    this.unsubscribeEngine();
    this.particleContainer.destroy({ children: true });
    this.spritePool.length = 0;
    this.activeSprites.clear();
    this.flowComponents.clear();
  }

  private rebuildFlowComponents(): void {
    const buildings = this.engine.getBuildings();
    const beltIds = new Set<BuildingId>();
    const beltGeometry = new Map<BuildingId, BeltGeometry>();
    const upstream = new Map<BuildingId, Set<BuildingId>>();
    const downstream = new Map<BuildingId, Set<BuildingId>>();
    const neighbors = new Map<BuildingId, Set<BuildingId>>();

    for (const building of buildings.values()) {
      if (!isBeltTypeId(building.typeId)) continue;
      const geometry = this.buildBeltGeometry(building);
      if (!geometry) continue;
      beltIds.add(building.id);
      beltGeometry.set(building.id, geometry);
      neighbors.set(building.id, new Set<BuildingId>());
    }

    for (const connection of this.engine.getConnections().values()) {
      const fromId = connection.from.building;
      const toId = connection.to.building;
      if (!beltIds.has(fromId) || !beltIds.has(toId)) continue;

      let down = downstream.get(fromId);
      if (!down) {
        down = new Set<BuildingId>();
        downstream.set(fromId, down);
      }
      down.add(toId);

      let up = upstream.get(toId);
      if (!up) {
        up = new Set<BuildingId>();
        upstream.set(toId, up);
      }
      up.add(fromId);

      neighbors.get(fromId)!.add(toId);
      neighbors.get(toId)!.add(fromId);
    }

    const previous = this.flowComponents;
    const next = new Map<BuildingId, FlowComponent>();
    const visited = new Set<BuildingId>();

    for (const startId of beltIds) {
      if (visited.has(startId)) continue;

      const componentBelts: BuildingId[] = [];
      const queue: BuildingId[] = [startId];
      visited.add(startId);

      let cursor = 0;
      while (cursor < queue.length) {
        const currentId = queue[cursor++];
        componentBelts.push(currentId);
        const linked = neighbors.get(currentId);
        if (!linked) continue;
        for (const neighborId of linked) {
          if (visited.has(neighborId)) continue;
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }

      componentBelts.sort((a, b) => a - b);
      const componentSet = new Set(componentBelts);
      const componentId = componentBelts[0]!;

      const sinkCandidates = componentBelts.filter(
        (id) => (downstream.get(id)?.size ?? 0) === 0,
      );
      const sinkId = (sinkCandidates.length > 0 ? sinkCandidates : componentBelts)[0]!;

      const reversePath: BuildingId[] = [];
      const pathSeen = new Set<BuildingId>();
      let currentId: BuildingId | null = sinkId;
      while (currentId !== null && !pathSeen.has(currentId)) {
        pathSeen.add(currentId);
        reversePath.push(currentId);

        const candidates: BuildingId[] = [];
        const upstreamIds = upstream.get(currentId);
        if (upstreamIds) {
          for (const id of upstreamIds) {
            if (componentSet.has(id)) {
              candidates.push(id);
            }
          }
        }
        if (candidates.length === 0) {
          currentId = null;
        } else {
          candidates.sort((a, b) => a - b);
          currentId = candidates[0]!;
        }
      }

      const orderedBeltIds = reversePath.reverse();
      const orderedPathPoints: Point[] = [];
      for (const beltId of orderedBeltIds) {
        const geometry = beltGeometry.get(beltId);
        if (!geometry) continue;
        orderedPathPoints.push(
          { x: geometry.inPoint.x, y: geometry.inPoint.y },
          { x: geometry.center.x, y: geometry.center.y },
          { x: geometry.outPoint.x, y: geometry.outPoint.y },
        );
      }

      const cumulativeLengths: number[] = [0];
      for (let i = 1; i < orderedPathPoints.length; i++) {
        const prevPoint = orderedPathPoints[i - 1]!;
        const currentPoint = orderedPathPoints[i]!;
        const segment = Math.hypot(currentPoint.x - prevPoint.x, currentPoint.y - prevPoint.y);
        cumulativeLengths.push(cumulativeLengths[i - 1]! + segment);
      }

      const pathLength = cumulativeLengths[cumulativeLengths.length - 1] ?? 0;
      const sinkFlowEntries = resolveBeltFlow(this.engine, sinkId);
      const resourceTypes = sinkFlowEntries.map((entry) => entry.resourceType);
      const totalRatePerMinute = sinkFlowEntries.reduce((sum, entry) => sum + entry.ratePerMinute, 0);

      const prev = previous.get(componentId);
      const phase = prev && pathLength > 0 ? prev.phase % pathLength : 0;
      const textureIndex = prev?.textureIndex ?? 0;
      const visualCount = this.computeVisualCount(pathLength, totalRatePerMinute);

      next.set(componentId, {
        componentId,
        orderedBeltIds,
        orderedPathPoints,
        cumulativeLengths,
        pathLength,
        totalRatePerMinute,
        resourceTypes,
        visualCount,
        phase,
        textureIndex,
      });
    }

    this.flowComponents = next;
  }

  private computeVisualCount(pathLength: number, totalRatePerMinute: number): number {
    if (pathLength <= 0 || totalRatePerMinute <= 0) return 0;

    const travelSeconds = pathLength / TILE_SIZE;
    const expectedInTransit = (totalRatePerMinute / 60) * travelSeconds;
    return Math.max(1, Math.min(MAX_VISUAL_SPRITES_PER_COMPONENT, Math.ceil(expectedInTransit)));
  }

  private buildBeltGeometry(building: Building): BeltGeometry | null {
    const type = getBuildingType(building.typeId);
    if (!type) return null;

    const input = type.ports.find((port) => port.kind === PortKind.Input);
    const output = type.ports.find((port) => port.kind === PortKind.Output);
    if (!input || !output) return null;

    const baseX = building.origin.x * TILE_SIZE;
    const baseY = building.origin.y * TILE_SIZE;
    const inPoint = this.edgePoint(baseX, baseY, worldSideOf(input, building.rotation));
    const outPoint = this.edgePoint(baseX, baseY, worldSideOf(output, building.rotation));
    const center = {
      x: baseX + TILE_SIZE / 2,
      y: baseY + TILE_SIZE / 2,
    };

    return { inPoint, center, outPoint };
  }

  private samplePathPosition(component: FlowComponent, distance: number, out: Point): void {
    const points = component.orderedPathPoints;
    const cumulative = component.cumulativeLengths;
    if (points.length === 0) {
      out.x = 0;
      out.y = 0;
      return;
    }
    if (points.length === 1 || component.pathLength <= 0) {
      out.x = points[0]!.x;
      out.y = points[0]!.y;
      return;
    }

    const d = Math.max(0, Math.min(distance, component.pathLength));

    let segmentIndex = 1;
    while (segmentIndex < cumulative.length && cumulative[segmentIndex]! < d) {
      segmentIndex++;
    }
    segmentIndex = Math.min(segmentIndex, cumulative.length - 1);

    const segStartDistance = cumulative[segmentIndex - 1]!;
    const segEndDistance = cumulative[segmentIndex]!;
    const segLength = segEndDistance - segStartDistance;

    const from = points[segmentIndex - 1]!;
    const to = points[segmentIndex]!;

    if (segLength <= 0) {
      out.x = to.x;
      out.y = to.y;
      return;
    }

    const t = (d - segStartDistance) / segLength;
    out.x = from.x + (to.x - from.x) * t;
    out.y = from.y + (to.y - from.y) * t;
  }

  private edgePoint(baseX: number, baseY: number, side: Direction): Point {
    const centerX = baseX + TILE_SIZE / 2;
    const centerY = baseY + TILE_SIZE / 2;
    const edgeOffset = TILE_SIZE / 2 - BELT_INSET;

    switch (side) {
      case Direction.North:
        return { x: centerX, y: centerY - edgeOffset };
      case Direction.East:
        return { x: centerX + edgeOffset, y: centerY };
      case Direction.South:
        return { x: centerX, y: centerY + edgeOffset };
      case Direction.West:
        return { x: centerX - edgeOffset, y: centerY };
    }
  }

  private acquireSprite(): Sprite {
    const sprite = this.spritePool.pop() ?? new Sprite();
    sprite.width = ITEM_SIZE;
    sprite.height = ITEM_SIZE;
    sprite.visible = true;
    return sprite;
  }

  private releaseSprite(key: number, sprite: Sprite): void {
    this.particleContainer.removeChild(sprite);
    sprite.visible = false;
    this.spritePool.push(sprite);
    this.activeSprites.delete(key);
  }
}
