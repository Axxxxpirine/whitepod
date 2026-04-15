import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

export function toIndex(x: number, y: number): number {
  return y * GRID_WIDTH + x;
}

export function toCoord(index: number): { x: number; y: number } {
  return {
    x: index % GRID_WIDTH,
    y: Math.floor(index / GRID_WIDTH),
  };
}

export function isInBounds(x: number, y: number): boolean {
  return x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT;
}

// Direction offsets aligned with Direction const: [North, East, South, West]
const NEIGHBOR_DX = [0, 1, 0, -1];
const NEIGHBOR_DY = [-1, 0, 1, 0];

// Diagonal offsets: [NE, SE, SW, NW]
const DIAG_DX = [1, 1, -1, -1];
const DIAG_DY = [-1, 1, 1, -1];

export function getNeighbor(x: number, y: number, dir: number): number {
  const nx = x + NEIGHBOR_DX[dir];
  const ny = y + NEIGHBOR_DY[dir];
  if (!isInBounds(nx, ny)) return -1;
  return toIndex(nx, ny);
}

export function getNeighbors4(x: number, y: number): number[] {
  const result: number[] = [];
  for (let d = 0; d < 4; d++) {
    const idx = getNeighbor(x, y, d);
    if (idx !== -1) result.push(idx);
  }
  return result;
}

export function getNeighbors8(x: number, y: number): number[] {
  const result = getNeighbors4(x, y);
  for (let d = 0; d < 4; d++) {
    const nx = x + DIAG_DX[d];
    const ny = y + DIAG_DY[d];
    if (isInBounds(nx, ny)) result.push(toIndex(nx, ny));
  }
  return result;
}

export function* iterateRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Generator<number> {
  const startX = Math.max(0, x0);
  const startY = Math.max(0, y0);
  const endX = Math.min(GRID_WIDTH - 1, x1);
  const endY = Math.min(GRID_HEIGHT - 1, y1);
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      yield toIndex(x, y);
    }
  }
}
