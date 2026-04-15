import { Container, Graphics, type Application } from 'pixi.js';
import { TILE_SIZE } from '../constants';
import { getBuildingType } from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type { Building } from '../types';

interface LinkPreviewState {
  readonly inspectedBuildingId: number | null;
  readonly showAllNetworks: boolean;
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

    const { inspectedBuildingId, showAllNetworks } = this.getState();

    if (showAllNetworks) {
      const drawnEdges = new Set<string>();
      for (const network of this.engine.getEnergyNetworkBalances()) {
        for (const buildingId of network.buildingIds) {
          const from = this.engine.buildings.get(buildingId);
          if (!from) continue;
          const fromCenter = getBuildingCenter(from);
          if (!fromCenter) continue;

          for (const neighborId of this.engine.getEnergyLinkedBuildings(buildingId)) {
            const edgeKey =
              buildingId < neighborId ? `${buildingId}:${neighborId}` : `${neighborId}:${buildingId}`;
            if (drawnEdges.has(edgeKey)) continue;
            drawnEdges.add(edgeKey);

            const to = this.engine.buildings.get(neighborId);
            if (!to) continue;
            const toCenter = getBuildingCenter(to);
            if (!toCenter) continue;

            this.graphics
              .moveTo(fromCenter.x, fromCenter.y)
              .lineTo(toCenter.x, toCenter.y)
              .stroke({ color: 0xf8e16c, width: 2, alpha: 0.95 });
          }
        }
      }
      return;
    }

    if (inspectedBuildingId === null) return;

    const source = this.engine.buildings.get(inspectedBuildingId);
    if (!source) return;
    const network = this.engine.getEnergyNetworkForBuilding(source.id);
    if (!network) return;

    const drawnEdges = new Set<string>();
    for (const buildingId of network.buildingIds) {
      const from = this.engine.buildings.get(buildingId);
      if (!from) continue;
      const fromCenter = getBuildingCenter(from);
      if (!fromCenter) continue;

      for (const neighborId of this.engine.getEnergyLinkedBuildings(buildingId)) {
        const edgeKey = buildingId < neighborId ? `${buildingId}:${neighborId}` : `${neighborId}:${buildingId}`;
        if (drawnEdges.has(edgeKey)) continue;
        drawnEdges.add(edgeKey);

        const to = this.engine.buildings.get(neighborId);
        if (!to) continue;
        const toCenter = getBuildingCenter(to);
        if (!toCenter) continue;

        this.graphics
          .moveTo(fromCenter.x, fromCenter.y)
          .lineTo(toCenter.x, toCenter.y)
          .stroke({ color: 0xf8e16c, width: 2, alpha: 0.95 });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
