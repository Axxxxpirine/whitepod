import { Container, Graphics, type Application } from 'pixi.js';
import { TILE_SIZE } from '../constants';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
  isBeltTypeId,
} from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type { Building } from '../types';
import { drawBuildingPortMarkers } from './buildingPortMarkers';

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
  private readonly graphics: Graphics;
  private readonly engine: GameEngine;

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.buildingContainer = new Container();
    this.graphics = new Graphics();
    this.buildingContainer.addChild(this.graphics);
    app.stage.addChild(this.buildingContainer);
  }

  render(): void {
    const { viewport } = this.engine;
    const visibleRange = this.engine.getVisibleTiles();

    this.buildingContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.buildingContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.buildingContainer.scale.set(viewport.zoom);

    this.graphics.clear();

    for (const building of this.engine.getBuildings().values()) {
      if (isBeltTypeId(building.typeId)) continue;
      if (!isBuildingVisible(building, visibleRange)) continue;

      const type = getBuildingType(building.typeId);
      if (!type) continue;

      this.graphics
        .rect(
          building.origin.x * TILE_SIZE + BUILDING_INSET,
          building.origin.y * TILE_SIZE + BUILDING_INSET,
          type.footprint.w * TILE_SIZE - BUILDING_INSET * 2,
          type.footprint.h * TILE_SIZE - BUILDING_INSET * 2,
        )
        .fill({ color: BUILDING_TINTS[building.typeId] ?? 0xd5dbdb, alpha: 0.95 })
        .stroke({ color: 0x111827, width: 1, alpha: 0.95 });

      drawBuildingPortMarkers(this.graphics, building, type);
    }
  }

  destroy(): void {
    this.buildingContainer.destroy({ children: true });
  }
}
