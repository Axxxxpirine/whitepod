import { Container, Graphics, type Application } from 'pixi.js';
import { createWorldLayer } from './worldLayer';
import { TILE_SIZE } from '../constants';
import { beltTierOf, getBuildingType, isBeltTypeId } from '../data/buildingCatalog';
import { worldSideOf } from '../data/ConnectionRegistry';
import type { GameEngine } from '../engine/GameEngine';
import { Direction, PortKind, type Building, type TileCoord } from '../types';
import { PIXI } from '@/design/tokens';

export const BELT_INSET = 0;
const BELT_PATH = PIXI.border;
const BELT_RAIL = PIXI.surface2;
const BELT_DATA_LINE = PIXI.accent;
/** Fast belts: the accent line instead of the neutral one, same geometry. */
const BELT_FAST_PATH = PIXI.accent;
/** A run at its capacity (DESIGN.md: amber means "not enough"). */
const BELT_SATURATED = PIXI.accentWarm;

export class BeltRenderer {
  private readonly beltContainer: Container;
  private readonly graphics: Graphics;
  private readonly engine: GameEngine;
  private readonly unsubscribeEngine: () => void;
  private worldDirty = true;
  private lastDrawnKey: string | null = null;

  constructor(app: Application, engine: GameEngine) {
    this.engine = engine;
    this.beltContainer = createWorldLayer();
    this.graphics = new Graphics();
    this.beltContainer.addChild(this.graphics);
    app.stage.addChild(this.beltContainer);
    this.unsubscribeEngine = engine.subscribe((kind) => {
      if (kind === 'world') this.worldDirty = true;
    });
  }

  render(): void {
    const { viewport } = this.engine;

    this.beltContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.beltContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.beltContainer.scale.set(viewport.zoom);

    if (!this.worldDirty) return;

    // The simulation notifies on every extraction beat: belts only look
    // different when one is built, removed, upgraded, or changes saturation.
    const saturatedSegments = this.engine.getSaturatedBeltSegments();
    const drawnKey = `${this.engine.buildings.revision}:${saturatedSegments.join(',')}`;
    this.worldDirty = false;
    if (drawnKey === this.lastDrawnKey) return;
    this.lastDrawnKey = drawnKey;

    // Every belt of the map goes into this one geometry, on screen or not: the
    // camera then moves it for free. Drawing only the visible belts meant
    // rebuilding all of them on each tile the camera crossed.
    this.graphics.clear();
    const saturated = new Set(saturatedSegments);
    for (const building of this.engine.getBuildings().values()) {
      if (!isBeltTypeId(building.typeId)) continue;
      this.drawBelt(building, saturated.has(building.id));
    }
  }

  destroy(): void {
    this.unsubscribeEngine();
    this.beltContainer.destroy({ children: true });
  }

  private drawBelt(building: Building, saturated: boolean): void {
    const type = getBuildingType(building.typeId);
    if (!type) return;

    const baseX = building.origin.x * TILE_SIZE;
    const baseY = building.origin.y * TILE_SIZE;
    const center = {
      x: baseX + TILE_SIZE / 2,
      y: baseY + TILE_SIZE / 2,
    };
    const input = type.ports.find((port) => port.kind === PortKind.Input);
    const output = type.ports.find((port) => port.kind === PortKind.Output);
    if (!input || !output) return;

    const inSide = worldSideOf(input, building.rotation);
    const outSide = worldSideOf(output, building.rotation);
    const inPoint = this.edgePoint(baseX, baseY, inSide);
    const outPoint = this.edgePoint(baseX, baseY, outSide);

    this.graphics
      .moveTo(inPoint.x, inPoint.y)
      .lineTo(center.x, center.y)
      .lineTo(outPoint.x, outPoint.y)
      .stroke({ color: BELT_RAIL, width: 8, alpha: 0.72 });

    this.graphics
      .moveTo(inPoint.x, inPoint.y)
      .lineTo(center.x, center.y)
      .lineTo(outPoint.x, outPoint.y)
      .stroke({
        color: saturated ? BELT_SATURATED : beltTierOf(building.typeId) === 'fast' ? BELT_FAST_PATH : BELT_PATH,
        width: 3,
        alpha: 0.86,
      });

    this.graphics
      .moveTo(inPoint.x, inPoint.y)
      .lineTo(center.x, center.y)
      .lineTo(outPoint.x, outPoint.y)
      .stroke({ color: BELT_DATA_LINE, width: 1, alpha: 0.2 });
  }

  private edgePoint(baseX: number, baseY: number, side: Direction): TileCoord {
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
}
