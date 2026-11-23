import type { VisibleTileRange } from '../engine/Viewport';

/**
 * Calls `visit` for every tile of `next` that `previous` did not cover: the
 * strips a camera move brings into view. Layers that keep a sprite per visible
 * tile look only there for new sprites, instead of scanning the whole range
 * each time the camera crosses a tile (65 000 tiles when zoomed out).
 */
export function forEachTileEntering(
  previous: VisibleTileRange,
  next: VisibleTileRange,
  visit: (tx: number, ty: number) => void,
): void {
  for (let ty = next.y0; ty <= next.y1; ty++) {
    if (ty < previous.y0 || ty > previous.y1) {
      for (let tx = next.x0; tx <= next.x1; tx++) visit(tx, ty);
      continue;
    }
    // The row was visible: only what lies left and right of its old extent is new.
    const leftEnd = Math.min(previous.x0 - 1, next.x1);
    for (let tx = next.x0; tx <= leftEnd; tx++) visit(tx, ty);
    const rightStart = Math.max(previous.x1 + 1, next.x0);
    for (let tx = rightStart; tx <= next.x1; tx++) visit(tx, ty);
  }
}
