# Whitepod Primitives Reference

This document defines the currently executable gameplay primitives exposed by the game engine.

Its goal is to serve as a stable reference for:

- scenario scripting
- automated balancing experiments
- solver / optimizer inputs
- regression checks on game behavior

For now, these primitives are accessible in two practical ways:

- directly from TypeScript by instantiating and driving `GameEngine`
- from the browser console in development via `window.engine` (after leaving the start screen)

This is not yet a formal scenario DSL. It is the operational contract of the current engine API.

## Core Model

The engine works on a tile grid and exposes state-changing primitives over:

- terrain tiles
- resource deposits
- building placement / removal
- port-to-port connections
- conveyor routing
- energy links
- simulation time
- camera / viewport

Identifiers and enums used by the primitives:

```ts
TileType:
0 = Empty
1 = Ground
2 = Rock
3 = Water

ResourceType — base resources (extractable):
1 = Regolith
2 = Hydrogen
3 = Oxygen

ResourceType — tier-1 refined (converter outputs):
10 = IronOxide
11 = AluminumOxide
12 = SiliconDioxide
13 = NitrogenGas

ResourceType — tier-1 synthesized (synthesizer outputs):
14 = Water
15 = Methane
16 = CarbonDioxide
17 = Ammonia

ResourceType — tier-2 synthesized:
20 = CeramicPlates

Direction:
0 = North
1 = East
2 = South
3 = West
```

Shared coordinate shapes:

```ts
type TileCoord = { x: number; y: number };
type PortEndpoint = { building: BuildingId; port: PortId };
```

### Game mode

Every world has a fixed `engine.gameMode` (`'campaign' | 'sandbox'`, see `src/game/data/gameMode.ts`):

- `sandbox` (default): everything unlocked, building is free. Dev scenarios, scenario generators and bots always run in sandbox, so the primitives below behave as documented regardless of campaign rules.
- `campaign`: progression mode (hub, construction costs, milestones, unlocks, see `ROADMAP.md`). Campaign rules are added by later systems and must be documented here as they land.

Campaign rules in place:

- **Hub**: `generateMap(seed)` on a campaign world places one `hub_lander` near the map center, inside the initial reveal, on plain ground with a free ring around it and no deposit (deterministic per seed). It is never placed twice. `engine.getHubId()` and `engine.getHubInventory()` return `null` in sandbox worlds.
- **Starting kit and deposits**: right after placing the hub, campaign start guarantees at least 2 Regolith and 2 Oxygen deposit tiles within 10 tiles of the hub edge (missing ones are added deterministically, one tile apart, each resource on its own side), then credits the starting kit (180 Regolith) to the hub and sets the time of day to early morning (`CAMPAIGN_START_TIME`, so solar panels produce from the first minute; sandbox starts at midnight). Numbers live in `src/game/campaign/campaignStart.ts`. Regenerating the map keeps the existing hub and does not credit the kit again.
- **Milestones**: `src/game/data/milestoneCatalog.ts` lists the campaign milestones in play order (chapters 1–2 for now). The active milestone is the first one not completed; its progress compares requirements with what the **hub alone** holds. `engine.completeActiveMilestone()` is the player's confirmation: it consumes the requirements from the hub and returns `true`, or returns `false` and changes nothing when the hub does not hold everything. Completed milestones are saved with the world; unknown ids are dropped on load. `engine.onMilestoneCompleted(listener)` fires once per completion. In the HUD, the next-goal panel (under the minimap, campaign only) shows the chapter (`getChapterTitle`), one progress bar per requirement, what the milestone unlocks, and the button that completes it once the hub holds everything.
- **Pacing**: `tests/balance/campaignPacing.test.ts` plays chapters 1–2 end to end on several seeds with a scripted player (`tests/balance/scriptedCampaignPlayer.ts`) going through the real engine. It fails when the campaign soft-locks (a milestone or a cost can no longer be met) or when the pacing leaves its budgets (first milestone, end of chapter 1, end of chapter 2). Run it after changing a cost, a milestone, a recipe or the starting kit; `BALANCE_REPORT=1` prints the timings, `BALANCE_DEBUG=1` adds an ASCII map of the layout to failures.
- **Unlocks**: in campaign, the player can only build unlocked types and processors only run unlocked recipes. Unlocked content is `STARTING_UNLOCKS` (extractor, storage, belts, solar panel) plus the `unlocks` of every completed milestone (`src/game/campaign/unlocks.ts`); content no milestone unlocks stays locked (later chapters, dev placeholders). `canPlaceBuilding` refuses a locked type with reason `locked` (checked before the footprint and the cost), and `setProcessorRecipe` returns `false` for a locked recipe; clearing a recipe (`null`) is always allowed. Sandbox unlocks everything. Unlocks are derived from the completed milestones, so they need no save field. The toolbar and the recipe cards show locked content greyed out with the milestone that unlocks it.
- **Construction costs**: each player building has a `cost` in the catalog (belts: per segment). In campaign, it is paid from the **global stock** (decision D2: hub first, then storages by ascending id) and fully refunded into the hub on removal. `canPlaceBuilding` returns `insufficient_resources` when the stock cannot pay; `canPlaceBelt` / `placeBelt` return `insufficient_resources` when the whole route cannot be paid, and place nothing. A removed storage loses its inventory. Read costs with `engine.getBuildingCost(typeId)` (empty in sandbox), `engine.getBeltRouteCost(segments)`, `engine.canAfford(cost)` and `engine.getMissingResources(cost)`; `engine.quoteBelt(from, to)` prices a route without refusing it for cost, which is what the belt preview shows while dragging.

