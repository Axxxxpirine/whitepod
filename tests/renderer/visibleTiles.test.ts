import { describe, expect, it } from 'vitest';
import type { VisibleTileRange } from '@/game/engine/Viewport';
import { forEachTileEntering } from '@/game/renderer/visibleTiles';

function entering(previous: VisibleTileRange, next: VisibleTileRange): string[] {
  const tiles: string[] = [];
  forEachTileEntering(previous, next, (tx, ty) => tiles.push(`${tx},${ty}`));
  return tiles.sort();
}

/** The definition, tile by tile: in `next` and not in `previous`. */
function expected(previous: VisibleTileRange, next: VisibleTileRange): string[] {
  const tiles: string[] = [];
  for (let ty = next.y0; ty <= next.y1; ty++) {
    for (let tx = next.x0; tx <= next.x1; tx++) {
      const wasVisible = tx >= previous.x0 && tx <= previous.x1 && ty >= previous.y0 && ty <= previous.y1;
      if (!wasVisible) tiles.push(`${tx},${ty}`);
    }
  }
  return tiles.sort();
}

describe('forEachTileEntering', () => {
  const view: VisibleTileRange = { x0: 10, y0: 10, x1: 20, y1: 16 };

  it('visits the whole range when nothing was visible before', () => {
    const nothing = { x0: -1, y0: -1, x1: -1, y1: -1 };
    expect(entering(nothing, view)).toHaveLength(11 * 7);
  });

  it('visits nothing when the range has not moved or has shrunk', () => {
    expect(entering(view, view)).toEqual([]);
    expect(entering(view, { x0: 12, y0: 11, x1: 18, y1: 15 })).toEqual([]);
  });

  it('visits only the strip a one-tile move brings into view', () => {
    expect(entering(view, { x0: 11, y0: 10, x1: 21, y1: 16 })).toEqual(
      Array.from({ length: 7 }, (_, row) => `21,${10 + row}`).sort(),
    );
  });

  it.each<[string, VisibleTileRange]>([
    ['a diagonal move', { x0: 13, y0: 12, x1: 23, y1: 18 }],
    ['a move up and left', { x0: 7, y0: 8, x1: 17, y1: 14 }],
    ['a zoom out', { x0: 4, y0: 6, x1: 26, y1: 20 }],
    ['a jump elsewhere', { x0: 100, y0: 100, x1: 110, y1: 106 }],
    ['a range that only touches the old one', { x0: 20, y0: 16, x1: 30, y1: 22 }],
  ])('matches the tile-by-tile definition for %s', (_label, next) => {
    expect(entering(view, next)).toEqual(expected(view, next));
  });
});
