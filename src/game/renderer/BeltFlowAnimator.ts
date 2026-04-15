import { Container, Sprite, type Application } from 'pixi.js';
import { TILE_SIZE } from '../constants';
import { getBuildingType, isBeltTypeId } from '../data/buildingCatalog';
import { worldSideOf } from '../data/ConnectionRegistry';
import type { GameEngine } from '../engine/GameEngine';
import { resolveBeltFlow } from '../flow/resolveBeltFlow';
import { Direction, PortKind, type Building, type BuildingId, type ResourceType as ResourceTypeT } from '../types';
import { getResourceTexture } from './TileSprite';
import { BELT_INSET } from './BeltRenderer';

const PARTICLE_SIZE = Math.round(TILE_SIZE * 0.7); // ~22px — 30% smaller than tile
// Maximum particle slots per belt — equals the number of distinct real resource
// types (Coal, IronOre, CopperOre). Capped at 4 to keep the key scheme safe.
const MAX_PARTICLES_PER_BELT = 4;
const DEFAULT_PARTICLES_PER_BELT = 2;
const SPEED = 1 / 1000; // 1 full tile traversal per second (progress units per ms)

interface Point {
  readonly x: number;
  readonly y: number;
}

interface BeltFlowData {
  readonly building: Building;
  /** All distinct resource types flowing through this belt (empty = nothing, render no particles). */
  readonly resourceTypes: ReadonlyArray<ResourceTypeT>;
  readonly inPoint: Point;
  readonly center: Point;
  readonly outPoint: Point;
  readonly phaseOffset: number; // [0, 1) — deterministic stagger per belt
}

interface ActiveParticle {
  sprite: Sprite;
  beltId: BuildingId;
  slot: number;
}

