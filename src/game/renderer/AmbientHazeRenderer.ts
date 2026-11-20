import { ImageSource, Sprite, Texture, type Application } from 'pixi.js';

// Atmospheric edge haze: a screen-space overlay rendered ON TOP of the world,
// darkening the screen corners and adding a faint cool-blue tint at the
// extremes. Drives the "playfield is the focus, distance fades into space"
// reading without touching world-space rendering.
const HAZE_INNER = 'rgba(0, 0, 0, 0)';
const HAZE_MID = 'rgba(2, 6, 14, 0.18)';
const HAZE_OUTER = 'rgba(2, 6, 14, 0.42)';
// Cool-blue tint band that rides the same falloff — earthlight bleed at the
// horizon when zoomed out.
const EARTHLIGHT_OUTER = 'rgba(26, 42, 58, 0.22)';

export class AmbientHazeRenderer {
  private readonly app: Application;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: Texture;
  private readonly sprite: Sprite;
  private lastWidth = -1;
  private lastHeight = -1;

  constructor(app: Application) {
    this.app = app;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new Texture({ source: new ImageSource({ resource: this.canvas }) });
    this.sprite = new Sprite(this.texture);
    this.sprite.eventMode = 'none';
    app.stage.addChild(this.sprite);
    this.render();
  }

  render(): void {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    if (width === this.lastWidth && height === this.lastHeight) return;
    if (width <= 0 || height <= 0) return;

    this.canvas.width = width;
    this.canvas.height = height;

    this.ctx.clearRect(0, 0, width, height);

    // Vignette: clear in the middle, deep dark in the corners.
    const vignetteRadius = Math.hypot(width, height) * 0.6;
    const vignette = this.ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.32,
      width * 0.5,
      height * 0.5,
      vignetteRadius,
    );
    vignette.addColorStop(0, HAZE_INNER);
    vignette.addColorStop(0.65, HAZE_MID);
    vignette.addColorStop(1, HAZE_OUTER);
    this.ctx.fillStyle = vignette;
    this.ctx.fillRect(0, 0, width, height);

    // Earthlight bleed at the very edges.
    const earthGradient = this.ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.5,
      width * 0.5,
      height * 0.5,
      vignetteRadius * 1.05,
    );
    earthGradient.addColorStop(0, HAZE_INNER);
    earthGradient.addColorStop(1, EARTHLIGHT_OUTER);
    this.ctx.fillStyle = earthGradient;
    this.ctx.fillRect(0, 0, width, height);

    this.sprite.width = width;
    this.sprite.height = height;
    this.texture.source.update();
    this.lastWidth = width;
    this.lastHeight = height;
  }

  destroy(): void {
    this.sprite.destroy();
    this.texture.destroy(true);
  }
}
