import { Container, Graphics, Sprite, Texture, type Application } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import {
  getBuildingShadowGeometry,
  getPowerIndicatorColor,
  BuildingRenderer,
} from '@/game/renderer/BuildingRenderer';
import { PIXI } from '@/design/tokens';
import { GameEngine } from '@/game/engine/GameEngine';
import { ISO_TILE_H, ISO_TILE_W } from '@/game/constants';
import { tileCenterToIso } from '@/game/engine/IsoTransform';
import { SOLAR_PANEL_BUILDING_TYPE_ID, STORAGE_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { TileType } from '@/game/types';

vi.mock('@/game/renderer/TileSprite', () => ({
  getBuildingTexture: () => Texture.WHITE,
}));

type BuildingRendererTestApi = {
  activeSprites: Map<number, Sprite>;
  activeShadows: Map<number, Graphics>;
};

function isoFootprintBaseline(originX: number, originY: number, w: number, h: number) {
  const center = tileCenterToIso(originX + (w - 1) / 2, originY + (h - 1) / 2);
  const bboxHeight = (w + h) * (ISO_TILE_H / 2);
  return {
    baselineX: center.wx,
    baselineY: center.wy + bboxHeight / 2,
    footprintCenter: center,
  };
}

describe('BuildingRenderer power indicator color', () => {
  it('maps power states to indicator colors', () => {
    expect(getPowerIndicatorColor('powered')).toBe(PIXI.ok);
    expect(getPowerIndicatorColor('unpowered')).toBe(PIXI.error);
    expect(getPowerIndicatorColor('neutral')).toBeNull();
  });
});

describe('BuildingRenderer iso projection placement', () => {
  it('keeps shadow ellipse offset toward NW and inside the iso footprint base', () => {
    const engine = new GameEngine(800, 600);
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    const id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 4, y: 5 })!;
    const building = engine.getBuildings().get(id)!;

    const geometry = getBuildingShadowGeometry(building)!;
    const { baselineX, baselineY, footprintCenter } = isoFootprintBaseline(4, 5, 1, 1);

    // SE-light convention: shadow drifts NW (smaller x, smaller y).
    expect(geometry.centerX).toBeLessThan(baselineX);
    expect(geometry.centerY).toBeLessThan(baselineY);
    // Shadow base sits at-or-above the footprint south vertex.
    expect(geometry.centerY + geometry.radiusY).toBeLessThanOrEqual(baselineY);
    // Roughly hugs the iso footprint width.
    expect(geometry.radiusX).toBeGreaterThan(ISO_TILE_W * 0.35);
    // Vertically squashed to read as a low-angle drop.
    expect(geometry.radiusY).toBeLessThan(geometry.radiusX);
    // Shadow sits near the footprint center horizontally (NW offset is small).
    expect(Math.abs(geometry.centerX - footprintCenter.wx)).toBeLessThan(ISO_TILE_W * 0.5);
  });

  it('bottom-anchors generated RTS sprites to the iso footprint baseline', () => {
    const engine = new GameEngine(800, 600);
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    const focusCenter = tileCenterToIso(4, 5);
    engine.viewport.centerX = focusCenter.wx;
    engine.viewport.centerY = focusCenter.wy;
    const id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 4, y: 5 })!;
    const renderer = new BuildingRenderer({ stage: new Container() } as unknown as Application, engine);

    renderer.render();

    const sprite = (renderer as unknown as BuildingRendererTestApi).activeSprites.get(id)!;
    const { baselineX, baselineY } = isoFootprintBaseline(4, 5, 1, 1);
    expect(sprite.anchor.x).toBe(0.5);
    expect(sprite.anchor.y).toBe(1);
    expect(sprite.x).toBeCloseTo(baselineX);
    expect(sprite.y).toBeCloseTo(baselineY);
    expect(sprite.height).toBeGreaterThan(ISO_TILE_H);

    renderer.destroy();
  });

  it('preserves a wider visual footprint than the height for RTS sprites', () => {
    const engine = new GameEngine(800, 600);
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    const focusCenter = tileCenterToIso(4, 5);
    engine.viewport.centerX = focusCenter.wx;
    engine.viewport.centerY = focusCenter.wy;
    const id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 4, y: 5 })!;
    const renderer = new BuildingRenderer({ stage: new Container() } as unknown as Application, engine);

    renderer.render();

    const sprite = (renderer as unknown as BuildingRendererTestApi).activeSprites.get(id)!;
    const { baselineY } = isoFootprintBaseline(4, 5, 1, 1);
    expect(sprite.width).toBeGreaterThan(sprite.height);
    expect(sprite.y).toBeCloseTo(baselineY);

    renderer.destroy();
  });

  it('Y-sorts taller RTS sprites by their iso footprint baseline (south first)', () => {
    const engine = new GameEngine(800, 600);
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    const focusCenter = tileCenterToIso(8, 6);
    engine.viewport.centerX = focusCenter.wx;
    engine.viewport.centerY = focusCenter.wy;
    // Storage at (8, 9) — south of solar at (8, 3) in logical coords. In iso,
    // the storage's iso baseline Y is greater (further down screen) so it
    // should overlap the solar.
    const nearId = engine.placeBuilding(STORAGE_BUILDING_TYPE_ID, { x: 8, y: 9 })!;
    const farId = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 8, y: 3 })!;
    const renderer = new BuildingRenderer({ stage: new Container() } as unknown as Application, engine);

    renderer.render();

    const sprites = (renderer as unknown as BuildingRendererTestApi).activeSprites;
    expect(sprites.get(nearId)!.zIndex).toBeGreaterThan(sprites.get(farId)!.zIndex);
    expect((renderer as unknown as BuildingRendererTestApi).activeShadows.size).toBe(2);

    renderer.destroy();
  });
});