The mode is set at creation (`new GameEngine(w, h, { gameMode })`), saved with the world and restored on reload. Saves written before game modes existed load as `sandbox`. Bots refuse to start in a campaign world.

## Tool-Level Primitives

The game currently exposes four player tool modes:

- `select`
- `building`
- `belt`
- `energy_link`

These are important for automation because they define the user-facing interaction grammar even when the lower-level engine methods are richer.

### `select`

Behavior:

- click a tile containing a building: selects that building
- click an empty tile: clears selection

### `building`

Behavior:

- click a tile: attempts `engine.placeBuilding(buildingType, tile, rotation)`
- success: emits the created `BuildingId`
- failure: no placement, invalid-placement callback may fire in UI flow

### `belt`

Behavior:

- first click: choose a source output port
- second click: choose a target input port
- engine computes a route with `canPlaceBelt`
- confirmation places segments and auto-connects the chain with `placeBelt`

### `energy_link`

Behavior:

- click building A
- click building B
- UI flow may call `connectBuildings(A, B)` or disconnect if already linked

## World Editing Primitives

These are the lowest-level map authoring operations.

### Place tile

```ts
engine.placeTile(x, y, tileType) => boolean
```

Effects:

- sets the terrain type for one tile

Failure:

- returns `false` if the coordinate is out of bounds

### Read tile

```ts
engine.getTileAt(x, y) => TileType
```

### Bulk tile editing

```ts
engine.grid.fill(tileType)
engine.grid.fillRect(x0, y0, width, height, tileType)
```

These are useful for deterministic scenario setup.

## Resource Primitives

### Place resource deposit

```ts
engine.placeResource(x, y, resourceType) => boolean
```

Effects:

- writes a deposit on an existing non-empty, non-water tile

Failure:

- out of bounds
- target tile is `Empty`
- target tile is `Water`

### Remove resource deposit

```ts
engine.removeResource(x, y) => boolean
```

### Read resource deposit

```ts
engine.getResourceAt(x, y) => ResourceType
```

## Building Primitives

### Place building

```ts
engine.placeBuilding(typeId, origin, rotation?) => BuildingId | null
engine.canPlaceBuilding(typeId, origin, rotation?) => PlacementResult
```

`rotation` defaults to `Direction.North`.

Current placement failure reasons:

- `out_of_bounds`
- `tile_occupied`
- `tile_type_invalid`
- `resource_required`
- `resource_forbidden`
- `unknown_type`
- `id_overflow`
- `tile_fogged`

Placement rules enforced by the engine:

- every tile of the footprint must be inside the grid
- every tile of the footprint must already be revealed
- every tile of the footprint must be unoccupied
- every tile of the footprint must be allowed by the building definition
- buildings that require a deposit must be placed on a tile with resource and amount
- buildings that forbid deposits cannot overlap a live deposit

Important side effects:

- registers the building in the building registry
- registers the building in the energy network
- initializes battery charge to `0` for battery buildings
- placing a watchtower reveals fog around it

### Remove building

```ts
engine.removeBuilding(buildingId) => boolean
```

Effects:

