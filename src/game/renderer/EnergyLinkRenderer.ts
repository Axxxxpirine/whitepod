import { Container, Graphics, type Application } from 'pixi.js';
import { createWorldLayer } from './worldLayer';
import { TILE_SIZE } from '../constants';
import { getBuildingType } from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type { Building, EnergyNetworkStats } from '../types';
import { PIXI } from '@/design/tokens';

interface LinkPreviewState {
  readonly mode: EnergyLinkMode;
  readonly pendingSourceId: number | null;
  readonly mouseWorldPos: { x: number; y: number } | null;
}

export type EnergyLinkMode = 'normal' | 'energy_link';

export interface EnergyLinkStyle {
  readonly color: number;
  readonly width: number;
  readonly alpha: number;
}

export interface EnergyLinkSegment {
  readonly fromId: number;
  readonly toId: number;
  readonly fromCenter: { readonly x: number; readonly y: number };
  readonly toCenter: { readonly x: number; readonly y: number };
}

interface DirectedEnergyLinkSegment {
  readonly fromId: number;
  readonly toId: number;
  readonly fromCenter: { readonly x: number; readonly y: number };
  readonly toCenter: { readonly x: number; readonly y: number };
}

interface EnergyFlowComponent {
  readonly id: number;
  readonly buildingIds: readonly number[];
  readonly segments: readonly EnergyLinkSegment[];
  readonly directedToConsumers: readonly DirectedEnergyLinkSegment[];
  readonly directedDischargingToConsumers: readonly DirectedEnergyLinkSegment[];
  readonly directedToBatteries: readonly DirectedEnergyLinkSegment[];
  readonly directedToBatteriesNonConsumerEdges: readonly DirectedEnergyLinkSegment[];
}

export type EnergyFlowPhase = 'inactive' | 'serving' | 'discharging' | 'surplus';

const LINK_TRANSITION_MS = 200;
const NORMAL_DASH_LENGTH = 8;
const NORMAL_DASH_GAP = 8;
const FLOW_DOT_SPACING = 18;
const FLOW_DOT_RADIUS = 1.65;
const FLOW_DOT_SPEED = 0.06; // px/ms

export function getEnergyLinkStyle(mode: EnergyLinkMode): EnergyLinkStyle {
  if (mode === 'energy_link') {
    return {
      color: PIXI.accent,
      width: 2,
      alpha: 0.95,
    };
  }

  return {
    color: PIXI.border,
    width: 1,
    alpha: 0.4,
  };
}

export function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - (1 - clamped) ** 3;
}

export function interpolateEnergyLinkStyle(
  from: EnergyLinkStyle,
  to: EnergyLinkStyle,
  t: number,
): EnergyLinkStyle {
  const progress = Math.max(0, Math.min(1, t));
  return {
    color: interpolateColor(from.color, to.color, progress),
    width: lerp(from.width, to.width, progress),
    alpha: lerp(from.alpha, to.alpha, progress),
  };
}

export function classifyEnergyFlowPhase(
  stats: Pick<EnergyNetworkStats, 'isPowered' | 'production' | 'demandedConsumption'> | null,
): EnergyFlowPhase {
  if (!stats) return 'inactive';
  if (stats.demandedConsumption <= 0) return 'inactive';
  if (!stats.isPowered) return 'inactive';
  if (stats.production > stats.demandedConsumption) return 'surplus';
  if (stats.production < stats.demandedConsumption) return 'discharging';
  return 'serving';
}

export function collectEnergyLinkSegments(engine: GameEngine): EnergyLinkSegment[] {
  const segments: EnergyLinkSegment[] = [];
  const drawnEdges = new Set<string>();

  for (const buildingId of engine.getBuildings().keys()) {
    const from = engine.getBuildings().get(buildingId);
    if (!from) continue;
    const fromCenter = getBuildingCenter(from);
    if (!fromCenter) continue;

    for (const neighborId of engine.getEnergyLinkedBuildings(buildingId)) {
      const edgeKey = buildingId < neighborId ? `${buildingId}:${neighborId}` : `${neighborId}:${buildingId}`;
      if (drawnEdges.has(edgeKey)) continue;
      drawnEdges.add(edgeKey);

      const to = engine.getBuildings().get(neighborId);
      if (!to) continue;
      const toCenter = getBuildingCenter(to);
      if (!toCenter) continue;

      segments.push({
        fromId: buildingId,
        toId: neighborId,
        fromCenter,
        toCenter,
      });
    }
  }

  return segments;
}

