// SINGLE SOURCE OF TRUTH mirrored by the @theme block in src/index.css.
// Change a color here AND there together. tokens.test.ts enforces the sync.

const hex = (s: `#${string}`) => ({
  css: s,
  pixi: Number.parseInt(s.slice(1), 16),
});

export const DESIGN_TOKENS = {
  color: {
    bg: hex('#0B0D10'),
    surface: hex('#14171C'),
    surface2: hex('#1C2027'),
    border: hex('#2A3038'),
    ink: hex('#E8E6DF'),
    inkMuted: hex('#8A8F98'),
    accent: hex('#6EE7FF'),
    accentWarm: hex('#F2B36B'),
    accentViolet: hex('#A78BFA'),
    ok: hex('#5EE2A0'),
    error: hex('#FF6B6B'),
    gridTile: hex('#242830'),
    gridTileRock: hex('#2F343C'),
    gridLine: hex('#3A3F48'),
  },
  radius: { none: 0, sm: 2, md: 4, pill: 9999 },
  spacing: [2, 4, 8, 12, 16, 24, 32, 48, 64] as const,
  motion: {
    durations: { hover: 80, tab: 100, popover: 120, panel: 180 },
    easing: {
      out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      in: 'cubic-bezier(0.6, 0.0, 0.8, 0.2)',
      inout: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
    },
  },
} as const;

type ColorKey = keyof typeof DESIGN_TOKENS.color;

export const PIXI = Object.fromEntries(
  (Object.entries(DESIGN_TOKENS.color) as [ColorKey, { css: string; pixi: number }][]).map(
    ([k, v]) => [k, v.pixi],
  ),
) as Record<ColorKey, number>;
