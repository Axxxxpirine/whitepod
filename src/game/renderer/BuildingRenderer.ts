import { Container, Graphics, Sprite, Texture, type Application } from 'pixi.js';
import { TILE_SIZE } from '../constants';
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
import type { Building, PowerState } from '../types';
import { drawBuildingPortMarkers } from './buildingPortMarkers';
import { getBuildingTexture } from './TileSprite';
import { getBuildingSpriteSpec } from '../ui/spritePaths';
import { PIXI } from '@/design/tokens';

const BUILDING_INSET = 2;
const POWER_INDICATOR_RADIUS = 4;
const POWER_INDICATOR_OFFSET = 7;
const SHADOW_ALPHA = 0.26;
const SHADOW_VERTICAL_SCALE = 0.34;
const SHADOW_WIDTH_OVERFLOW = 1.12;
const SHADOW_HEIGHT_OVERFLOW = 1.06;
const SHADOW_OFFSET_X = -TILE_SIZE * 0.16;
const SHADOW_OFFSET_Y = -TILE_SIZE * 0.11;
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

  const width = Math.max(
    (type.footprint.w * TILE_SIZE - BUILDING_INSET * 2) * SHADOW_WIDTH_OVERFLOW,
    TILE_SIZE * 0.72,
  );
  const height = Math.max(
    type.footprint.h * TILE_SIZE * SHADOW_VERTICAL_SCALE * SHADOW_HEIGHT_OVERFLOW,
    TILE_SIZE * 0.28,
  );
  const centerX = (building.origin.x + type.footprint.w / 2) * TILE_SIZE + SHADOW_OFFSET_X;
  const centerY = (building.origin.y + type.footprint.h) * TILE_SIZE - height / 2 - 2 + SHADOW_OFFSET_Y;

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
      const baselineX = (building.origin.x + type.footprint.w / 2) * TILE_SIZE;
      const baselineY = (building.origin.y + type.footprint.h) * TILE_SIZE - BUILDING_INSET;
      const zIndex = building.origin.y + type.footprint.h;

      let sprite = this.activeSprites.get(building.id);
      if (!sprite) {
        sprite = this.acquireSprite();
        this.buildingContainer.addChild(sprite);
        this.activeSprites.set(building.id, sprite);
      }

      const buildingTexture = getBuildingTexture(building.typeId);
      sprite.texture = buildingTexture ?? Texture.WHITE;
      if (spriteSpec?.anchor === 'bottom-center') {
        const displayHeight = spriteSpec.displayHeightTiles * TILE_SIZE;
        const displayWidth = (spriteSpec.displayWidthTiles ?? spriteSpec.displayHeightTiles) * TILE_SIZE;
        sprite.anchor.set(0.5, 1);
        sprite.x = baselineX;
        sprite.y = baselineY;
        sprite.width = displayWidth;
        sprite.height = displayHeight;
      } else {
        sprite.anchor.set(0, 0);
        sprite.x = building.origin.x * TILE_SIZE + BUILDING_INSET;
        sprite.y = building.origin.y * TILE_SIZE + BUILDING_INSET;
        sprite.width = type.footprint.w * TILE_SIZE - BUILDING_INSET * 2;
        sprite.height = type.footprint.h * TILE_SIZE - BUILDING_INSET * 2;
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
        indicator.x = building.origin.x * TILE_SIZE + POWER_INDICATOR_OFFSET;
        indicator.y = building.origin.y * TILE_SIZE + POWER_INDICATOR_OFFSET;
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
