import { Container, Graphics, type Application } from 'pixi.js';
import { TILE_SIZE } from '../constants';
import { getBuildingType } from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type { Building } from '../types';

interface LinkPreviewState {
  readonly mode: EnergyLinkMode;
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

const LINK_TRANSITION_MS = 200;

export function getEnergyLinkStyle(mode: EnergyLinkMode): EnergyLinkStyle {
  if (mode === 'energy_link') {
    return {
      color: 0xf8e16c,
      width: 2,
      alpha: 0.95,
    };
  }

  return {
    color: 0x111111,
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

export class EnergyLinkRenderer {
  private readonly container: Container;
  private readonly graphics: Graphics;
  private readonly engine: GameEngine;
  private readonly getState: () => LinkPreviewState;
  private readonly unsubscribeEngine: () => void;
  private linkSegments: EnergyLinkSegment[] = [];
  private worldDirty = true;
  private currentMode: EnergyLinkMode;
  private fromStyle: EnergyLinkStyle;
  private toStyle: EnergyLinkStyle;
  private transitionStartedAt: number | null = null;

  constructor(app: Application, engine: GameEngine, getState: () => LinkPreviewState) {
    this.engine = engine;
    this.getState = getState;
    this.container = new Container();
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

    this.graphics.clear();

    if (this.worldDirty) {
      this.linkSegments = collectEnergyLinkSegments(this.engine);
      this.worldDirty = false;
    }

    const now = performance.now();
    this.syncMode(this.getState().mode, now);
    const style = this.getCurrentStyle(now);

    for (const segment of this.linkSegments) {
      this.graphics
        .moveTo(segment.fromCenter.x, segment.fromCenter.y)
        .lineTo(segment.toCenter.x, segment.toCenter.y)
        .stroke(style);
    }
  }

  destroy(): void {
    this.unsubscribeEngine();
    this.container.destroy({ children: true });
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
