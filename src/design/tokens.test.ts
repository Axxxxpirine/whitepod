/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { DESIGN_TOKENS } from './tokens';

const here = dirname(fileURLToPath(import.meta.url));
const cssSource = readFileSync(resolve(here, '../index.css'), 'utf8');

const cssVarFor = (key: string) =>
  key
    .replace(/([A-Z])/g, '-$1')
    .replace(/([a-z])(\d)/g, '$1-$2')
    .toLowerCase();

describe('design tokens sync', () => {
  it('every color token in tokens.ts matches its CSS variable in index.css', () => {
    for (const [key, token] of Object.entries(DESIGN_TOKENS.color)) {
      const varName = `--color-${cssVarFor(key)}`;
      const re = new RegExp(`${varName}\\s*:\\s*(#[0-9A-Fa-f]{6})\\b`);
      const match = cssSource.match(re);
      expect(match, `missing ${varName} in src/index.css`).not.toBeNull();
      expect(
        match![1].toUpperCase(),
        `${varName} in CSS (${match![1]}) does not match DESIGN_TOKENS.color.${key} (${token.css})`,
      ).toBe(token.css.toUpperCase());
    }
  });

  it('every color hex is a valid 6-digit hex', () => {
    for (const [key, token] of Object.entries(DESIGN_TOKENS.color)) {
      expect(token.css, `${key} must be #RRGGBB`).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(token.pixi).toBeGreaterThanOrEqual(0);
      expect(token.pixi).toBeLessThanOrEqual(0xffffff);
    }
  });
});
