# Whitepod Primitives Reference

This document defines the currently executable gameplay primitives exposed by the game engine.

Its goal is to serve as a stable reference for:

- scenario scripting
- automated balancing experiments
- solver / optimizer inputs
- regression checks on game behavior

For now, these primitives are accessible in two practical ways:

- directly from TypeScript by instantiating and driving `GameEngine`
- from the browser console in development via `window.engine`

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

ResourceType:
0 = None
1 = Coal
2 = IronOre
3 = CopperOre

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
- `watchtower`
- `placeholder_1x1`
- `placeholder_3x3`
- `placeholder_node_1x1`
- `placeholder_node_3x3`
- `belt_straight`
- `belt_corner_cw`
- `belt_corner_ccw`

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

#### `watchtower`

- footprint: `2x2`
- allowed tiles: `Ground`
- forbids resource deposit: yes
- no ports
- reveals fog around the placement point

#### Placeholder buildings

These are useful for deterministic testing and topology experiments:

- `placeholder_1x1`
- `placeholder_3x3`
- `placeholder_node_1x1`
- `placeholder_node_3x3`

#### Belt segment building types

These are not usually placed manually by the player. They are produced by belt routing:

- `belt_straight`
- `belt_corner_cw`
- `belt_corner_ccw`

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
engine.getResourceCounts() => { coal, ironOre, copperOre }
engine.getResourceRates() => { coal, ironOre, copperOre }
```

### Direct state access

```ts
engine.playerStock
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
