import { Container, Graphics, Sprite, Texture, type Application } from 'pixi.js';
import { describe, expect, it, vi } from 'vitest';
import { getPowerIndicatorColor, BuildingRenderer } from '@/game/renderer/BuildingRenderer';
import { PIXI } from '@/design/tokens';
import { GameEngine } from '@/game/engine/GameEngine';
import { TILE_SIZE } from '@/game/constants';
import { SOLAR_PANEL_BUILDING_TYPE_ID, STORAGE_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { TileType } from '@/game/types';

vi.mock('@/game/renderer/TileSprite', () => ({
  getBuildingTexture: () => Texture.WHITE,
}));

type BuildingRendererTestApi = {
  activeSprites: Map<number, Sprite>;
  activeShadows: Map<number, Graphics>;
};

describe('BuildingRenderer power indicator color', () => {
  it('maps power states to indicator colors', () => {
    expect(getPowerIndicatorColor('powered')).toBe(PIXI.ok);
    expect(getPowerIndicatorColor('unpowered')).toBe(PIXI.error);
    expect(getPowerIndicatorColor('neutral')).toBeNull();
  });
});

describe('BuildingRenderer RTS sprite placement', () => {
  it('bottom-anchors generated RTS sprites to the gameplay footprint baseline', () => {
    const engine = new GameEngine(800, 600);
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    engine.viewport.centerX = 5 * TILE_SIZE;
    engine.viewport.centerY = 6 * TILE_SIZE;
    const id = engine.placeBuilding(SOLAR_PANEL_BUILDING_TYPE_ID, { x: 4, y: 5 })!;
    const renderer = new BuildingRenderer({ stage: new Container() } as unknown as Application, engine);

    renderer.render();

    const sprite = (renderer as unknown as BuildingRendererTestApi).activeSprites.get(id)!;
    expect(sprite.anchor.x).toBe(0.5);
    expect(sprite.anchor.y).toBe(1);
    expect(sprite.x).toBeCloseTo((4 + 0.5) * TILE_SIZE);
    expect(sprite.y).toBeCloseTo(6 * TILE_SIZE - 2);
    expect(sprite.height).toBeGreaterThan(TILE_SIZE);

    renderer.destroy();
  });

  it('sorts taller RTS sprites by their footprint baseline', () => {
    const engine = new GameEngine(800, 600);
    engine.grid.fill(TileType.Ground);
    engine.grid.revealAll();
    engine.viewport.centerX = 10 * TILE_SIZE;
    engine.viewport.centerY = 10 * TILE_SIZE;
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