function getBuildingCenter(building: Building): { x: number; y: number } | null {
  const type = getBuildingType(building.typeId);
  if (!type) return null;
  return {
    x: (building.origin.x + type.footprint.w / 2) * TILE_SIZE,
    y: (building.origin.y + type.footprint.h / 2) * TILE_SIZE,
  };
}

function isConsumer(engine: GameEngine, buildingId: number): boolean {
  const building = engine.getBuildings().get(buildingId);
  if (!building) return false;
  const type = getBuildingType(building.typeId);
  return (type?.energy?.consumption ?? 0) > 0;
}

function isBattery(engine: GameEngine, buildingId: number): boolean {
  const building = engine.getBuildings().get(buildingId);
  if (!building) return false;
  const type = getBuildingType(building.typeId);
  return !!type?.energy?.battery;
}

function orientEnergyLinkSegmentsTowardsTargets(
  segments: readonly EnergyLinkSegment[],
  targets: ReadonlySet<number>,
): DirectedEnergyLinkSegment[] {
  const adjacency = new Map<number, Set<number>>();

  for (const segment of segments) {
    let fromNeighbors = adjacency.get(segment.fromId);
    if (!fromNeighbors) {
      fromNeighbors = new Set<number>();
      adjacency.set(segment.fromId, fromNeighbors);
    }
    fromNeighbors.add(segment.toId);

    let toNeighbors = adjacency.get(segment.toId);
    if (!toNeighbors) {
      toNeighbors = new Set<number>();
      adjacency.set(segment.toId, toNeighbors);
    }
    toNeighbors.add(segment.fromId);
  }

  const distanceToTarget = new Map<number, number>();
  const queue: number[] = [];

  for (const targetId of targets) {
    if (!adjacency.has(targetId)) continue;
    distanceToTarget.set(targetId, 0);
    queue.push(targetId);
  }

  let cursor = 0;
  while (cursor < queue.length) {
    const currentId = queue[cursor++];
    const currentDistance = distanceToTarget.get(currentId) ?? 0;
    const neighbors = adjacency.get(currentId);
    if (!neighbors) continue;
    for (const nextId of neighbors) {
      if (distanceToTarget.has(nextId)) continue;
      distanceToTarget.set(nextId, currentDistance + 1);
      queue.push(nextId);
    }
  }

  return segments.map((segment) => {
    const fromDist = distanceToTarget.get(segment.fromId);
    const toDist = distanceToTarget.get(segment.toId);

    if (fromDist !== undefined && toDist !== undefined && fromDist > toDist) {
      return {
        fromId: segment.fromId,
        toId: segment.toId,
        fromCenter: segment.fromCenter,
        toCenter: segment.toCenter,
      };
    }

    if (fromDist !== undefined && toDist !== undefined && toDist > fromDist) {
      return {
        fromId: segment.toId,
        toId: segment.fromId,
        fromCenter: segment.toCenter,
        toCenter: segment.fromCenter,
      };
    }

    if (segment.fromId <= segment.toId) {
      return {
        fromId: segment.fromId,
        toId: segment.toId,
        fromCenter: segment.fromCenter,
        toCenter: segment.toCenter,
      };
    }

    return {
      fromId: segment.toId,
      toId: segment.fromId,
      fromCenter: segment.toCenter,
      toCenter: segment.fromCenter,
    };
  });
}

