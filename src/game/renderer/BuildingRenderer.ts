import { BlurFilter, Container, Graphics, Sprite, Texture, type Application } from 'pixi.js';
import { ISO_TILE_H, ISO_TILE_W } from '../constants';
import {
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
  WATCHTOWER_BUILDING_TYPE_ID,
  getBuildingType,
  isBeltTypeId,
} from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import { tileCenterToIso } from '../engine/IsoTransform';
import type { Building, PowerState } from '../types';
import { drawBuildingPortMarkers } from './buildingPortMarkers';
import { getBuildingTexture } from './TileSprite';
import { getBuildingSpriteSpec } from '../ui/spritePaths';
import { PIXI } from '@/design/tokens';

const POWER_INDICATOR_RADIUS = 4;
const SHADOW_ALPHA = 0.32;
const SHADOW_BLUR_RADIUS = 4;
// Iso shadow ellipse: roughly the footprint diamond bounding box on the ground,
// flattened to suggest a low-angle SE sun (vertical squash) and slightly
// overflowed so the shadow reads as ground contact rather than sticker.
const SHADOW_WIDTH_OVERFLOW = 1.12;
const SHADOW_VERTICAL_SCALE = 0.46;
const SHADOW_HEIGHT_OVERFLOW = 1.05;
const SHADOW_OFFSET_X = -ISO_TILE_W * 0.06;
const SHADOW_OFFSET_Y = -ISO_TILE_H * 0.06;
const RTS_CULL_MARGIN_TILES = 3;
// Building family palette (Architect's Drawing Board).
// Each family owns a distinct token from the design system, scoped to
// functional roles rather than decorative hues.
const BUILDING_TINTS: Record<string, number> = {
  [EXTRACTOR_BUILDING_TYPE_ID]: PIXI.accentWarm,
  [STORAGE_BUILDING_TYPE_ID]: PIXI.accent,
  [SOLAR_PANEL_BUILDING_TYPE_ID]: PIXI.ok,
  [MERGER_BASIC_BUILDING_TYPE_ID]: PIXI.inkMuted,
  [WATCHTOWER_BUILDING_TYPE_ID]: PIXI.inkMuted,
  [CONVERTER_BUILDING_TYPE_ID]: PIXI.accentWarm,
  [SYNTHESIZER_BUILDING_TYPE_ID]: PIXI.accentWarm,
};
const DEFAULT_BUILDING_ALPHA = 0.95;
const EXTRACTOR_BUILDING_ALPHA = 0.52;

const POWER_INDICATOR_COLORS: Record<Exclude<PowerState, 'neutral'>, number> = {
  powered: PIXI.ok,
  unpowered: PIXI.error,
};

export function getPowerIndicatorColor(state: PowerState): number | null {
  if (state === 'neutral') return null;
  return POWER_INDICATOR_COLORS[state];
}

export function getBuildingIndicatorColor(state: PowerState, hasBadInput: boolean): number | null {
  if (hasBadInput) return PIXI.error;
  return getPowerIndicatorColor(state);
}

export interface BuildingShadowGeometry {
  readonly centerX: number;
  readonly centerY: number;
  readonly radiusX: number;
  readonly radiusY: number;
}

export function getBuildingShadowGeometry(building: Building): BuildingShadowGeometry | null {
  const type = getBuildingType(building.typeId);
  if (!type) return null;

  // Footprint center in continuous logical coords, projected to iso world.
  const footprintCenter = tileCenterToIso(
    building.origin.x + (type.footprint.w - 1) / 2,
    building.origin.y + (type.footprint.h - 1) / 2,
  );
  // Iso footprint bounding box: width = (w + h) * ISO_TILE_W/2, height = (w + h) * ISO_TILE_H/2.
  // The shadow ellipse hugs that bbox horizontally and squashes vertically so
  // it reads as a low-angle drop on the ground.
  const isoBboxWidth = (type.footprint.w + type.footprint.h) * (ISO_TILE_W / 2);
  const isoBboxHeight = (type.footprint.w + type.footprint.h) * (ISO_TILE_H / 2);
  const width = Math.max(isoBboxWidth * SHADOW_WIDTH_OVERFLOW, ISO_TILE_W * 0.72);
  const height = Math.max(
    isoBboxHeight * SHADOW_VERTICAL_SCALE * SHADOW_HEIGHT_OVERFLOW,
    ISO_TILE_H * 0.28,
  );
  // Anchor to the SOUTH vertex of the footprint diamond so the ellipse sits
  // under the visual base of the building rather than its logical center.
  const southVertexY = footprintCenter.wy + isoBboxHeight / 2;
  const centerX = footprintCenter.wx + SHADOW_OFFSET_X;
  const centerY = southVertexY - height / 2 + SHADOW_OFFSET_Y;

  return { centerX, centerY, radiusX: width / 2, radiusY: height / 2 };
}