- removes the building
- removes all direct port connections involving it
- removes it from the energy network
- removes its battery state if applicable
- if the building is attached to belt segments, neighboring belts are cascade-removed

### Read building occupancy

```ts
engine.getBuildingAt(x, y) => Building | null
engine.getBuildings() => ReadonlyMap<BuildingId, Building>
```

## Building Catalog

The currently supported building type ids are:

- `extractor_basic`
- `storage_basic`
- `solar_panel`
- `battery_basic`
- `merger_basic`
- `converter_basic`
- `synthesizer_basic`
- `watchtower`
- `placeholder_1x1`
- `placeholder_3x3`
- `placeholder_node_1x1`
- `placeholder_node_3x3`
- `belt_straight`, `belt_corner_cw`, `belt_corner_ccw`: basic belt, 60 items/min, 1 regolith per segment
- `belt_fast_straight`, `belt_fast_corner_cw`, `belt_fast_corner_ccw`: fast belt, 120 items/min, 1 regolith + 1 iron oxide per segment; locked in campaign until its chapter 3 milestone (#94)

Both tiers have the same shapes and ports, so a route changes tier in place. Catalog helpers: `beltTypeId(tier, shape)`, `beltTypeIds(tier)`, `beltTierOf(typeId)`, `beltTypeIdInTier(typeId, tier)`.

### Gameplay-relevant definitions

#### `extractor_basic`

- footprint: `1x1`
- allowed tiles: `Ground`
- requires resource deposit: yes
- ports: `out_east`
- energy: consumes `4`
- production rate: `30 items/min` when powered

#### `storage_basic`

- footprint: `3x3`
- allowed tiles: `Ground`
- forbids resource deposit: yes
- ports: `in_west`, `in_north`, `in_east`, `in_south`

#### `hub_lander` (campaign hub)

- footprint: `5x5`
- allowed tiles: `Ground`
- forbids resource deposit: yes
- ports: `in_west_1`, `in_west_2`, `in_north_1`, `in_north_2`, `in_east_1`, `in_east_2`, `in_south_1`, `in_south_2` (all inputs)
- storage-like (`storage: true`): stores deliveries in its own inventory, counted by `getResourceCounts()`
- `systemPlaced`: placed by the engine only; `canPlaceBuilding` returns `system_placed`
- `permanent`: `removeBuilding` returns `false`

#### `solar_panel`

- footprint: `1x1`
- allowed tiles: `Ground`
- forbids resource deposit: yes
- energy: produces `10`

#### `battery_basic`

- footprint: `2x2`
- allowed tiles: `Ground`
- forbids resource deposit: yes
- battery storage:
- capacity `10`
- charge rate `20`
- discharge rate `20`

#### `merger_basic`

- footprint: `1x1`
- allowed tiles: `Ground`
- forbids resource deposit: yes
- ports:
- inputs `in_west`, `in_north`, `in_south`
- output `out_east`

#### `splitter_basic`

- footprint: `1x1`, cost 5 regolith; unlocked in campaign with the merger (milestone `refining_iron`)
- allowed tiles: `Ground`
- forbids resource deposit: yes
- ports:
- input `in_west`
- outputs `out_east`, `out_north`, `out_south`
- behaviour: hands units to its outputs **in turn** (catalog port order), skipping an output that cannot take one now: no connection, a storage whose belts are full, or a machine not ready to pull (no recipe, unpowered, mid-cycle, output held). A unit routed to a machine waits with its producer until the machine pulls it; a unit routed to a storage is pushed. The turn moves past the output used and is saved with the world (`splitterTurns`).
- toolbar: shares key 6 with the merger (merger, then splitter, then selection); no dedicated sprite yet, it uses the merger's.

Flow routing (`src/game/flow/processorLogistics.ts`, `resolveRoutesFromOutput`): a producer's output has one route per way to a storage or a machine, branching at each splitter output; each route lists the belts, mergers and splitters it crosses (used by belt throughput) and the splitter outputs it takes. Without splitters there is at most one route, as before.

#### `converter_basic`

- footprint: `3x3`
- allowed tiles: `Ground`
- forbids resource deposit: yes
- ports: `in` (West, offset 0,1), `out` (East, offset 2,1)
- energy: consumes `6`
- recipes (1 input → 1 output, see recipe catalog):
  - `iron_oxide`: 1 Regolith → 1 IronOxide, 2 s/cycle
  - `aluminum_oxide`: 2 Regolith → 1 AluminumOxide, 3 s/cycle
  - `silicon_dioxide`: 4 Regolith → 1 SiliconDioxide, 5 s/cycle
  - `nitrogen_gas`: 3 Oxygen → 1 NitrogenGas, 4 s/cycle

#### `synthesizer_basic`

- footprint: `4x4`
- allowed tiles: `Ground`
- forbids resource deposit: yes
- ports: `in_1` (West, offset 0,1), `in_2` (West, offset 0,2), `out` (East, offset 3,2)
- energy: consumes `10`
- recipes (2 inputs → 1 output, see recipe catalog):
  - `water`: 2 H₂ + 1 O₂ → 1 Water, 4 s/cycle
  - `methane`: 4 H₂ + 1 O₂ → 1 Methane, 5 s/cycle
  - `carbon_dioxide`: 1 H₂ + 1 O₂ → 1 CO₂, 4 s/cycle
  - `ammonia`: 3 H₂ + 2 O₂ → 1 Ammonia, 6 s/cycle
  - `ceramic_plates`: 1 AluminumOxide + 1 IronOxide → 1 CeramicPlates, 6 s/cycle

#### `watchtower`

- footprint: `2x2`
- allowed tiles: `Ground`
- forbids resource deposit: yes
- no ports, no energy requirement
- **reveals fog** in a circle of radius `WATCHTOWER_REVEAL_RADIUS` (= 15 tiles) around the footprint center on placement
- reveal is **permanent** — removing the watchtower does not re-fog the area

#### Placeholder buildings

These are useful for deterministic testing and topology experiments:

- `placeholder_1x1`
- `placeholder_3x3`
- `placeholder_node_1x1`
- `placeholder_node_3x3`

#### Belt segment building types

These are not usually placed manually by the player. They are produced by belt routing:

- `belt_straight`, `belt_corner_cw`, `belt_corner_ccw`: basic belt, 60 items/min, 1 regolith per segment
- `belt_fast_straight`, `belt_fast_corner_cw`, `belt_fast_corner_ccw`: fast belt, 120 items/min, 1 regolith + 1 iron oxide per segment; locked in campaign until its chapter 3 milestone (#94)

Both tiers have the same shapes and ports, so a route changes tier in place. Catalog helpers: `beltTypeId(tier, shape)`, `beltTypeIds(tier)`, `beltTierOf(typeId)`, `beltTypeIdInTier(typeId, tier)`.

## Port Connection Primitives

These primitives connect adjacent output/input ports directly.

### Validate connection

```ts
engine.canConnect(from, to) => ConnectionResult
```

Current connection failure reasons:

- `unknown_building`
- `unknown_port`
- `port_kind_mismatch`
- `port_already_connected`
- `ports_not_adjacent`
- `self_connection`
- `id_overflow`

Rules:

- `from` must be an output port
- `to` must be an input port
- both ports must exist
- both ports must be free
- ports must be adjacent in world space and face each other
- a building cannot connect to itself

### Create connection

```ts
engine.connect(from, to) => ConnectionId | null
```

### Remove connection

```ts
engine.disconnect(connectionId) => boolean
```

### Inspect connections

```ts
engine.getConnections() => ReadonlyMap<ConnectionId, Connection>
engine.getConnectionsOf(buildingId) => readonly Connection[]
```

## Belt Primitives

Belts are a routed transport primitive between an output port and an input port.

The player-level tool is two-click. The engine-level primitive is:

```ts
engine.canPlaceBelt(from, to) => BeltResult
engine.placeBelt(from, to) => PlaceBeltResult
engine.removeBelt(segmentId) => boolean
```

Important behavior:

- route planning is delegated to the belt router
- the engine places segment buildings one by one
- the engine then creates all pending port connections
- any failure triggers rollback of already placed belt segments

Current belt failure reasons:

- `no_path`
- `source_port_taken`
- `target_port_taken`
- `port_kind_mismatch`
- `unknown_building`
- `unknown_port`
- `self_connection`
- `id_overflow`
- `tiles_blocked`

Effects of `removeBelt`:

- removes the entire connected belt component containing the specified segment

### Tiers and upgrades

```ts
engine.placeBelt(from, to, tier = 'basic')        // also canPlaceBelt / quoteBelt; a locked tier fails with 'locked'
engine.quoteBeltUpgrade(segmentId, tier)          // { ok, segments, net, refund, missing } or { ok: false, reason }
engine.upgradeBelt(segmentId, tier) => boolean
```

An upgrade turns every segment `removeBelt` would remove (the connected belt route) into `tier`, keeping ids, tiles and connections. The player pays the new segments minus the refund of the old ones (`net`, per resource); a resource the new tier needs less of comes back (`refund`). Failure reasons: `unknown_building`, `locked`, `already_tier`, or `missing` not empty. In the HUD, selecting the belt entry (key 3) again switches to the fast belt once it is unlocked, then back to selection; with the fast tool, hovering a slower route previews the upgrade and its price, and clicking it upgrades.

### Throughput

A **belt run** is a chain of belt segments between two non-belt nodes (merger, storage, machine). Each run carries at most `beltCapacityPerMinute` items per minute (catalog field on belt types, `BELT_CAPACITY_PER_MIN` = 60, two extractors); a run mixing belt types takes its slowest segment. Implemented in `src/game/flow/beltThroughput.ts`:

- Units still move instantly from producer to destination. Each run has a token bucket refilled at its rate, holding up to `BELT_BURST_SECONDS` (2 s) of capacity so batched extraction ticks are not clipped.
- A transfer passes when every run on the unit's path (from the producer to the first storage or machine) has at least one token, then takes one per unit. A machine pulling several units at once (e.g. silicon dioxide, 4 regolith) may leave a run in debt, so the average stays the capacity.
- A refused unit stays with its producer and is retried: nothing is lost. Extractors on a saturated run are served by increasing id, independent of insertion order.
- Merged lines share the run after the merger. Direct port-to-port links (no belt) are not capped.
- Bucket levels are saved with the world (`beltTokens`), so a reloaded world and the offline catch-up run identically.

```ts
engine.getBeltRunStats(segmentId) => { runId, capacityPerMinute, saturated } | null
engine.getSaturatedBeltSegments() => readonly BuildingId[] // runs that refused a unit in the last 4 s
```

`getResourceRates()` reports what the belts let through (each run's capacity shared pro rata among its sources). The belt panel shows demand against capacity, in amber with "Saturé" when the run is full; saturated runs are amber on the map.

## Energy Primitives

Energy links are separate from port connections and belts. They define electrical networks between buildings.

### Create energy link

```ts
engine.connectBuildings(a, b) => boolean
```

Rules:

- both buildings must exist
- both buildings must be energy-linkable
- duplicate links are rejected by the energy network

### Remove energy link

```ts
engine.disconnectBuildings(a, b) => boolean
```

### Inspect energy graph

```ts
engine.areBuildingsEnergyLinked(a, b) => boolean
engine.getEnergyLinkedBuildings(buildingId) => readonly BuildingId[]
engine.getEnergyNetworkForBuilding(buildingId) => EnergyNetworkBalance | null
engine.getEnergyNetworkBalances() => readonly EnergyNetworkBalance[]
engine.getBuildingPowerState(buildingId) => 'powered' | 'unpowered' | 'neutral'
engine.getEnergyGlobalStats() => EnergyGlobalStats
engine.getEnergyStorageTotals() => { stored, capacity }
```

### Energy semantics

- producers add `production`
- consumers add `consumption`
- batteries can absorb surplus and cover deficits within their discharge rate and stored charge
- a consumer can be `unpowered` even when present in a network if total supply is insufficient
- extractors only produce resources when `powered`

## Simulation Primitives

### Advance simulation

```ts
engine.update(dtSeconds) => void
```

This advances:

- day / night cycle
- extractor production
- battery charge / discharge

### Set simulation time directly

```ts
engine.setSimulationTime(value0to1) => void
engine.simulationTime // normalized to [0, 1)
```

Useful for scenario evaluation at fixed times of day.

### Resource economy inspection

```ts
engine.getResourceCounts() => ResourceStock
engine.getResourceRates() => ResourceStock
```

`ResourceStock` is a flat object with one key per resource type:

```ts
{
  regolith, hydrogen, oxygen,
  ironOxide, aluminumOxide, siliconDioxide, nitrogenGas,
  water, methane, carbonDioxide, ammonia,
  ceramicPlates,
}
```

`getResourceRates()` returns net rates in items/min for each resource:
- positive: net production (extractor output + processor output)
- negative: net consumption (processor input faster than production)

### Processor state inspection

```ts
engine.getProcessorState(buildingId) => { recipeId: RecipeId | null, cycleProgress: number } | undefined
engine.setProcessorRecipe(buildingId, recipeId) => boolean
engine.getProcessorLogisticsStatus(buildingId) => {
  badInput: boolean
  missingInput: boolean
  blockedOutput: boolean
  assignments: readonly { portId: PortId; requiredResourceType: ResourceType }[]
} | null
```

`cycleProgress` stores elapsed seconds within the current cycle.

Processors tick only when powered, when connected upstream providers have buffered the required inputs, and when the processor can flush its output into a valid downstream chain.

### Direct state access

```ts
engine.batteryCharges
engine.mapSeed
```

These are convenient for experiments, but they are lower-level than the method API and should be treated as implementation-facing rather than contract-first.

## Map Generation Primitive

```ts
engine.generateMap(seed) => void
```

Effects:

- regenerates map resources from a seeded RNG
- reveals the initial central area
- stores the seed in `engine.mapSeed`

For reproducible automated testing, always record the seed.

## Fog of War

The map starts fully fogged. Tiles must be revealed before buildings can be placed on them.

### Reveal model

```ts
engine.grid.isRevealed(x, y) => boolean
engine.grid.revealCircle(cx, cy, radius) => void   // reveals a filled circle
engine.grid.revealAll() => void                     // reveals the entire map (testing / debug)
engine.grid.fogVersion                              // increments every time new tiles are revealed
```

Reveal is **monotone** — tiles can only go from fogged to revealed, never back. Removing a watchtower does not re-fog its area.

### Initial reveal

When `engine.generateMap(seed)` is called, the area within `INITIAL_FOG_REVEAL_RADIUS` (= 20 tiles) of the map center is revealed automatically.

### Expanding visibility — the watchtower

Placing a `watchtower` building immediately reveals a circle of `WATCHTOWER_REVEAL_RADIUS` (= 15 tiles) around the footprint center:

```ts
// 2×2 footprint at origin (ox, oy) → center = (ox+1, oy+1)
engine.placeBuilding('watchtower', { x: ox, y: oy });
// All tiles within sqrt((x-(ox+1))² + (y-(oy+1))²) ≤ 15 are now revealed.
```

Watchtowers have no energy requirement and no ports — their only function is map expansion.

### Fog and building placement

`engine.canPlaceBuilding` returns `{ ok: false, reason: 'tile_fogged' }` when any tile of the building footprint is still fogged. The watchtower is therefore the primary tool for exploring new map area before placing infrastructure.

### Automation pattern

For reproducible tests, skip fog constraints entirely with `engine.grid.revealAll()` before placing buildings. Use targeted `revealCircle` calls when testing the fog mechanic itself.

## Camera / Viewport Primitives

These are not gameplay economics primitives, but they are part of the executable interaction surface.

```ts
engine.viewport.pan(dx, dy)
engine.viewport.zoomAt(screenX, screenY, factor)
engine.viewport.zoom
engine.viewport.centerX
engine.viewport.centerY
engine.getVisibleTiles()
engine.screenToTile(screenX, screenY)
```

These are mainly useful for:

- replay systems
- UI automation
- screenshot-based scenario capture

## Event / Change Model

The engine emits two change kinds:

- `world`
- `viewport`

Subscription API:

```ts
engine.subscribe((kind) => {
  // react to changes
});
```

This is useful for automated harnesses that need to wait for state transitions or invalidate cached evaluations.

## Automation Recommendations

If we later build a formal optimization runner, the safest command layer to target is:

1. map setup primitives
2. building placement primitives
3. direct connection / belt / energy primitives
4. `update(dt)` and read-model inspection

Recommended runner conventions:

- always start from a known seed
- reveal or prepare the map explicitly before placement scenarios
- use `canPlaceBuilding`, `canConnect`, and `canPlaceBelt` before committing
- capture failure reasons instead of collapsing everything to success/fail
- prefer method APIs over mutating engine internals directly

## Current Gaps

This reference documents what is executable today, but several things are not yet first-class primitives:

- no formal undo/redo command layer
- no serialized scenario command format
- no single transaction primitive spanning heterogeneous actions
- no explicit inventory cost / spend primitives yet
- no dedicated optimizer-facing command bus yet

Those can be added later on top of this contract instead of rediscovering engine behavior from tests and source.