function buildFlowComponents(engine: GameEngine, segments: readonly EnergyLinkSegment[]): EnergyFlowComponent[] {
  const byBuilding = new Map<number, EnergyLinkSegment[]>();
  const adjacency = new Map<number, Set<number>>();

  for (const segment of segments) {
    let fromEdges = byBuilding.get(segment.fromId);
    if (!fromEdges) {
      fromEdges = [];
      byBuilding.set(segment.fromId, fromEdges);
    }
    fromEdges.push(segment);

    let toEdges = byBuilding.get(segment.toId);
    if (!toEdges) {
      toEdges = [];
      byBuilding.set(segment.toId, toEdges);
    }
    toEdges.push(segment);

    let fromNeighbors = adjacency.get(segment.fromId);
    if (!fromNeighbors) {
      fromNeighbors = new Set<number>();
      adjacency.set(segment.fromId, fromNeighbors);
    }
    fromNeighbors.add(segment.toId);

    let toNeighbors = adjacency.get(segment.toId);
    if (!toNeighbors) {
      toNeighbors = new Set<number>();
      adjacency.set(segment.toId, toNeighbors);
    }
    toNeighbors.add(segment.fromId);
  }

  const components: EnergyFlowComponent[] = [];
  const visited = new Set<number>();

  for (const nodeId of adjacency.keys()) {
    if (visited.has(nodeId)) continue;

    const componentNodeIds: number[] = [];
    const queue: number[] = [nodeId];
    visited.add(nodeId);
    let cursor = 0;

    while (cursor < queue.length) {
      const currentId = queue[cursor++];
      componentNodeIds.push(currentId);
      const neighbors = adjacency.get(currentId);
      if (!neighbors) continue;
      for (const nextId of neighbors) {
        if (visited.has(nextId)) continue;
        visited.add(nextId);
        queue.push(nextId);
      }
    }

    componentNodeIds.sort((a, b) => a - b);
    const componentNodeSet = new Set(componentNodeIds);

    const componentSegments = segments.filter(
      (segment) => componentNodeSet.has(segment.fromId) && componentNodeSet.has(segment.toId),
    );

    const consumerTargets = new Set(componentNodeIds.filter((id) => isConsumer(engine, id)));
    const batteryTargets = new Set(componentNodeIds.filter((id) => isBattery(engine, id)));

    const directedToConsumers = orientEnergyLinkSegmentsTowardsTargets(componentSegments, consumerTargets);
    // During discharge: keep segments toward consumers AND battery→battery relay hops,
    // but exclude producer→battery segments (solar panels don't produce at night).
    const directedDischargingToConsumers = directedToConsumers.filter(
      (segment) => !batteryTargets.has(segment.toId) || batteryTargets.has(segment.fromId),
    );

    components.push({
      id: componentNodeIds[0]!,
      buildingIds: componentNodeIds,
      segments: componentSegments,
      directedToConsumers,
      directedDischargingToConsumers,
      directedToBatteries: orientEnergyLinkSegmentsTowardsTargets(componentSegments, batteryTargets),
      directedToBatteriesNonConsumerEdges: orientEnergyLinkSegmentsTowardsTargets(
        componentSegments.filter((segment) => !consumerTargets.has(segment.fromId) && !consumerTargets.has(segment.toId)),
        batteryTargets,
      ),
    });
  }

  return components;
}

export class EnergyLinkRenderer {
  private readonly container: Container;
  private readonly graphics: Graphics;
  private readonly engine: GameEngine;
  private readonly getState: () => LinkPreviewState;
  private readonly unsubscribeEngine: () => void;
  private linkSegments: EnergyLinkSegment[] = [];
  private flowComponents: EnergyFlowComponent[] = [];
  private worldDirty = true;
  private currentMode: EnergyLinkMode;
  private fromStyle: EnergyLinkStyle;
  private toStyle: EnergyLinkStyle;
  private transitionStartedAt: number | null = null;
  /** What the dashes drawn at rest depend on; null while the layer is animated. */
  private lastRestKey: string | null = null;
  // Test-observable metric: how many animated dots were rendered in last frame.
  private flowDotCountLastFrame = 0;
  private flowDotCountToConsumersLastFrame = 0;
  private flowDotCountToBatteriesLastFrame = 0;

  constructor(app: Application, engine: GameEngine, getState: () => LinkPreviewState) {
    this.engine = engine;
    this.getState = getState;
    this.container = createWorldLayer();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    app.stage.addChild(this.container);
    this.currentMode = getState().mode;
    this.fromStyle = getEnergyLinkStyle(this.currentMode);
    this.toStyle = this.fromStyle;
    this.unsubscribeEngine = engine.subscribe((kind) => {
      if (kind === 'world') this.worldDirty = true;
    });
  }