function isBuildingVisible(
  building: Building,
  visibleRange: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  const type = getBuildingType(building.typeId);
  if (!type) return false;

  const x1 = building.origin.x + type.footprint.w - 1;
  const y1 = building.origin.y + type.footprint.h - 1;

  return !(
    x1 < visibleRange.x0 - RTS_CULL_MARGIN_TILES ||
    building.origin.x > visibleRange.x1 + RTS_CULL_MARGIN_TILES ||
    y1 < visibleRange.y0 - RTS_CULL_MARGIN_TILES ||
    building.origin.y > visibleRange.y1 + RTS_CULL_MARGIN_TILES
  );
}

export class BuildingRenderer {
  private readonly buildingContainer: Container;
  private readonly shadowContainer: Container;
  private readonly indicatorContainer: Container;
  private readonly portMarkerContainer: Container;
  private readonly spritePool: Sprite[] = [];
  private readonly shadowPool: Graphics[] = [];
  private readonly activeSprites: Map<number, Sprite> = new Map();
  private readonly activeShadows: Map<number, Graphics> = new Map();
  private readonly activeIndicators: Map<number, Graphics> = new Map();
  private readonly activePortMarkers: Map<number, Graphics> = new Map();
  private readonly indicatorPool: Graphics[] = [];
  private readonly portMarkerPool: Graphics[] = [];
  private readonly indicatorColorCache: Map<number, number> = new Map();
  private readonly engine: GameEngine;

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.buildingContainer = new Container();
    this.buildingContainer.sortableChildren = true;
    this.shadowContainer = new Container();
    this.shadowContainer.sortableChildren = true;
    // Soften iso ground shadows so they read as ambient contact rather than
    // hard sticker outlines. Single shared filter — Pixi caches the blur kernel.
    this.shadowContainer.filters = [new BlurFilter({ strength: SHADOW_BLUR_RADIUS })];
    this.indicatorContainer = new Container();
    this.portMarkerContainer = new Container();
    app.stage.addChild(this.shadowContainer);
    app.stage.addChild(this.buildingContainer);
    app.stage.addChild(this.portMarkerContainer);
    app.stage.addChild(this.indicatorContainer);
  }

  render(): void {
    const { viewport } = this.engine;
    const visibleRange = this.engine.getVisibleTiles();

    this.buildingContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.buildingContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.buildingContainer.scale.set(viewport.zoom);
    this.shadowContainer.x = this.buildingContainer.x;
    this.shadowContainer.y = this.buildingContainer.y;
    this.shadowContainer.scale.set(viewport.zoom);
    this.indicatorContainer.x = this.buildingContainer.x;
    this.indicatorContainer.y = this.buildingContainer.y;
    this.indicatorContainer.scale.set(viewport.zoom);
    this.portMarkerContainer.x = this.buildingContainer.x;
    this.portMarkerContainer.y = this.buildingContainer.y;
    this.portMarkerContainer.scale.set(viewport.zoom);

    const visibleIds = new Set<number>();
    for (const building of this.engine.getBuildings().values()) {
      if (isBeltTypeId(building.typeId)) continue;
      if (!isBuildingVisible(building, visibleRange)) continue;
      visibleIds.add(building.id);

      const type = getBuildingType(building.typeId);
      if (!type) continue;
      const spriteSpec = getBuildingSpriteSpec(building.typeId);
      // Iso bottom-center anchor: project the south-edge midpoint of the
      // logical footprint into iso world. The footprint center sits at
      // (origin + (w-1)/2, origin + (h-1)/2); shifting south by half the iso
      // height gives the visible base where the sprite "stands".
      const footprintCenter = tileCenterToIso(
        building.origin.x + (type.footprint.w - 1) / 2,
        building.origin.y + (type.footprint.h - 1) / 2,
      );
      const isoBboxHeight = (type.footprint.w + type.footprint.h) * (ISO_TILE_H / 2);
      const baselineX = footprintCenter.wx;
      const baselineY = footprintCenter.wy + isoBboxHeight / 2;
      // Y-sort by the sprite base in iso world so southerly buildings overlap
      // those further north.
      const zIndex = baselineY;

      let sprite = this.activeSprites.get(building.id);
      if (!sprite) {
        sprite = this.acquireSprite();
        this.buildingContainer.addChild(sprite);
        this.activeSprites.set(building.id, sprite);
      }

      const buildingTexture = getBuildingTexture(building.typeId);
      sprite.texture = buildingTexture ?? Texture.WHITE;
      if (spriteSpec?.anchor === 'bottom-center') {
        // Iso pixel scale: height is preserved (1 tile = ISO_TILE_H px tall),
        // width gets the iso 2:1 stretch so RTS sprites authored for the iso
        // 3/4 camera retain their wider-than-tall proportions.
        const displayHeight = spriteSpec.displayHeightTiles * ISO_TILE_H;
        const displayWidth =
          (spriteSpec.displayWidthTiles ?? spriteSpec.displayHeightTiles) * ISO_TILE_W;
        sprite.anchor.set(0.5, 1);
        sprite.x = baselineX;
        sprite.y = baselineY;
        sprite.width = displayWidth;
        sprite.height = displayHeight;
      } else {
        // Procedural fallback (placeholders, unspec'd buildings): render a
        // simple footprint-sized rectangle anchored at the iso footprint
        // center. Not pretty, but visible enough for tests/scenarios.
        const isoBboxWidth = (type.footprint.w + type.footprint.h) * (ISO_TILE_W / 2);
        sprite.anchor.set(0.5, 0.5);
        sprite.x = footprintCenter.wx;
        sprite.y = footprintCenter.wy;
        sprite.width = isoBboxWidth * 0.7;
        sprite.height = isoBboxHeight * 0.7;
      }
      sprite.zIndex = zIndex;
      sprite.tint = buildingTexture ? 0xffffff : (BUILDING_TINTS[building.typeId] ?? PIXI.ink);
      sprite.alpha =
        building.typeId === EXTRACTOR_BUILDING_TYPE_ID ? EXTRACTOR_BUILDING_ALPHA : DEFAULT_BUILDING_ALPHA;
      sprite.visible = true;
      this.renderShadow(building.id, building, zIndex);

      if (type.ports.length === 0) {
        this.releasePortMarker(building.id);
      } else {
        let portMarker = this.activePortMarkers.get(building.id);
        if (!portMarker) {
          portMarker = this.acquirePortMarker();
          this.portMarkerContainer.addChild(portMarker);
          this.activePortMarkers.set(building.id, portMarker);
          drawBuildingPortMarkers(portMarker, building, type);
        }
        portMarker.visible = true;
      }

      const powerState = this.engine.getBuildingPowerState(building.id);
      const hasBadInput = !!this.engine.getProcessorLogisticsStatus(building.id)?.badInput;
      const indicatorColor = getBuildingIndicatorColor(powerState, hasBadInput);
      if (indicatorColor === null) {
        this.releaseIndicator(building.id);
      } else {
        let indicator = this.activeIndicators.get(building.id);
        const prevColor = this.indicatorColorCache.get(building.id);
        if (!indicator) {
          indicator = this.acquireIndicator();
          this.indicatorContainer.addChild(indicator);
          this.activeIndicators.set(building.id, indicator);
        }
        // Power indicator floats near the visual top vertex of the
        // origin tile (NW screen corner of the footprint).
        const originIso = tileCenterToIso(building.origin.x, building.origin.y);
        indicator.x = originIso.wx;
        indicator.y = originIso.wy - ISO_TILE_H / 2 + POWER_INDICATOR_RADIUS;
        if (prevColor !== indicatorColor) {
          indicator.clear();
          indicator.circle(0, 0, POWER_INDICATOR_RADIUS).fill({ color: indicatorColor, alpha: 1 });
          indicator.stroke({ color: PIXI.bg, width: 1, alpha: 0.9 });
          indicator.alpha = 1;
          this.indicatorColorCache.set(building.id, indicatorColor);
        }
        indicator.visible = true;
      }
    }

    for (const [id, sprite] of this.activeSprites) {
      if (visibleIds.has(id)) continue;
      this.buildingContainer.removeChild(sprite);
      sprite.visible = false;
      this.spritePool.push(sprite);
      this.activeSprites.delete(id);
      this.releaseShadow(id);
      this.releasePortMarker(id);
      this.releaseIndicator(id);
    }
  }

  private acquireSprite(): Sprite {
    const sprite = this.spritePool.pop() ?? new Sprite(Texture.WHITE);
    sprite.visible = true;
    return sprite;
  }

  private acquireIndicator(): Graphics {
    const indicator = this.indicatorPool.pop() ?? new Graphics();
    indicator.visible = true;
    return indicator;
  }

  private acquirePortMarker(): Graphics {
    const marker = this.portMarkerPool.pop() ?? new Graphics();
    marker.visible = true;
    return marker;
  }

  private acquireShadow(): Graphics {
    const shadow = this.shadowPool.pop() ?? new Graphics();
    shadow.visible = true;
    return shadow;
  }

  private renderShadow(buildingId: number, building: Building, zIndex: number): void {
    const geometry = getBuildingShadowGeometry(building);
    if (!geometry) return;

    let shadow = this.activeShadows.get(buildingId);
    if (!shadow) {
      shadow = this.acquireShadow();
      this.shadowContainer.addChild(shadow);
      this.activeShadows.set(buildingId, shadow);
    }

    shadow.clear();
    shadow
      .ellipse(geometry.centerX, geometry.centerY, geometry.radiusX, geometry.radiusY)
      .fill({ color: PIXI.bg, alpha: SHADOW_ALPHA });
    shadow.zIndex = zIndex - 0.01;
    shadow.visible = true;
  }

  private releaseIndicator(id: number): void {
    const indicator = this.activeIndicators.get(id);
    if (!indicator) return;
    this.indicatorContainer.removeChild(indicator);
    indicator.clear();
    indicator.visible = false;
    this.indicatorPool.push(indicator);
    this.activeIndicators.delete(id);
    this.indicatorColorCache.delete(id);
  }

  private releasePortMarker(id: number): void {
    const marker = this.activePortMarkers.get(id);
    if (!marker) return;
    this.portMarkerContainer.removeChild(marker);
    marker.clear();
    marker.visible = false;
    this.portMarkerPool.push(marker);
    this.activePortMarkers.delete(id);
  }

  private releaseShadow(id: number): void {
    const shadow = this.activeShadows.get(id);
    if (!shadow) return;
    this.shadowContainer.removeChild(shadow);
    shadow.clear();
    shadow.visible = false;
    this.shadowPool.push(shadow);
    this.activeShadows.delete(id);
  }

  destroy(): void {
    this.buildingContainer.destroy({ children: true });
    this.shadowContainer.destroy({ children: true });
    this.portMarkerContainer.destroy({ children: true });
    this.indicatorContainer.destroy({ children: true });
    this.spritePool.length = 0;
    this.shadowPool.length = 0;
    this.portMarkerPool.length = 0;
    this.indicatorPool.length = 0;
    this.activeSprites.clear();
    this.activeShadows.clear();
    this.activePortMarkers.clear();
    this.activeIndicators.clear();
    this.indicatorColorCache.clear();
  }
}
