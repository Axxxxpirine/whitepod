import { Container } from 'pixi.js';

/**
 * A layer of the map (tiles, buildings, belts, overlays). The game reads the
 * pointer itself from the canvas (InputHandler), so these layers never take
 * part in Pixi's hit testing: left interactive, every pointer event walked
 * each of their children (tens of thousands of tile sprites when zoomed out).
 */
export function createWorldLayer(): Container {
  const layer = new Container();
  layer.eventMode = 'none';
  layer.interactiveChildren = false;
  return layer;
}
