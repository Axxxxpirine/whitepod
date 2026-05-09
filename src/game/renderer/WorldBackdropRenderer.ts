import { ImageSource, Sprite, Texture, type Application } from 'pixi.js';

const BACKDROP_INNER = '#0B0D10';
const BACKDROP_MID = '#080A0D';
const BACKDROP_OUTER = '#04060A';

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

    const radius = Math.max(width, height) * 0.72;
    const gradient = this.ctx.createRadialGradient(
      width * 0.5,
      height * 0.48,
      0,
      width * 0.5,
      height * 0.5,
      radius,
    );
    gradient.addColorStop(0, BACKDROP_INNER);
    gradient.addColorStop(0.62, BACKDROP_MID);
    gradient.addColorStop(1, BACKDROP_OUTER);

    this.ctx.fillStyle = gradient;
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
