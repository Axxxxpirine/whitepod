# Design System — Whitepod

**Direction name:** Architect's Drawing Board
**World asset extension:** RTS Field Model
**Approved:** 2026-04-16 (variant A, Stitch project `7790137728698909132`)
**Mockup reference:** `~/.gstack/projects/Axxxxpirine-whitepod/designs/design-system-20260416-011614/variant-A-hud.png`

## Product context

- **What this is:** grid-based industrial automation game. The player is an architect of a living automated system — belts, buildings, energy networks, fog-of-war exploration.
- **Who it's for:** systems-thinkers who sit with the game for long focused sessions (Factorio / Satisfactory / Shapez 2 audience).
- **Category:** 2D RTS-hybrid factory automation sim.
- **Differentiation:** every competitor in the category looks like a grimy industrial world (muddy browns, rivets, orange rust). Whitepod takes the opposite posture — architectural, clean, systems-as-art. A Steam screenshot should read immediately as "not Factorio".

## Aesthetic direction

- **Direction:** Architect's Drawing Board — technical blueprint aesthetic on a dark matte graphite surface.
- **World asset extension:** RTS Field Model — orthographic 3/4 industrial maquettes from a south-east camera, with gameplay remaining on the rectangular tile grid.
- **Decoration level:** intentional. Hairline 1px rules, ghosted tile grids, subtle grain allowed on panels. Never expressive.
- **Mood:** Dieter Rams + Teenage Engineering manual + ArchDaily dark mode. Calm, precise, confidently typographic. The world animates; the UI stays still.
- **References:** Braun product design, Teenage Engineering OP-1 manual, Figma dark mode, architectural drawing conventions, Dyson Sphere Program's diagrammatic moments (not Satisfactory's gloss).

## Color

**Approach:** restrained. Dark-first. Cool neutrals with a single cold accent (cyan) plus a rare warm alert (amber). Never both at once.

| Token | Hex | Usage |
|---|---|---|
| `--bg` | `#0B0D10` | Base background, world canvas tint |
| `--surface` | `#14171C` | Panel fills |
| `--surface-2` | `#1C2027` | Elevated surfaces (popovers, selected cells) |
| `--border` | `#2A3038` | Hairline 1px borders everywhere |
| `--text` | `#E8E6DF` | Primary text (warm ivory — NEVER pure white) |
| `--text-muted` | `#8A8F98` | Secondary/inactive text |
| `--accent` | `#6EE7FF` | Ice cyan — energy lines, active state, data bars, selection rings |
| `--accent-warm` | `#F2B36B` | Amber — warnings, low-power, bottleneck flags (use sparingly) |
| `--ok` | `#5EE2A0` | Success / healthy state |
| `--error` | `#FF6B6B` | Errors, blocked state |
| `--grid-tile` | `#181A1F` | Play-field ground tile base (warmer than `--bg` so panels read as separate) |
| `--grid-line` | `#2A3038` | 1px hairline tile grid |

**Dark-only.** No light mode. Long-session friendly.

## Typography

| Role | Font | Notes |
|---|---|---|
| Headings / panel titles | **Newsreader** (serif, variable) | Small-caps, tracked `+80`. Only for headings, tooltips, card titles — NEVER body. Zero category competitors use a serif. |
| UI labels, chips, tabs | **Space Grotesk** | 12-13px, small-caps tracked where chip/tab; sentence case in forms. |
| Body, buttons | **Geist** | 13-14px. Geometric sans. |
| **All numeric data** | **Geist Mono** with `font-variant-numeric: tabular-nums` | MANDATORY for flow rates, counters, timers, coordinates, ratios, percentages, resource amounts. No exceptions. |
| Code / debug console | **Geist Mono** | Same as data. |

