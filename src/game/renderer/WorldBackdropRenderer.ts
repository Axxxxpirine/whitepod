import { ImageSource, Sprite, Texture, type Application } from 'pixi.js';

// Stronger backdrop gradient: the perceptible delta between center and edge
// is larger than the original (#0B0D10 -> #04060A), so the iso play-field now
// sits inside a clearly visible "lit area" surrounded by deep-space dark.
const BACKDROP_INNER = '#10131A';
const BACKDROP_MID = '#0A0C12';
const BACKDROP_OUTER = '#02040A';
// Vignette darkens the screen corners further, focusing attention on the
// play-field center. Alpha tops out at ~0.55 in the corners.
const VIGNETTE_INNER = 'rgba(0, 0, 0, 0)';
const VIGNETTE_OUTER = 'rgba(0, 0, 0, 0.55)';

export class WorldBackdropRenderer {
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

    // Layer 1 — radial backdrop (planetary atmosphere).
    const backdropRadius = Math.max(width, height) * 0.7;
    const backdrop = this.ctx.createRadialGradient(
      width * 0.5,
      height * 0.46,
      0,
      width * 0.5,
      height * 0.5,
      backdropRadius,
    );
    backdrop.addColorStop(0, BACKDROP_INNER);
    backdrop.addColorStop(0.55, BACKDROP_MID);
    backdrop.addColorStop(1, BACKDROP_OUTER);

    this.ctx.fillStyle = backdrop;
    this.ctx.fillRect(0, 0, width, height);

    // Layer 2 — vignette (screen corners darker than center).
    const vignetteRadius = Math.hypot(width, height) * 0.62;
    const vignette = this.ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.35,
      width * 0.5,
      height * 0.5,
      vignetteRadius,
    );
    vignette.addColorStop(0, VIGNETTE_INNER);
    vignette.addColorStop(1, VIGNETTE_OUTER);
    this.ctx.fillStyle = vignette;
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
