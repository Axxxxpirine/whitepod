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
  private lastVisibleRange = { x0: 0, y0: 0, x1: 0, y1: 0 };

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
    const visibleRange = this.engine.getVisibleTiles();

    this.beltContainer.x = -viewport.centerX * viewport.zoom + viewport.screenWidth / 2;
    this.beltContainer.y = -viewport.centerY * viewport.zoom + viewport.screenHeight / 2;
    this.beltContainer.scale.set(viewport.zoom);

    const rangeChanged =
      visibleRange.x0 !== this.lastVisibleRange.x0 ||
      visibleRange.y0 !== this.lastVisibleRange.y0 ||
      visibleRange.x1 !== this.lastVisibleRange.x1 ||
      visibleRange.y1 !== this.lastVisibleRange.y1;

    if (!this.worldDirty && !rangeChanged) return;

    // The simulation notifies on every extraction beat: belts only look
    // different when one is built, removed, upgraded, or changes saturation.
    const saturatedSegments = this.engine.getSaturatedBeltSegments();
    const drawnKey = `${this.engine.buildings.revision}:${saturatedSegments.join(',')}`;
    this.worldDirty = false;
    if (!rangeChanged && drawnKey === this.lastDrawnKey) return;
    this.lastDrawnKey = drawnKey;
    this.lastVisibleRange = { ...visibleRange };

    this.graphics.clear();

    const saturated = new Set(saturatedSegments);
    for (const building of this.engine.getBuildings().values()) {
      if (!isBeltTypeId(building.typeId)) continue;
      if (!this.isVisible(building, visibleRange)) continue;
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

  private isVisible(
    building: Building,
    visibleRange: { x0: number; y0: number; x1: number; y1: number },
  ): boolean {
    return (
      building.origin.x >= visibleRange.x0 &&
      building.origin.x <= visibleRange.x1 &&
      building.origin.y >= visibleRange.y0 &&
      building.origin.y <= visibleRange.y1
    );
  }
}