**Scale (rem at 16px root):**
- `display` 32px / 1.15 / Newsreader small-caps tracked +80
- `h1` 24px / 1.2 / Newsreader small-caps tracked +80
- `h2` 18px / 1.25 / Newsreader small-caps tracked +60
- `label` 12px / 1.3 / Space Grotesk small-caps tracked +80
- `body` 14px / 1.5 / Geist
- `data` 14px / 1.4 / Geist Mono tabular-nums
- `data-xl` 24px / 1.2 / Geist Mono tabular-nums (for hero metrics)
- `caption` 11px / 1.3 / Space Grotesk muted

**Loading:** Google Fonts for Newsreader, Space Grotesk, Geist, Geist Mono — or self-host via `@fontsource`. Preload the two most-used weights to avoid FOIT.

## Spacing

- **Base unit:** 4px. Use Tailwind default scale.
- **Density:** comfortable-dense. Panels breathe but don't waste pixels (this is an info-dense game).
- **Scale:** `2 4 8 12 16 24 32 48 64`. No values between.

## Layout

- **Approach:** grid-disciplined. HUD pinned to screen edges, never floats over the play-field center.
- **HUD zones:** top-left (sim time + speed), top-right (network / energy), right-rail (belt flow), bottom-center (hotbar), bottom-left (active-tool chip). Left rail reserved for mode/navigation when present.
- **Max panel width:** 380px for inspectors, 320px for stats rails.
- **Border radius:** `4px` max on panels, buttons, and cells. Toggles may use full pill. Nothing else goes round.

## Motion

- **Approach:** minimal-functional. The world is alive; the UI is a calm instrument around it.
- **Easing:** `ease-out` for enters, `ease-in` for exits, `ease-in-out` for moves.
- **Duration:** hover `80ms`, popover open `120ms`, panel slide `180ms`, tab change `100ms`. No springs. No bounces.
- **Exception:** cyan energy-flow indicators on belts may pulse subtly at `1200ms` cycle — these read as data, not decoration.

## Iconography

- Line-drawn, 1.5px strokes, no fills, no colored backgrounds.
- Icon color matches surrounding text (`--text` or `--text-muted`); only active icons get `--accent`.
- Never icon-in-colored-circle. Never emoji-style. Source: `lucide-react` (already installed), customize strokes to 1.5px.

## Anti-patterns (do NOT ship)

