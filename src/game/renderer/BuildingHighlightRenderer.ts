import { Container, Graphics, type Application } from 'pixi.js';
import { TILE_SIZE } from '../constants';
import { getBuildingType } from '../data/buildingCatalog';
import type { GameEngine } from '../engine/GameEngine';
import type { SelectedTool } from '../types';
import { getHighlightTargets } from '../ui/buildingPresentation';

const PULSE_PERIOD_MS = 1250;
// Alpha oscillates base ± amplitude — kept well above 0 so the outline reads
// as "always there, breathing" rather than fading in/out.
const PULSE_BASE = 0.75;
const PULSE_AMPLITUDE = 0.2;
const STROKE_WIDTH = 3;
const INSET = 1;
const CORNER_RADIUS = 4;

interface HighlightState {
  readonly selectedTool: SelectedTool;
}

/**
 * Renders a subtle pulsing outline on every existing building that belongs to
 * the active tool's family. Drives its animation from performance.now() so it
 * needs no store subscription beyond the standard getState() poll each frame.
 */
export class BuildingHighlightRenderer {
  private readonly container: Container;
  private readonly graphics: Graphics;
  private readonly engine: GameEngine;
  private readonly getState: () => HighlightState;
  private hadHighlights = false;

  constructor(app: Application, engine: GameEngine, getState: () => HighlightState) {
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

    const { selectedTool } = this.getState();
    const targets = getHighlightTargets(selectedTool, this.engine);
    if (!targets || targets.buildingIds.length === 0) {
      if (this.hadHighlights) {
        this.graphics.clear();
        this.hadHighlights = false;
      }
      return;
    }

    this.graphics.clear();
    this.hadHighlights = true;

    const alpha =
      PULSE_BASE + PULSE_AMPLITUDE * Math.sin((performance.now() * 2 * Math.PI) / PULSE_PERIOD_MS);

    const buildings = this.engine.getBuildings();
    for (const id of targets.buildingIds) {
      const building = buildings.get(id);
      if (!building) continue;
      const type = getBuildingType(building.typeId);
      if (!type) continue;

      this.graphics
        .roundRect(
          building.origin.x * TILE_SIZE + INSET,
          building.origin.y * TILE_SIZE + INSET,
          type.footprint.w * TILE_SIZE - INSET * 2,
          type.footprint.h * TILE_SIZE - INSET * 2,
          CORNER_RADIUS,
        )
        .stroke({ color: targets.color, width: STROKE_WIDTH, alpha });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
