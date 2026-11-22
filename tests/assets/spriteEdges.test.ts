import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/**
 * A sprite whose art reaches the edge of its file was cut when it was taken
 * from its sheet (part of the object is missing, or a piece of the next one
 * shows up). Re-cut it with scripts/sprites/recut_sprites.py.
 */

const SPRITES = join(process.cwd(), 'public', 'sprites', 'rts');
const FOLDERS = ['buildings', 'resources', 'terrain'];
/** Alpha above which a pixel counts as art. */
const OPAQUE = 16;

interface Rgba {
  readonly width: number;
  readonly height: number;
  readonly alpha: (x: number, y: number) => number;
}

/** Minimal PNG reader for 8-bit, non-interlaced RGBA files (the sprite format). */
function readRgbaPng(path: string): Rgba {
  const file = readFileSync(path);
  let offset = 8;
  let width = 0;
  let height = 0;
  const data: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString('ascii', offset + 4, offset + 8);
    const body = file.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error(`${path}: expected 8-bit RGBA, non-interlaced`);
    } else if (type === 'IDAT') {
      data.push(body);
    }
    offset += 12 + length;
  }

  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 4;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const value = raw[y * (stride + 1) + 1 + i];
      const left = i >= 4 ? pixels[y * stride + i - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + i] : 0;
      const upLeft = y > 0 && i >= 4 ? pixels[(y - 1) * stride + i - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + i] = (value + predictor) & 0xff;
    }
  }
  return { width, height, alpha: (x, y) => pixels[y * stride + x * 4 + 3] };
}

function edgesTouched({ width, height, alpha }: Rgba): string[] {
  const touched: string[] = [];
  const any = (count: number, at: (i: number) => number) => {
    for (let i = 0; i < count; i++) if (at(i) > OPAQUE) return true;
    return false;
  };
  if (any(width, (x) => alpha(x, 0))) touched.push('top');
  if (any(width, (x) => alpha(x, height - 1))) touched.push('bottom');
  if (any(height, (y) => alpha(0, y))) touched.push('left');
  if (any(height, (y) => alpha(width - 1, y))) touched.push('right');
  return touched;
}

const sprites = FOLDERS.flatMap((folder) =>
  readdirSync(join(SPRITES, folder))
    .filter((name) => name.endsWith('.png'))
    .map((name) => `${folder}/${name}`),
);

describe('RTS sprites', () => {
  it('finds the sprites', () => {
    expect(sprites.length).toBeGreaterThanOrEqual(24);
  });

  it.each(sprites)('%s keeps its art inside the file (not cut from its sheet)', (sprite) => {
    expect(edgesTouched(readRgbaPng(join(SPRITES, sprite)))).toEqual([]);
  });
});