- Purple/violet gradients (category AI-slop).
- 3-column feature grid with icons in colored circles (marketing-site slop).
- Centered marketing-style hero copy inside the game.
- Bubbly rounded corners above 4px.
- Drop shadows, bevels, inner glows, gloss highlights.
- Orange-rust industrial palette (that's Factorio).
- Pure white `#FFFFFF` text — always warm ivory `#E8E6DF`.
- Sans-serif everywhere — headings MUST be Newsreader serif.
- Proportional digits in numeric readouts — MUST be tabular-nums.

## Applied examples (approved variant A)

The approved HUD includes:
- Top bar: `WHITEPOD.ARCHITECT` wordmark, tabs `SIMULATION / NETWORK / ANALYTICS` in Space Grotesk small-caps, active tab underlined in cyan.
- Left rail: mode list `CONSTRUCT / LOGISTICS / POWER / EXTRACT / SYSTEM`, active item gets cyan left-edge accent.
- Top-right: `NETWORK 01` card (Newsreader small-caps), `1,284 / 1,600 W` big mono, cyan capacity bar.
- Right panel: `BELT FLOW` (Newsreader small-caps), mono rate table with cyan flow dots, muted rows for zero.
- Bottom hotbar: centered, 10 slots, hairline borders, active slot cyan ring, numeric `01-10` labels.
- Bottom-left chip: `BUILD: BELT` in Space Grotesk small-caps on cyan 10%-tint surface with cyan 1px border.
- Play field: dark graphite tiles with faint hairline grid, buildings as 3/4 RTS-hybrid sprites anchored to the bottom-center of their gameplay footprint.

## World asset direction — RTS Field Model

**Camera language:** orthographic 3/4 from the south-east, roughly 55-60 degree pitch. This is a visual model only: the gameplay grid, picking, coordinates, ports, and API remain rectangular 2D.

**Asset generation:** building, resource, and terrain decal bitmaps may be generated through Codex image generation / ChatGPT Image 2. Use flat chroma-key backgrounds for source images, remove the key to RGBA PNG locally, and keep source sheets under `public/sprites/rts/sources/` when they document the pipeline.

**Material language:** matte graphite metal, ceramic technical panels, smoked glass, ivory markings, cold cyan data strips, and rare amber extraction or warning details. Never bake cast shadows into generated assets; shadows belong in Pixi so every sprite shares the same deterministic world lighting.

**Sprite contract:** generated building sprites live under `public/sprites/rts/buildings/`, resource sprites under `public/sprites/rts/resources/`, and terrain decals under `public/sprites/rts/terrain/`. The TypeScript sprite manifest is the source of truth for path, footprint, anchor, display height, and generated/procedural status.

**Implementation constraint:** the building catalog remains the source of truth for gameplay footprint and ports. The sprite manifest can make a building visually taller, but it cannot change placement, pathfinding, energy links, or belt connectivity.

## Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-04-16 | Initial design system created | Synthesis of automation-sim category research + first-principles take that the name "Whitepod" argues against the genre's grimy palette. Approved variant A (Stitch). |
| 2026-04-16 | Drop `--color-accent-violet` token | Violet is listed as a category anti-pattern ("AI-slop"). Merger & watchtower re-mapped to `--color-ink-muted`; icon + hotkey badge still carry identity. |
| 2026-04-16 | Re-add Google Fonts link in `index.html` | Without it, every font variable silently degrades to system fallbacks (Georgia for headings, system-ui for body, SFMono for data), breaking the "headings MUST be Newsreader" anti-pattern rule. Kept Google Fonts over `@fontsource` to avoid adding a dependency. |
| 2026-04-16 | Align grid tokens to DESIGN.md values | `--color-grid-tile` and `--color-grid-line` had drifted in tokens.ts/index.css to brighter values. Reverted to `#181A1F` / `#2A3038`. Dropped unused `--color-grid-tile-rock`. |
| 2026-05-08 | Add RTS Field Model world asset extension | The game keeps rectangular 2D gameplay but upgrades world assets to generated 3/4 RTS-hybrid sprites. This preserves engine predictability while making the play field more dimensional and screenshot-legible. |
| 2026-05-08 | Refactor map/grid atmosphere | The lunar field keeps strict top-down gameplay while adding explicit zoom-aware grid hairlines, calmer regolith, screen-space planetary backdrop, earthlight fog, and fixed SE-light/NW-shadow anchoring. Reference: `docs/map-grid-refacto.md`. |
| 2026-05-09 | Add axonometric guide grid | A diagonal guide layer gives the field a drawing-board/isometric read across active zoom levels while preserving rectangular gameplay, placement, picking, ports, and API coordinates. Orthographic terrain grid lines stay hidden. |
| 2026-05-09 | World render switches to true iso 2:1 diamond projection | The previous mix of top-down terrain + axonometric guide diagonals + SE-anchored sprite buildings produced an irreducible perspective conflict ("weird grid feel"). The world layer now projects through `IsoTransform.tileCenterToIso` so terrain, decals, buildings, belts, energy links and fog of war share the same SE camera angle as the existing RTS sprite library. **Gameplay coordinates remain rectangular** (`tx, ty ∈ [0, 256[²`) — only renderers and screen-to-world transforms project. The atmospheric RTS direction (Frostpunk / They Are Billions reference) extends DESIGN.md's "world animates, UI stays still" principle: the play-field becomes more dimensional and screenshot-legible while the HUD/toolbar/typography keeps the Architect's Drawing Board calmness. The axonometric guide layer (decision above) is reverted as redundant; the iso diamond shapes themselves carry the cellular reading. New `AmbientHazeRenderer` adds a screen-space vignette + earthlight bleed on top of the world for atmosphere. See `docs/map-grid-refacto.md` for the full execution plan. |

---

**AI agents: always read this file before making any visual/UI change. Flag any code that doesn't match these tokens. Do not deviate without explicit user approval logged in the decisions table above.**
