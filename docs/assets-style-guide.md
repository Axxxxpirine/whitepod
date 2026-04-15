# Whitepod Asset Style Guide

Reference sheet: `public/assets.png`

## Visual Rules

- Chunky industrial forms with clear outlines.
- Muted steel surfaces with cyan, green, amber, and violet accents.
- Isometric or slightly top-down framing.
- UI should feel like hardware from a lunar control room.
- Keep glow subtle and reserve strong color for state or emphasis.

## Asset Families

- `tiles/`: resource and machine tiles for the grid.
- `icons/`: compact badges for HUD and menus.
- `cards/`: larger illustrated resource or station cards.
- `ui/`: frame assets, chips, badges, bars, controls, and HUD icons.

## Mapping Intent

- Tier 0: cyan.
- Tier 1: green.
- Tier 2: amber.
- Tier 3: violet.

## Fallback Strategy

- Prefer deterministic SVG placeholders while the final art set is being produced.
- Keep file names stable so the renderer can swap in raster or hand-painted art later without changing asset IDs.
