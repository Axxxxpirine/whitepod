import { Container, Graphics, type Application } from 'pixi.js';
import { TILE_SIZE } from '../constants';
import { getBuildingType } from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type { Building } from '../types';

interface LinkPreviewState {
  readonly inspectedBuildingId: number | null;
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

  constructor(app: Application, engine: GameEngine, getState: () => LinkPreviewState) {
    this.engine = engine;
    this.getState = getState;
    this.container = new Container();
    this.graphics = new Graphics();
    this.container.addChild(this.graphics);
    app.stage.addChild(this.container);
  }

  render(): void {
    const { viewport } = this.engine;
    this.container.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.container.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.container.scale.set(viewport.zoom);

    this.graphics.clear();

    const { inspectedBuildingId } = this.getState();
    if (inspectedBuildingId === null) return;

    const source = this.engine.buildings.get(inspectedBuildingId);
    if (!source) return;
    const sourceCenter = getBuildingCenter(source);
    if (!sourceCenter) return;

    const neighbors = this.engine.getEnergyLinkedBuildings(inspectedBuildingId);
    if (neighbors.length === 0) return;

    for (const neighborId of neighbors) {
      const target = this.engine.buildings.get(neighborId);
      if (!target) continue;
      const targetCenter = getBuildingCenter(target);
      if (!targetCenter) continue;
      this.graphics
        .moveTo(sourceCenter.x, sourceCenter.y)
        .lineTo(targetCenter.x, targetCenter.y)
        .stroke({ color: 0xf8e16c, width: 2, alpha: 0.95 });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
