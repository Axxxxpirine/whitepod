import { Graphics, type Application } from 'pixi.js';
import type { GameEngine } from '../engine/GameEngine';

const DAY_ALPHA = 0.0;
const NIGHT_ALPHA = 0.18;
const NIGHT_COLOR = 0x0a1628;
const DAYLIGHT_BOOST_MAX_ALPHA = 0.10;
const DAYLIGHT_BOOST_COLOR = 0xfff7dc;

const DAWN_START = 5 / 24;  // 05:00
const DAWN_END   = 7 / 24;  // 07:00
const DUSK_START = 17 / 24; // 17:00
const DUSK_END   = 19 / 24; // 19:00

export function getDaylightFactor(simulationTime: number): number {
  const wrapped = ((simulationTime % 1) + 1) % 1;
  if (wrapped < DAWN_START || wrapped >= DUSK_END) return 0;
  if (wrapped >= DAWN_END && wrapped < DUSK_START) return 1;
  if (wrapped < DAWN_END) {
    const t = (wrapped - DAWN_START) / (DAWN_END - DAWN_START);
    return t * t * (3 - 2 * t);
  }
  const t = (wrapped - DUSK_START) / (DUSK_END - DUSK_START);
  return 1 - t * t * (3 - 2 * t);
}

export function getNightOverlayAlpha(simulationTime: number): number {
  const daylight = getDaylightFactor(simulationTime);
  return DAY_ALPHA + (1 - daylight) * (NIGHT_ALPHA - DAY_ALPHA);
}

export function getDaylightBoostAlpha(simulationTime: number): number {
  const daylight = getDaylightFactor(simulationTime);
  return daylight * DAYLIGHT_BOOST_MAX_ALPHA;
}

export class DayNightOverlayRenderer {
  private readonly nightOverlay: Graphics;
  private readonly daylightOverlay: Graphics;
  private readonly app: Application;
  private readonly engine: GameEngine;
  private lastNightAlpha = -1;
  private lastDaylightAlpha = -1;
  private lastWidth = -1;
  private lastHeight = -1;

  constructor(app: Application, engine: GameEngine) {
    this.app = app;
    this.engine = engine;
    this.nightOverlay = new Graphics();
    this.daylightOverlay = new Graphics();
    this.nightOverlay.eventMode = 'none';
    this.daylightOverlay.eventMode = 'none';
    this.app.stage.addChild(this.daylightOverlay);
    this.app.stage.addChild(this.nightOverlay);
  }

  render(): void {
    const nightAlpha = getNightOverlayAlpha(this.engine.simulationTime);
    const daylightAlpha = getDaylightBoostAlpha(this.engine.simulationTime);
    const width = this.app.screen.width;
    const height = this.app.screen.height;

    if (
      Math.abs(nightAlpha - this.lastNightAlpha) < 0.002 &&
      Math.abs(daylightAlpha - this.lastDaylightAlpha) < 0.002 &&
      width === this.lastWidth &&
      height === this.lastHeight
    ) {
      return;
    }

    this.daylightOverlay.clear();
    if (daylightAlpha > 0) {
      this.daylightOverlay.rect(0, 0, width, height).fill({ color: DAYLIGHT_BOOST_COLOR, alpha: daylightAlpha });
    }

    this.nightOverlay.clear();
    if (nightAlpha > 0) {
      this.nightOverlay.rect(0, 0, width, height).fill({ color: NIGHT_COLOR, alpha: nightAlpha });
    }

    this.lastNightAlpha = nightAlpha;
    this.lastDaylightAlpha = daylightAlpha;
    this.lastWidth = width;
    this.lastHeight = height;
  }

  destroy(): void {
    this.nightOverlay.destroy();
    this.daylightOverlay.destroy();
  }
}
