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
| `BALANCE_REPORT=1 npx vitest run tests/balance` | Play chapters 1–2 with a scripted player and print the milestone timings |

## Browser console (dev only)

In development, the game engine is exposed as `window.engine` once a game is started from the start screen (Continue, New campaign or Sandbox). Open the browser devtools console to interact with it directly.

For a fuller reference of executable game primitives and failure modes, see [PRIMITIVES.md](./PRIMITIVES.md).

### Resources

```js
engine.placeResource(x, y, resourceType)
// ResourceType — base (extractable):   0=None  1=Regolith  2=Hydrogen  3=Oxygen
// ResourceType — tier-1 refined:       10=IronOxide  11=AluminumOxide  12=SiliconDioxide  13=NitrogenGas
// ResourceType — tier-1/2 synthesized: 14=Water  15=Methane  16=CarbonDioxide  17=Ammonia  20=CeramicPlates

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
engine.placeBuilding('converter_basic', { x, y })           // 3x3, transforms resources via recipe
engine.placeBuilding('synthesizer_basic', { x, y })         // 4x4, combines 2 inputs via recipe
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
engine.placeBelt(from, to, tier)       // Place belt segments + auto-connect ('basic' default, or 'fast')
engine.upgradeBelt(segmentId, 'fast')  // Turn the whole route into fast belt in place, paying the difference
engine.removeBelt(segmentId)           // Remove entire connected belt chain
engine.getBeltRunStats(segmentId)      // { runId, capacityPerMinute, saturated } of the segment's run
engine.getSaturatedBeltSegments()      // Segments of runs at capacity (amber on the map)
```

A belt run carries at most 60 items/min (two extractors); see PRIMITIVES.md, Belt Primitives → Throughput.

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
engine.getResourceCounts()             // Aggregated storage inventories across the world
engine.getResourceRates()              // Net connected-line rates (items/min)
engine.getStorageInventory(buildingId) // Per-storage inventory or null
```

### Game mode

```js
engine.gameMode                        // 'sandbox' (default) | 'campaign', fixed for the world's lifetime
// Dev scenarios, generators and bots always run in sandbox. See PRIMITIVES.md.

engine.getHubId()                      // Campaign hub (lander) id, or null in sandbox
engine.getHubInventory()               // Hub inventory, or null in sandbox
engine.getBuildingCost('storage_basic') // Campaign construction cost ([] in sandbox)
engine.canAfford(cost)                 // Payable from the global stock (hub + storages)?
engine.getBeltRouteCost(plan.segments) // Total cost of a planned belt route
engine.getMissingResources(cost)       // What the global stock lacks for it ([] when affordable)
engine.quoteBelt(from, to)             // Planned route + cost + missing, even when unaffordable (previews)
engine.getActiveMilestone()            // Milestone the hub requests (null in sandbox or when done)
engine.getMilestoneProgress()          // { milestone, requirements: [{ resourceType, required, available }], ready }
engine.completeActiveMilestone()       // Consume the requirements from the hub; false if not ready
engine.getCompletedMilestoneIds()
engine.onMilestoneCompleted((milestone) => { /* ... */ })
engine.isBuildingUnlocked('converter_basic') // Always true in sandbox
engine.isRecipeUnlocked('iron_oxide')
engine.getUnlockingMilestone('buildings', 'converter_basic') // Milestone that unlocks it, or null
```

### Simulation

```js
engine.simulationTime                  // Day/night cycle position (0–1)
engine.mapSeed                         // Current map seed
engine.batteryCharges                  // Map<BuildingId, number> of battery charge levels
```

### Dev scenarios

```js
window.engine.scenarios.list()
window.engine.scenarios.install('bootstrap-energy-grid')
window.engine.scenarios.listGenerators()
window.engine.scenarios.generate('tier-simple')    // starter: 4 solar + 3 extractors + 3 storages
window.engine.scenarios.generate('tier-medium')    // mid: 2 resource types, branched energy
window.engine.scenarios.generate('tier-complex')   // full: mergers, watchtower, 3 resource types
window.engine.scenarios.generate('tier-build-all') // all 4 converters + 5 synthesizers, 12 resources
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
- Campaign worlds also save their game mode and completed milestones (unlocks are derived from them, the hub is a saved building and its stock a saved inventory). Both fields are optional in the v3 world format: a save without them (written before campaigns) loads as a sandbox world. `tests/persistence/campaignSave.test.ts` checks that a campaign in progress reloads identically and keeps running the same, live and through the offline catch-up.
- Offline progression (IDLE) is applied only on a real pause→resume: when the tab transitions from hidden to visible, and on cross-session reopen via a small `localStorage` sidecar holding the pause timestamp.
- The latest tab to start or continue a game owns its autosave. An older tab returns to the start screen when another takes over.
- Live and offline production share a 0.1-second simulation step. Saves include the remaining fraction of a step and the extraction timer. Offline replay yields to the interface between batches, resumes from a checkpoint if interrupted, and caps each absence at eight hours. Pausing the simulation also pauses offline production.
- Camera position and selected tool are also persisted locally, so reopening the game resumes the same view.
- Temporary UI state such as hover and console history is not persisted.
- The game opens on a start screen: **Continue** (when a save exists), **New campaign** or **Sandbox**, with an optional map seed. Starting a new game over a save asks first, then clears it. No world loads before the choice.
- In play, Settings → **Menu principal** reopens the start screen over the running game (Escape resumes).

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
tests/                # Vitest test suites (engine, components, data, renderer, persistence, audio, balance)
```