export class BeltFlowAnimator {
  private readonly particleContainer: Container;
  private readonly engine: GameEngine;
  private readonly spritePool: Sprite[] = [];
  // key = beltId * MAX_PARTICLES_PER_BELT + slot
  private readonly activeParticles: Map<number, ActiveParticle> = new Map();
  private flowCache: Map<BuildingId, BeltFlowData> = new Map();
  // per-belt animation progress; length matches current slotCount for that belt
  private readonly progress: Map<BuildingId, number[]> = new Map();
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
      this.rebuildFlowCache();
      this.worldDirty = false;
    }

    const step = deltaMS * SPEED;

    for (const [beltId, data] of this.flowCache) {
      if (data.resourceTypes.length === 0) continue;

      const slotCount = Math.min(
        Math.max(DEFAULT_PARTICLES_PER_BELT, data.resourceTypes.length),
        MAX_PARTICLES_PER_BELT,
      );

      let slots = this.progress.get(beltId);
      if (!slots || slots.length !== slotCount) {
        // Initialize or reinitialize when slot count changes (e.g. resource added/removed).
        slots = Array.from({ length: slotCount }, (_, i) => (data.phaseOffset + i / slotCount) % 1.0);
        this.progress.set(beltId, slots);
      }
      for (let i = 0; i < slotCount; i++) {
        slots[i] = (slots[i] + step) % 1.0;
      }
    }

    // Remove progress for belts no longer in cache
    for (const beltId of this.progress.keys()) {
      if (!this.flowCache.has(beltId)) {
        this.progress.delete(beltId);
      }
    }
  }

  render(): void {
    const { viewport } = this.engine;
    const visibleRange = this.engine.getVisibleTiles();

    this.particleContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.particleContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.particleContainer.scale.set(viewport.zoom);

    const wantedParticles = new Set<number>();

    for (const [beltId, data] of this.flowCache) {
      if (data.resourceTypes.length === 0) continue;
      const { origin } = data.building;
      if (
        origin.x < visibleRange.x0 ||
        origin.x > visibleRange.x1 ||
        origin.y < visibleRange.y0 ||
        origin.y > visibleRange.y1
      ) continue;

      const slots = this.progress.get(beltId);
      if (!slots) continue;

      for (let slot = 0; slot < slots.length; slot++) {
        wantedParticles.add(beltId * MAX_PARTICLES_PER_BELT + slot);
      }
    }

    // Release sprites no longer needed
    for (const [key, particle] of this.activeParticles) {
      if (!wantedParticles.has(key)) {
        this.releaseSprite(particle.sprite);
        this.activeParticles.delete(key);
      }
    }

    // Update or acquire sprites for wanted particles
    for (const key of wantedParticles) {
      const beltId = Math.floor(key / MAX_PARTICLES_PER_BELT);
      const slot = key % MAX_PARTICLES_PER_BELT;
      const data = this.flowCache.get(beltId)!;
      const slots = this.progress.get(beltId)!;
      const t = slots[slot];
      const pos = this.interpolatePath(data, t);
      // Each slot cycles through the available resource types so a belt carrying
      // coal+iron shows alternating coal/iron particles.
      const resourceType = data.resourceTypes[slot % data.resourceTypes.length];

      const existing = this.activeParticles.get(key);
      let particle: ActiveParticle;
      if (!existing) {
        const sprite = this.acquireSprite(resourceType);
        this.particleContainer.addChild(sprite);
        particle = { sprite, beltId, slot };
        this.activeParticles.set(key, particle);
      } else {
        const texture = getResourceTexture(resourceType);
        if (texture && existing.sprite.texture !== texture) {
          existing.sprite.texture = texture;
        }
        particle = existing;
      }

      particle.sprite.x = pos.x - PARTICLE_SIZE / 2;
      particle.sprite.y = pos.y - PARTICLE_SIZE / 2;
    }
  }

  destroy(): void {
    this.unsubscribeEngine();
    this.particleContainer.destroy({ children: true });
    this.spritePool.length = 0;
    this.activeParticles.clear();
    this.flowCache.clear();
    this.progress.clear();
  }

  private rebuildFlowCache(): void {
    const newCache = new Map<BuildingId, BeltFlowData>();

    for (const building of this.engine.getBuildings().values()) {
      if (!isBeltTypeId(building.typeId)) continue;

      const type = getBuildingType(building.typeId);
      if (!type) continue;

      const input = type.ports.find((p) => p.kind === PortKind.Input);
      const output = type.ports.find((p) => p.kind === PortKind.Output);
      if (!input || !output) continue;

      const baseX = building.origin.x * TILE_SIZE;
      const baseY = building.origin.y * TILE_SIZE;
      const center: Point = { x: baseX + TILE_SIZE / 2, y: baseY + TILE_SIZE / 2 };
      const inSide = worldSideOf(input, building.rotation);
      const outSide = worldSideOf(output, building.rotation);
      const inPoint = this.edgePoint(baseX, baseY, inSide);
      const outPoint = this.edgePoint(baseX, baseY, outSide);

      const resourceTypes = resolveBeltFlow(this.engine, building.id).map((e) => e.resourceType);
      // Deterministic stagger: golden ratio hash of building ID
      const phaseOffset = (building.id * 0.618033988749) % 1.0;

      newCache.set(building.id, { building, resourceTypes, inPoint, center, outPoint, phaseOffset });
    }

    // Remove progress for belts that disappeared
    for (const beltId of this.progress.keys()) {
      if (!newCache.has(beltId)) {
        this.progress.delete(beltId);
      }
    }

    this.flowCache = newCache;
  }

  private edgePoint(baseX: number, baseY: number, side: Direction): Point {
    const centerX = baseX + TILE_SIZE / 2;
    const centerY = baseY + TILE_SIZE / 2;
    const edgeOffset = TILE_SIZE / 2 - BELT_INSET - 1;

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

  private interpolatePath(data: BeltFlowData, t: number): Point {
    if (t < 0.5) {
      const u = t * 2;
      return {
        x: data.inPoint.x + (data.center.x - data.inPoint.x) * u,
        y: data.inPoint.y + (data.center.y - data.inPoint.y) * u,
      };
    } else {
      const u = (t - 0.5) * 2;
      return {
        x: data.center.x + (data.outPoint.x - data.center.x) * u,
        y: data.center.y + (data.outPoint.y - data.center.y) * u,
      };
    }
  }

  private acquireSprite(resourceType: ResourceTypeT): Sprite {
    const sprite = this.spritePool.pop() ?? new Sprite();
    const texture = getResourceTexture(resourceType);
    if (texture) sprite.texture = texture;
    sprite.width = PARTICLE_SIZE;
    sprite.height = PARTICLE_SIZE;
    sprite.visible = true;
    return sprite;
  }

  private releaseSprite(sprite: Sprite): void {
    this.particleContainer.removeChild(sprite);
    sprite.visible = false;
    this.spritePool.push(sprite);
  }
}
