# Whitepod

Industrial grid management and optimization game. You play as the architect of a living automated system: observe a territory, organize your infrastructure, anticipate circulation and energy constraints, then continuously refine your network to transform raw space into a coherent, stable, and scalable machine.

## Tech stack

- TypeScript + React 19
- PixiJS 8 (2D rendering)
- Zustand (state management)
- Vite 8 (build tooling)
- Tailwind CSS 4 + shadcn (UI)
- Vitest (tests)

## Prerequisites

- Node.js 20+
- npm

## Installation

```bash
npm install
```

## Development

```bash
npm run dev   # → http://localhost:5173
```

## Available commands

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check + production build |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint checks |
| `npm run test` | Run test suite with Vitest |
| `npm run test:ui` | Run tests with Vitest UI (browser interface) |

## Browser console (dev only)

In development, the game engine is exposed as `window.engine`. Open the browser devtools console to interact with it directly.

### Resources

```js
engine.placeResource(x, y, resourceType)
// ResourceType: 0=None  1=Coal  2=IronOre  3=CopperOre

engine.removeResource(x, y)
engine.getResourceAt(x, y)
```

### Tiles

```js
engine.placeTile(x, y, tileType)
// TileType: 0=Empty  1=Ground  2=Rock  3=Water

engine.getTileAt(x, y)
engine.grid.fill(tileType)                           // Fill entire map
engine.grid.fillRect(x0, y0, width, height, tileType)
```

### Buildings

```js
engine.placeBuilding('placeholder_1x1', { x, y })   // Returns BuildingId or null
engine.placeBuilding('placeholder_3x3', { x, y })
engine.removeBuilding(id)
engine.getBuildingAt(x, y)
engine.getBuildings()                                // ReadonlyMap of all buildings
engine.canPlaceBuilding('placeholder_1x1', { x, y })
// Returns { ok: true } or { ok: false, reason: string }
```

### Map generation

```js
engine.generateMap(seed)   // Generate resources using a seeded RNG
```

### Camera / Viewport

```js
engine.viewport.pan(dx, dy)                         // Pan by screen pixels
engine.viewport.zoomAt(screenX, screenY, factor)    // factor > 1 = zoom in
engine.viewport.zoom                                // Current zoom level (0.25–4)
engine.viewport.centerX                             // Camera center X (world pixels)
engine.viewport.centerY                             // Camera center Y (world pixels)
engine.getVisibleTiles()                            // → { x0, y0, x1, y1 }
engine.screenToTile(screenX, screenY)               // → { x, y }
```

## Project structure

```
src/
├── game/
│   ├── engine/     # GameEngine, Viewport, InputHandler, CoordinateTransform
│   ├── renderer/   # PixiJS renderers (Grid, Resources, TileSprite)
│   └── data/       # TileGrid, BuildingRegistry, ResourceGenerator, buildingCatalog
├── components/     # GameCanvas, GameHUD, shadcn UI components
├── store/          # Zustand game store
└── hooks/          # Custom React hooks
tests/              # Vitest test suites
```
