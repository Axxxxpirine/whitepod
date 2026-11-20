import { ISO_TILE_H, ISO_TILE_W } from '../constants';
import { worldSideOf, worldTileOf } from '../data/ConnectionRegistry';
import { tileCenterToIso } from '../engine/IsoTransform';
import { Direction, PortKind, type Building, type BuildingType, type TileCoord } from '../types';
import { PIXI } from '@/design/tokens';

const INPUT_COLOR = PIXI.accent;
const OUTPUT_COLOR = PIXI.accentWarm;

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
    const center = tileCenterToIso(worldTile.x, worldTile.y);
    const edge = edgePoint(worldTile, worldSide);
    const color = port.kind === PortKind.Input ? INPUT_COLOR : OUTPUT_COLOR;

    draw.moveTo(center.wx, center.wy);
    draw.lineTo(edge.x, edge.y);
    draw.stroke({
      color,
      width: 2,
      alpha: 0.95,
    });
    draw.circle(edge.x, edge.y, 2);
    draw.fill({ color, alpha: 1 });
  }
}

function edgePoint(tile: TileCoord, side: Direction): { x: number; y: number } {
  // Iso edge midpoint between tile and its logical neighbor on `side`.
  // (See BeltToolController.getPortAnchor for the matching offsets.)
  const center = tileCenterToIso(tile.x, tile.y);
  // Pull the marker slightly inward from the exact midpoint so it reads as
  // attached to this building rather than floating between two diamonds.
  const dx = ISO_TILE_W * 0.22;
  const dy = ISO_TILE_H * 0.22;

  switch (side) {
    case Direction.North:
      return { x: center.wx + dx, y: center.wy - dy };
    case Direction.East:
      return { x: center.wx + dx, y: center.wy + dy };
    case Direction.South:
      return { x: center.wx - dx, y: center.wy + dy };
    case Direction.West:
      return { x: center.wx - dx, y: center.wy - dy };
  }
}
