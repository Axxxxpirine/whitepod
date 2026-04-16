# Whitepod

Industrial grid management and optimization game. You play as the architect of a living automated system: observe a territory, organize your infrastructure, anticipate circulation and energy constraints, then continuously refine your network to transform raw space into a coherent, stable, and scalable machine.

## Tech stack

- TypeScript 6 + React 19
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

For a fuller reference of executable game primitives and failure modes, see [PRIMITIVES.md](/Users/elliotbartholme/Documents/whitepod/PRIMITIVES.md).

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
engine.placeBuilding('extractor_basic', { x, y })          // Returns BuildingId or null
engine.placeBuilding('solar_panel', { x, y })
engine.placeBuilding('storage_basic', { x, y })             // 3x3 footprint
engine.placeBuilding('battery_basic', { x, y })             // 2x2 footprint
engine.placeBuilding('merger_basic', { x, y })
engine.placeBuilding('watchtower', { x, y })                // 2x2, reveals fog in radius
engine.placeBuilding('placeholder_1x1', { x, y })
engine.placeBuilding('placeholder_3x3', { x, y })
engine.placeBuilding('placeholder_node_1x1', { x, y })
engine.placeBuilding('placeholder_node_3x3', { x, y })
engine.placeBuilding('extractor_basic', { x, y }, rotation) // Optional Direction (0=N 1=E 2=S 3=W)
engine.removeBuilding(id)
engine.getBuildingAt(x, y)
engine.getBuildings()                                       // ReadonlyMap of all buildings
engine.canPlaceBuilding('extractor_basic', { x, y })
// Returns { ok: true } or { ok: false, reason: string }
```

### Port connections

```js
engine.canConnect(from, to)            // from/to = { building: BuildingId, port: PortId }
engine.connect(from, to)               // Returns ConnectionId or null
engine.disconnect(connectionId)
engine.getConnections()                // ReadonlyMap of all connections
engine.getConnectionsOf(buildingId)    // Connections involving a building
```

### Belts

Belt segments (`belt_straight`, `belt_corner_cw`, `belt_corner_ccw`) are placed automatically by the belt routing system.

```js
engine.canPlaceBelt(from, to)          // Plan a belt route between two port endpoints
engine.placeBelt(from, to)             // Place belt segments + auto-connect
engine.removeBelt(segmentId)           // Remove entire connected belt chain
```

### Energy network

```js
engine.connectBuildings(a, b)                  // Create energy link between two buildings
engine.disconnectBuildings(a, b)
engine.areBuildingsEnergyLinked(a, b)
engine.getEnergyLinkedBuildings(buildingId)    // Neighbors in energy graph
engine.getEnergyNetworkForBuilding(buildingId) // Balance for building's network
engine.getEnergyNetworkBalances()              // All network balances
engine.getBuildingPowerState(buildingId)        // 'powered' | 'unpowered' | 'neutral'
engine.getEnergyGlobalStats()                  // Global production/consumption stats
engine.getEnergyStorageTotals()                // { stored, capacity } across all batteries
```

### Resources & economy

```js
engine.getResourceCounts()             // Current player stock { coal, ironOre, copperOre }
engine.getResourceRates()              // Active extraction rates (items/min)
```

### Simulation

```js
engine.simulationTime                  // Day/night cycle position (0–1)
engine.mapSeed                         // Current map seed
engine.playerStock                     // Direct access to resource stock
engine.batteryCharges                  // Map<BuildingId, number> of battery charge levels
```

### Dev scenarios

```js
window.engine.scenarios.list()
window.engine.scenarios.install('bootstrap-energy-grid')
// Reload the page to boot through the normal persisted-session restore path.
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

## Session persistence

- The world state is saved automatically in `localStorage` and restored when you reopen the game, including buildings, connections, stocks, simulation clock, and batteries.
- Offline progression (IDLE) is applied only on a real pause→resume: when the tab transitions from hidden to visible, and on cross-session reopen via a small `localStorage` sidecar holding the pause timestamp.
- The catch-up is exact (replays simulation updates) and capped to 8 hours per batch.
- Camera position and selected tool are also persisted locally, so reopening the game resumes the same view.
- Temporary UI state such as hover and console history is not persisted.
- Use the `Reset` button in the HUD to clear the current session and start a fresh game.

## Project structure

```
src/
├── game/
│   ├── engine/       # GameEngine, Viewport, InputHandler, CoordinateTransform, BeltRouter
│   ├── renderer/     # PixiJS renderers (Grid, Building, Belt, Resource, FogOfWar, DayNight, EnergyLink, etc.)
│   ├── data/         # TileGrid, BuildingRegistry, ConnectionRegistry, ResourceGenerator, buildingCatalog
│   ├── systems/      # EnergyNetwork
│   ├── flow/         # Belt flow resolution
│   ├── input/        # CancelStack
│   ├── persistence/  # localStorage-backed persistence layer (v3 world snapshot)
│   ├── idle/         # IdleCatchup — offline progression replay on pause→resume
│   ├── audio/        # GameMusicPlayer, GameSfxPlayer, sfxEvents (randomized music, SFX bus)
│   ├── ui/           # Building presentation, sprite paths, toolbar icons
│   ├── constants.ts
│   └── types.ts
├── components/
│   ├── hud/          # BuildingPicker, SelectedBuildingPanel, ToolModeIndicator
│   ├── ui/           # Design-system primitives (Panel, PanelHeading, Chip, Icon)
│   ├── GameCanvas.tsx
│   ├── GameHUD.tsx
│   ├── BuildingStatsPanel.tsx
│   ├── BeltFlowStats.tsx
│   ├── GameMusicController.tsx
│   ├── GameSfxController.tsx
│   └── energyLinkHandlers.ts
├── design/           # Design tokens (colors, typography, spacing) — see DESIGN.md
├── assets/           # Static assets
├── lib/              # Shared utilities
├── store/            # Zustand game store
└── test/             # Test setup
tests/                # Vitest test suites (engine, components, data, renderer, persistence, audio)
```
