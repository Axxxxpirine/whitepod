import { Container, Sprite, Texture, type Application } from 'pixi.js';
import { TILE_SIZE } from '../constants';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
} from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type { Building } from '../types';

const BUILDING_INSET = 2;
const BUILDING_TINTS: Record<string, number> = {
  [EXTRACTOR_BUILDING_TYPE_ID]: 0xf5b041,
  [STORAGE_BUILDING_TYPE_ID]: 0x5dade2,
  [SOLAR_PANEL_BUILDING_TYPE_ID]: 0x82e0aa,
};

function isBuildingVisible(
  building: Building,
  visibleRange: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  const type = getBuildingType(building.typeId);
  if (!type) return false;

  const x1 = building.origin.x + type.footprint.w - 1;
  const y1 = building.origin.y + type.footprint.h - 1;

  return !(
    x1 < visibleRange.x0 ||
    building.origin.x > visibleRange.x1 ||
    y1 < visibleRange.y0 ||
    building.origin.y > visibleRange.y1
  );
}

export class BuildingRenderer {
  private readonly buildingContainer: Container;
  private readonly spritePool: Sprite[] = [];
  private readonly activeSprites: Map<number, Sprite> = new Map();
  private readonly engine: GameEngine;

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.buildingContainer = new Container();
    app.stage.addChild(this.buildingContainer);
  }

  render(): void {
    const { viewport } = this.engine;
    const visibleRange = this.engine.getVisibleTiles();

    this.buildingContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.buildingContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.buildingContainer.scale.set(viewport.zoom);

    const visibleIds = new Set<number>();
    for (const building of this.engine.getBuildings().values()) {
      if (!isBuildingVisible(building, visibleRange)) continue;
      visibleIds.add(building.id);

      const type = getBuildingType(building.typeId);
      if (!type) continue;

      let sprite = this.activeSprites.get(building.id);
      if (!sprite) {
        sprite = this.acquireSprite();
        this.buildingContainer.addChild(sprite);
        this.activeSprites.set(building.id, sprite);
      }

      sprite.x = building.origin.x * TILE_SIZE + BUILDING_INSET;
      sprite.y = building.origin.y * TILE_SIZE + BUILDING_INSET;
      sprite.width = type.footprint.w * TILE_SIZE - BUILDING_INSET * 2;
      sprite.height = type.footprint.h * TILE_SIZE - BUILDING_INSET * 2;
      sprite.tint = BUILDING_TINTS[building.typeId] ?? 0xd5dbdb;
      sprite.alpha = 0.95;
      sprite.visible = true;
    }

    for (const [id, sprite] of this.activeSprites) {
      if (visibleIds.has(id)) continue;
      this.buildingContainer.removeChild(sprite);
      sprite.visible = false;
      this.spritePool.push(sprite);
      this.activeSprites.delete(id);
    }
  }

  private acquireSprite(): Sprite {
    const sprite = this.spritePool.pop() ?? new Sprite(Texture.WHITE);
    sprite.visible = true;
    return sprite;
  }

  destroy(): void {
    this.buildingContainer.destroy({ children: true });
    this.spritePool.length = 0;
    this.activeSprites.clear();
  }
}
