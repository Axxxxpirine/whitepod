import { TILE_SIZE } from '../constants';
import { worldSideOf, worldTileOf } from '../data/ConnectionRegistry';
import { Direction, PortKind, type Building, type BuildingType, type TileCoord } from '../types';
import { PIXI } from '@/design/tokens';

// DESIGN.md keeps amber for warnings and never pairs it with cyan: what comes
// in is cyan (data), what goes out is ivory.
const INPUT_COLOR = PIXI.accent;
const OUTPUT_COLOR = PIXI.ink;

export function drawBuildingPortMarkers(
  draw: {
    moveTo: (x: number, y: number) => void;
    lineTo: (x: number, y: number) => void;
    stroke: (style: { color: number; width: number; alpha?: number }) => void;
    circle: (x: number, y: number, radius: number) => void;
    fill: (style: { color: number; alpha?: number }) => void;
  },
  building: Building,
  type: BuildingType,
): void {
  for (const port of type.ports) {
    const worldTile = worldTileOf(port, building.origin, building.rotation, type.footprint);
    const worldSide = worldSideOf(port, building.rotation);
    const center = tileCenter(worldTile);
    const edge = edgePoint(worldTile, worldSide);
    const color = port.kind === PortKind.Input ? INPUT_COLOR : OUTPUT_COLOR;

    draw.moveTo(center.x, center.y);
    draw.lineTo(edge.x, edge.y);
    draw.stroke({
      color,
      width: 3,
      alpha: 0.95,
    });
    draw.circle(edge.x, edge.y, 2.5);
    draw.fill({ color, alpha: 1 });
  }
}

function tileCenter(tile: TileCoord): TileCoord {
  return {
    x: tile.x * TILE_SIZE + TILE_SIZE / 2,
    y: tile.y * TILE_SIZE + TILE_SIZE / 2,
  };
}

function edgePoint(tile: TileCoord, side: Direction): TileCoord {
  const cx = tile.x * TILE_SIZE + TILE_SIZE / 2;
  const cy = tile.y * TILE_SIZE + TILE_SIZE / 2;
  const offset = TILE_SIZE / 2 - 6;

  switch (side) {
    case Direction.North:
      return { x: cx, y: cy - offset };
    case Direction.East:
      return { x: cx + offset, y: cy };
    case Direction.South:
      return { x: cx, y: cy + offset };
    case Direction.West:
      return { x: cx - offset, y: cy };
  }
}