  render(): void {
    const { viewport } = this.engine;
    this.container.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.container.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.container.scale.set(viewport.zoom);

    const now = performance.now();
    const previewState = this.getState();
    this.syncMode(previewState.mode, now);
    const style = this.getCurrentStyle(now);
    const visibleRange = this.engine.getVisibleTiles();

    // Outside the link tool the dashes are still: every link of the map is
    // drawn once, on screen or not, and redrawn only when a link or a building
    // changes, not on every frame, simulation beat or camera move.
    const atRest =
      this.currentMode === 'normal' && this.transitionStartedAt === null && previewState.pendingSourceId === null;
    const restKey = atRest ? `${this.engine.energyNetwork.version}:${this.engine.buildings.revision}` : null;
    if (restKey !== null && restKey === this.lastRestKey) return;
    this.lastRestKey = restKey;

    this.graphics.clear();
    this.flowDotCountLastFrame = 0;
    this.flowDotCountToConsumersLastFrame = 0;
    this.flowDotCountToBatteriesLastFrame = 0;

    if (this.worldDirty) {
      this.linkSegments = collectEnergyLinkSegments(this.engine);
      this.flowComponents = buildFlowComponents(this.engine, this.linkSegments);
      this.worldDirty = false;
    }

    const wx0 = visibleRange.x0 * TILE_SIZE;
    const wy0 = visibleRange.y0 * TILE_SIZE;
    const wx1 = (visibleRange.x1 + 1) * TILE_SIZE;
    const wy1 = (visibleRange.y1 + 1) * TILE_SIZE;

    let dashed = false;
    for (const segment of this.linkSegments) {
      const fv =
        segment.fromCenter.x >= wx0 &&
        segment.fromCenter.x <= wx1 &&
        segment.fromCenter.y >= wy0 &&
        segment.fromCenter.y <= wy1;
      const tv =
        segment.toCenter.x >= wx0 &&
        segment.toCenter.x <= wx1 &&
        segment.toCenter.y >= wy0 &&
        segment.toCenter.y <= wy1;
      if (!atRest && !fv && !tv) continue;

      if (this.currentMode === 'energy_link') {
        this.drawSolidLine(segment.fromCenter.x, segment.fromCenter.y, segment.toCenter.x, segment.toCenter.y, style);
      } else {
        this.traceDashedLine(segment.fromCenter.x, segment.fromCenter.y, segment.toCenter.x, segment.toCenter.y);
        dashed = true;
      }
    }
    // One stroke for every dash of every link, instead of one per dash.
    if (dashed) this.graphics.stroke(style);

    if (this.currentMode === 'energy_link') {
      this.drawFlowByComponent(style, now, wx0, wy0, wx1, wy1);
    }

    if (previewState.pendingSourceId !== null && previewState.mouseWorldPos !== null) {
      const src = this.engine.getBuildings().get(previewState.pendingSourceId);
      if (src) {
        const srcCenter = getBuildingCenter(src);
        if (srcCenter) {
          this.traceDashedLine(srcCenter.x, srcCenter.y, previewState.mouseWorldPos.x, previewState.mouseWorldPos.y);
          this.graphics.stroke({ color: PIXI.accent, width: 2, alpha: 0.55 });
        }
      }
    }
  }

  destroy(): void {
    this.unsubscribeEngine();
    this.container.destroy({ children: true });
  }

  private drawFlowByComponent(
    style: EnergyLinkStyle,
    now: number,
    wx0: number,
    wy0: number,
    wx1: number,
    wy1: number,
  ): void {
    for (const component of this.flowComponents) {
      const stats = this.engine.getEnergyStatsForBuilding(component.id);
      const phase = classifyEnergyFlowPhase(stats);
      if (phase === 'inactive') continue;

      if (phase === 'surplus') {
        const consumerDots = this.drawFlowDotsOnDirectedSegments(
          component.directedToConsumers,
          style,
          now,
          wx0,
          wy0,
          wx1,
          wy1,
          0,
          0.95,
        );
        this.flowDotCountToConsumersLastFrame += consumerDots;
        this.flowDotCountLastFrame += consumerDots;

        const batteryDots = this.drawFlowDotsOnDirectedSegments(
          component.directedToBatteriesNonConsumerEdges,
          style,
          now,
          wx0,
          wy0,
          wx1,
          wy1,
          FLOW_DOT_SPACING * 0.5,
          0.62,
        );
        this.flowDotCountToBatteriesLastFrame += batteryDots;
        this.flowDotCountLastFrame += batteryDots;

        // If there are no non-consumer battery edges (e.g. simple producer-battery
        // network), fallback to direct battery-oriented pass.
        if (component.directedToBatteriesNonConsumerEdges.length === 0 && component.directedToConsumers.length === 0) {
          const fallbackBatteryDots = this.drawFlowDotsOnDirectedSegments(
            component.directedToBatteries,
            style,
            now,
            wx0,
            wy0,
            wx1,
            wy1,
            FLOW_DOT_SPACING * 0.5,
            0.62,
          );
          this.flowDotCountToBatteriesLastFrame += fallbackBatteryDots;
          this.flowDotCountLastFrame += fallbackBatteryDots;
        }
        continue;
      }

      const consumerFlowSegments =
        phase === 'discharging' ? component.directedDischargingToConsumers : component.directedToConsumers;
      const consumerDots = this.drawFlowDotsOnDirectedSegments(
        consumerFlowSegments,
        style,
        now,
        wx0,
        wy0,
        wx1,
        wy1,
        0,
        0.95,
      );
      this.flowDotCountToConsumersLastFrame += consumerDots;
      this.flowDotCountLastFrame += consumerDots;
    }
  }

  private drawFlowDotsOnDirectedSegments(
    segments: readonly DirectedEnergyLinkSegment[],
    style: EnergyLinkStyle,
    now: number,
    wx0: number,
    wy0: number,
    wx1: number,
    wy1: number,
    phaseOffsetPx: number,
    alphaScale: number,
  ): number {
    let count = 0;
    const offset = ((now * FLOW_DOT_SPEED) + phaseOffsetPx) % FLOW_DOT_SPACING;

    for (const segment of segments) {
      const dx = segment.toCenter.x - segment.fromCenter.x;
      const dy = segment.toCenter.y - segment.fromCenter.y;
      const length = Math.hypot(dx, dy);
      if (length <= 0.001) continue;

      const ux = dx / length;
      const uy = dy / length;
      for (let d = offset; d < length; d += FLOW_DOT_SPACING) {
        const x = segment.fromCenter.x + ux * d;
        const y = segment.fromCenter.y + uy * d;

        if (x < wx0 || x > wx1 || y < wy0 || y > wy1) continue;

        this.graphics.circle(x, y, FLOW_DOT_RADIUS).fill({
          color: style.color,
          alpha: Math.min(1, style.alpha * alphaScale),
        });
        count += 1;
      }
    }

    return count;
  }

  private drawSolidLine(x0: number, y0: number, x1: number, y1: number, style: EnergyLinkStyle): void {
    this.graphics.moveTo(x0, y0).lineTo(x1, y1).stroke(style);
  }

  /** Adds the dashes of a line to the current path; the caller strokes them. */
  private traceDashedLine(x0: number, y0: number, x1: number, y1: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.hypot(dx, dy);
    if (length <= 0.001) return;

    const ux = dx / length;
    const uy = dy / length;
    let cursor = 0;

    while (cursor < length) {
      const dashEnd = Math.min(cursor + NORMAL_DASH_LENGTH, length);
      const fromX = x0 + ux * cursor;
      const fromY = y0 + uy * cursor;
      const toX = x0 + ux * dashEnd;
      const toY = y0 + uy * dashEnd;
      this.graphics.moveTo(fromX, fromY).lineTo(toX, toY);
      cursor = dashEnd + NORMAL_DASH_GAP;
    }
  }

  private syncMode(nextMode: EnergyLinkMode, now: number): void {
    if (nextMode === this.currentMode) return;

    const currentStyle = this.getCurrentStyle(now);
    this.currentMode = nextMode;
    this.fromStyle = currentStyle;
    this.toStyle = getEnergyLinkStyle(nextMode);
    this.transitionStartedAt = now;
  }

  private getCurrentStyle(now: number): EnergyLinkStyle {
    if (this.transitionStartedAt === null) {
      return this.toStyle;
    }

    const elapsed = now - this.transitionStartedAt;
    if (elapsed >= LINK_TRANSITION_MS) {
      this.transitionStartedAt = null;
      this.fromStyle = this.toStyle;
      return this.toStyle;
    }

    return interpolateEnergyLinkStyle(this.fromStyle, this.toStyle, easeOutCubic(elapsed / LINK_TRANSITION_MS));
  }
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function interpolateColor(from: number, to: number, t: number): number {
  const fromR = (from >> 16) & 0xff;
  const fromG = (from >> 8) & 0xff;
  const fromB = from & 0xff;
  const toR = (to >> 16) & 0xff;
  const toG = (to >> 8) & 0xff;
  const toB = to & 0xff;

  return (
    (Math.round(lerp(fromR, toR, t)) << 16) |
    (Math.round(lerp(fromG, toG, t)) << 8) |
    Math.round(lerp(fromB, toB, t))
  );
}
