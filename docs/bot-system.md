# Whitepod Bot System

This document defines the bot system for Whitepod: how bot profiles work, how bot logic should be structured, how the UI controls them, and how to add new bot classes.

The goal is to keep the system extensible. The current codebase exposes two profile-backed bots: `master` as the primary builder and `connector` as a routing-only assistant.

## Goals

- Keep bot control manual during gameplay.
- Support multiple bot profiles.
- Preserve the selected profile across seed resets.
- Allow seed application to reset the world and session cleanly.
- Make the bot system easy to extend with new strategies.
- Keep bot logic deterministic for a given seed whenever possible.

## Core Concepts

### Bot

A bot is a runtime controller that reads the current game state and performs actions through the public engine API.

The bot must not mutate engine internals directly.

### Bot Profile

A bot profile is a named strategy configuration.

Available profiles:

- `master`: Cluster-based builder with distributed storage, local energy hubs, and belt routing.
- `connector`: Route-only bot that connects existing buildings (extractors to storage, power to grid).

Profiles are selected in the UI and determine which bot class is instantiated.

### Session

A session is the current live game state, including world state, UI selection, and bot state.

When the user applies a new seed, the session may be reset entirely. The selected bot profile must remain unchanged.

## Current System Snapshot

The codebase uses a profile-backed bot controller with these files:

- `src/game/bot/MasterBot.ts`
- `src/game/bot/ConnectorBot.ts`
- `src/game/bot/BotController.ts`
- `src/game/bot/botProfiles.ts`
- `src/game/bot/botTypes.ts`
- `src/game/bot/util/beltRouting.ts`
- `src/game/bot/util/processorConfig.ts`
- `src/game/bot/util/spatialPlanning.ts`
- `src/game/bot/util/energyPlanning.ts`
- `src/game/bot/util/resourceAnalysis.ts`
- `src/components/hud/bot/BotControlsPanel.tsx`
- `src/components/hud/bot/BotProfileSelect.tsx`
- `src/components/hud/bot/BotSeedControls.tsx`
- `src/components/hud/bot/BotStatusIndicator.tsx`

The UI selects the profile explicitly, the bot no longer auto-starts on page load, and seed handling is routed through a dedicated session helper.

## Runtime Behavior

### Bot controls

The bot should be controlled manually from the UI.

Required controls:

- start/stop button
- profile selector next to the start/stop button
- active status indicator
- current bot phase/target text
- editable seed input with apply action

Current implementation note: the control cluster lives in the bottom-right HUD panel next to the settings popover.
In code, the cluster is split into `BotControlsPanel`, `BotProfileSelect`, `BotSeedControls`, and `BotStatusIndicator`.

### Bot lifecycle

Each bot instance should support the following lifecycle:

- `start()`: begin ticking and acting.
- `stop()`: stop all timers and cease actions.
- status updates: report phase and target changes to the UI.

The UI owns whether the bot is running. The bot instance owns how it thinks.

### Seed application

Applying a new seed must:

- reset the world
- reset the session
- clear all buildings, connections, and derived state
- regenerate the map from the new seed
- preserve the current bot profile selection
- leave the bot stopped after reset unless the user restarts it manually

Current implementation note: the selected profile id and seed input are persisted with the view/session state, while the world snapshot remains separate.
The shared seed apply path lives in `src/game/session/seedSession.ts`.

## Engine Contract For Bots

Bots must use public engine APIs only. Do not access `engine.grid`, `engine.buildings`, `engine.connections`, or internal maps directly.

### Building and belt placement

- `engine.canPlaceBuilding(typeId, origin, rotation)` — validate before placing
- `engine.placeBuilding(typeId, origin, rotation, options)` — place buildings
- `engine.canPlaceBelt(from, to)` — plan belt path without committing
- `engine.placeBelt(from, to)` — place belt segments and wire connections
- `engine.removeBuilding(id, options)` — remove buildings (triggers belt cascade if `cascadeBelts=true`)
- `engine.removeBelt(segmentId)` — remove belt segments explicitly

### Energy network

- `engine.connectBuildings(a, b)` — create energy link between power-capable buildings
- `engine.disconnectBuildings(a, b)` — remove energy link
- `engine.areBuildingsEnergyLinked(a, b)` — check if two buildings share a network
- `engine.getEnergyNetworkForBuilding(buildingId)` — get network balance for a building's component
- `engine.getEnergyNetworkBalances()` — get all disconnected energy components
- `engine.getEnergyGlobalStats()` — global production, consumption, surplus, online/offline consumers
- `engine.getBuildingPowerState(buildingId)` — `'neutral' | 'powered' | 'unpowered'`
- `engine.getEnergyStorageTotals()` — total battery capacity and current charge

### Resource inspection

- `engine.getResourceAt(x, y)` — resource type at a tile
- `engine.getResourceCounts()` — total stock across all storage inventories
- `engine.getResourceRates()` — net production/consumption rate (items/min) per resource
- `engine.getStorageInventory(buildingId)` — inventory contents of a storage building
- `engine.getProducerOutputBuffer(buildingId)` — output buffer of extractor or processor

### Processor control (Converters, Synthesizers)

- `engine.getProcessorState(buildingId)` — `{ recipeId: RecipeId | null, cycleProgress: number }`
- `engine.setProcessorRecipe(buildingId, recipeId)` — assign recipe (only when idle)
- `engine.getProcessorLogisticsStatus(buildingId)` — `{ badInput, missingInput, blockedOutput, assignments }`
- `engine.getProducerResourceType(buildingId)` — output resource of an extractor or processor

### Fog of war and visibility

- `engine.grid.isRevealed(x, y)` — check if a tile is revealed
- `engine.grid.revealCircle(cx, cy, radius)` — reveal area (watchtowers call this automatically)
- `engine.getVisibleTiles()` — viewport bounds for rendering

### Map generation and session control

- `engine.generateMap(seed)` — regenerate world from seed
- `engine.runWithoutNotifications(work)` — batch multiple actions without intermediate UI updates

### Required bot rules

1. **Use `runWithoutNotifications`** when a cycle performs multiple related actions (e.g., placing a full module).
2. **Check `canPlace*` APIs** before committing to actions when placement may fail.
3. **Route all extractors to storage** via `placeBelt` — resources buffered at extractor outputs do not contribute to economy.
4. **Configure processor recipes** for any converter or synthesizer a bot places — processors remain idle without recipe assignment.
5. **Check `getProcessorLogisticsStatus`** before setting recipes — avoid configuring processors with missing or contaminated inputs.
6. **Prefer deterministic tie-breaking** (sort by score, then coordinate order) unless the profile explicitly requires randomness.
7. **Do not depend on hidden state** outside the engine and bot instance.
8. **Do not assume storage or belts create automatic economy** — the engine does not auto-route; bots must explicitly place belts.
9. **Monitor `getResourceRates()`** to detect bottlenecks (negative rates) or overproduction (stock growing faster than processing).
10. **Respect battery charge state** — check `batteryCharges` before over-building solar capacity.

## Profile Responsibilities

### Master profile (`MasterBot`)

**Goal:** Build with distributed storage clusters, local energy hubs, and complete logistics routing.

**Expected behaviors:**
- Place extractors on visible deposits near current storage cluster
- Create a new storage building after every 4 extractors in the current cluster
- Route each extractor to its nearest storage cluster via belt with deterministic port selection
- Configure converters with base recipes (iron_oxide, aluminum_oxide) when regolith is available
- Place solar panels and batteries as local clusters near active building zones
- Connect all power-capable buildings into energy networks with batteries as hubs
- Trigger exploration when build density exceeds **10%** (occupied tiles / revealed tiles): place watchtower at fog boundary (farthest frontier tile)
- Expand using spiral pattern from center
- Monitor `getResourceRates()` to throttle extractor placement when rates are negative
- Check `batteryCharges` before placing solar; prioritize batteries when charge < 50%

**Layout pattern:** Multiple distributed storage clusters, each with 4 extractors, local solar/battery clusters, and belts connecting extractors to storage.

**Status:** Fully implemented with cluster-based storage, belt routing, processor configuration, resource rate monitoring, battery optimization, and frontier-based exploration at 10% density threshold.

### Connector profile (`ConnectorBot`)

**Goal:** Route existing buildings only - no building placement.

**Expected behaviors:**
- Connect all extractors to nearest storage via belts (closest first)
- Connect all extractors to nearest merger via belts (if mergers exist)
- Connect all extractors to nearest converter via belts
- Connect all processor outputs to nearest storage via belts
- Connect all energy-capable buildings (solar, batteries, extractors) to energy network
- Use batteries as energy hubs when available, otherwise use solar panels
- Prioritize closest connections first
- Does NOT place any buildings (extractors, storage, solar, batteries, etc.)

**Layout pattern:** Fully connected logistics network with all extractors routed to storage/mergers and all power buildings connected to the energy grid.

**Status:** Fully implemented with belt routing for extractors, processors, mergers, and energy network connections.

## UI Requirements

### Bottom-right control cluster

Place the following controls in the bottom-right corner:

- bot start/stop button
- bot profile selector
- small active indicator
- phase/target display nearby
- current seed display or seed input if space permits

### Bot indicator

The indicator should be small and unobtrusive.

Its job is to show whether the bot is active, not to dominate the HUD.

### Seed input

Seed entry should be editable.

When the user applies a seed:

- the world resets
- the session resets
- the profile stays selected

## Data Model

The store should track at least:

- current engine reference
- simulation time
- selected tool
- current bot status
- selected bot profile id
- current seed input value
- optional bot control handles owned by the live canvas session

Available profile ids:

- `master`
- `connector`

Suggested bot status fields:

- `active`
- `phase`
- `target`

## How To Add A New Bot Class

Use this process when creating a new strategy implementation.

### 1. Define the strategy goal

Write down the bot's purpose in one sentence.

Examples:

- maximize early resource income
- build a compact logistics tree
- explore the map in concentric waves
- optimize energy balance for a late-game factory

### 2. Decide the bot profile name

Pick a stable profile id and display name.

Examples:

- `master`
- `connector`

### 3. Create the bot class

Add a new file under `src/game/bot/`.

The class should:

- accept `engine` and `onStatusChange` in the constructor
- expose `start()` and `stop()`
- keep internal state private
- report status changes only when the status actually changes
- perform one cycle of actions on each tick

If the profile needs to be selectable in the UI, register it in `src/game/bot/botProfiles.ts` and expose its label/description there.

### 4. Decide the action model

The bot should answer:

- what it scans
- what it places first
- how it chooses tie-breaks
- how it reacts when placement fails
- how it scales over time

### 5. Implement deterministic ordering

For consistent results, make tie-breaks deterministic:

- sort by score, then by coordinate order
- use stable iteration order
- avoid randomness unless the profile explicitly requires it

### 6. Add tests or scenario coverage

Add at least one of:

- a unit test for decision logic
- a scenario that exercises the bot on a known seed
- a regression test for a known failure case

### 7. Register the profile

Add the bot to the profile registry so the UI can select it.

Also wire the profile into the live controller so switching the selector swaps the active implementation without mutating engine internals.

### 8. Expose it in the UI

Add the profile label and description to the selector.

The selector currently lives next to the bot start/stop button in the bottom-right HUD.

### 9. Validate the lifecycle

Confirm that:

- start works
- stop cancels timers
- reset clears bot activity
- profile selection survives seed resets

## How To Create A New Profile With Agent Help

The preferred workflow is to give a natural language prompt to an agent so it can generate the bot class and its profile wiring.

### Prompt template

Use a prompt like this:

```text
You are working in the Whitepod codebase.

Create a new bot profile called "<profile name>".

Goal:
- <one-sentence strategy goal>

Behavior:
- <core decision rules>
- <tie-breaking rules>
- <placement preferences>

Constraints:
- Use only public engine APIs.
- The bot must be manually start/stop controlled.
- Profile selection must appear next to the bot button.
- Keep the selected profile after seed reset.

Implementation targets:
- Add the bot class under src/game/bot/
- Register the profile in the bot profile registry
- Wire the profile into the HUD selector
- Add or update tests if needed

Return:
- a file-by-file summary
- any assumptions you had to make
- validation steps
```

### What the agent should return

Ask the agent to return:

- the files it created or changed
- the bot API it implemented
- any UI wiring it added
- how it tested the result
- open questions or risks

### Good agent instructions

Be explicit about:

- the intended profile name
- the strategic goal
- whether the bot should be deterministic
- whether it should prioritize exploration, energy, logistics, or expansion
- whether the profile is experimental or production-ready

## Validation Checklist

Before considering a bot profile complete, verify:

- the bot can be started and stopped manually
- the profile selector switches profiles correctly
- the selected profile survives a seed reset
- seed apply clears the world and session
- the bot remains off after reset unless restarted manually
- the UI shows active status clearly
- the bot does not auto-start on page load
- the bot does not rely on hidden engine state
- the profile works on multiple seeds
- the selected profile and seed input survive a reset/reload boundary when the session is still valid

## Notes On Future Expansion

This system is designed to support more profiles later.

Future examples might include:

- a pure explorer bot (no processing, only map reveal)
- an energy-minimal bot (optimize solar/battery ratio for specific seeds)
- a logistics-first bot (prioritize mergers and belt corridors over raw extraction)
- a speedrun bot tuned for a specific seed pattern
- a circuit-bot variant with automated module replication

Any new profile should follow the same contract: manual control, explicit registration, deterministic behavior when possible, clear UI status, and **complete logistics support** (belts, storage routing, processor recipes).

## Action Logging For LLM Training

The game includes an action logging system to collect demonstration data for training autonomous bots.

### How It Works

- **Always-on logging**: All successful user actions are automatically logged during gameplay
- **Persistent storage**: Actions are saved to localStorage every 10 actions, plus on tab visibility change
- **Session-based**: Each game session has a unique ID; actions are tied to that session
- **Manual export**: Users can export their action log as JSON from the settings panel

### Captured Actions

The logger captures all successful gameplay actions:

- `place_building` — building placement with type, origin, and rotation
- `remove_building` — building removal with type
- `connect_buildings` — energy network connections
- `disconnect_buildings` — energy network disconnections
- `place_belt` — belt placement with endpoints and segment count
- `set_processor_recipe` — processor recipe assignments
- `place_resource` — resource tile placement
- `remove_resource` — resource tile removal
- `generate_map` — map generation with seed

### Export Format

Actions are exported as JSON with the following structure:

```json
{
  "sessionId": "uuid-string",
  "startedAtMs": 1713289200000,
  "actions": [
    {
      "sequence": 0,
      "timestampMs": 1713289205000,
      "kind": "generate_map",
      "payload": { "seed": 42 }
    },
    {
      "sequence": 1,
      "timestampMs": 1713289210000,
      "kind": "place_building",
      "payload": { "typeId": "solar_panel", "origin": { "x": 10, "y": 10 }, "rotation": 0 }
    }
  ]
}
```

### Using The Export

1. Open the game settings (gear icon in bottom-right HUD)
2. Click "Export actions" button
3. A JSON file downloads with all actions from the current session
4. Use this data for LLM training or analysis

### For Bot Developers

When training bots from human demonstrations:

- Parse the exported JSON to extract action sequences
- Each action includes `timestampMs` for temporal ordering
- `sequence` provides a global action counter
- `payload` contains action-specific parameters
- Only successful actions are logged (failed placements are excluded)

### Storage Details

- Actions are stored per-session in `localStorage` under key `whitepod:actions:v1`
- Old sessions are cleaned up on session reset
- Action logs persist across page reloads but are separate from world state

## Minimap and Keyboard Controls

The game includes an interactive minimap in the top-right corner with keyboard controls for camera navigation and zoom management.

### Minimap Features

**Position and Appearance:**
- Located in top-right corner (20px from edges)
- Default size: 180x180px
- Fully opaque with minimal thin border for viewport indicator
- Displays: resources, buildings, and viewport border
- Mode indicator text in corner showing current mode (zoom vs. navigate)

**Interactive Behavior:**
- **Click**: Jump camera to clicked position
- **Drag**: Smoothly pan camera to target position
- **Viewport border**: Shows current view area as thin outline

### Keyboard Controls

**Camera Panning (WASD/Arrows):**
- `W` / `↑`: Pan camera up (200px/sec)
- `A` / `←`: Pan camera left (200px/sec)
- `S` / `↓`: Pan camera down (200px/sec)
- `D` / `→`: Pan camera right (200px/sec)

**Zoom Control:**
- `+` / `=`: Zoom in (1.1x multiplier)
- `-` / `_`: Zoom out (1.1x multiplier)
- `Shift` + `Wheel`: Zoom mode (scroll to zoom)
- `Space`: Center viewport on map center

**Mode Indicator:**
- Shows current mode in minimap corner
- **Navigate mode**: Default, WASD/arrows pan camera
- **Zoom mode**: Shift key held, wheel input zooms

### Implementation Details

**Renderer Architecture:**
- `MinimapRenderer.ts`: PixiJS-based minimap renderer
- Uses `eventMode = 'static'` for pointer events (consistent with other renderers)
- Positioned via `app.stage.addChild()` to add to scene
- Updates each frame to reflect current game state

**Input Handling:**
- `KeyboardHandler.ts`: Handles WASD/arrows, +/-, Space
- `InputHandler.ts`: Passes `shiftKey` state to wheel handler
- Smooth animation for all camera movements via `Viewport.pan()` and `Viewport.zoomAt()`

**Integration:**
- Integrated into `GameCanvas.tsx` with keyboard handler
- Mode indicator added to `GameHUD.tsx`
- Build and lint pass successfully

### Design Decisions

- **Abandoned**: Shift-drag-to-move minimap position (removed due to PixiJS type complexity)
- **Chosen**: Full opacity minimap with minimal viewport border (per DESIGN.md)
- **Chosen**: Mode indicator text instead of color-coded borders
- **Avoided**: `R` key for rotation (reserved for building rotation)
- **Smooth transitions**: All camera movements use animation for visual consistency

### Future Enhancements (Optional)

- Add persistence for minimap position/size in localStorage
- Add resize handle for minimap dimensions
- Add visual polish (animations, better mode indicators)

## Known Limitations

As of this revision, the bot system has been simplified to two profiles with distinct responsibilities:

| Profile | Status |
|---------|--------|
| **MasterBot** | ✅ Fully implemented with cluster-based storage, distributed energy hubs, belt routing, processor configuration, resource rate monitoring, battery optimization, and frontier exploration at 10% density |
| **ConnectorBot** | ✅ Fully implemented with route-only behavior - connects extractors to storage/mergers/converter and power buildings to energy grid |

Both bots now include:
- Belt routing (`routeExtractorToStorage`, `routeProcessorOutputToStorage`, `routeExtractorToMerger`, `routeToProcessorInput`)
- Processor configuration (`configureConverterForResource`, `checkProcessorLogisticsReadiness`)
- Resource rate monitoring (`shouldThrottleExtractorPlacement`)
- Battery optimization (`shouldPrioritizeBatteryOverSolar`, `calculateRequiredBatteries`)
- Frontier-based exploration for MasterBot (`shouldTriggerExploration` at 10% density, `findFrontierWatchtowerPosition`)

**ConnectorBot** does NOT place any buildings - it only routes existing ones. This is by design.

**MasterBot** implements the new cluster-based approach:
- Distributed storage (1 per 4 extractors)
- Local energy clusters (batteries as hubs)
- Spiral expansion from center
- 10% build density trigger for exploration (occupied/revealed tiles)
- Belt routing with deterministic port selection
- Processor configuration for converters
- Resource rate monitoring for throttling
- Battery charge optimization

These changes were implemented in April 2026, consolidating the previous 9-profile system into a focused 2-profile system with clear separation of concerns.

### Implementation Summary

**What Changed (April 2026):**

1. **Consolidated profiles**: Removed 8 legacy profiles (greedy, fractal, explorer, balanced, logistics, speedrun, circuit, tactful)
2. **Created MasterBot**: New cluster-based builder with distributed storage and local energy hubs
3. **Created ConnectorBot**: New route-only bot for connecting existing buildings
4. **Updated exploration trigger**: Changed from 30% to 10% density threshold
5. **Updated storage logic**: Changed from single hub to distributed clusters (1 per 4 extractors)
6. **Updated energy logic**: Changed from global network to local clusters with batteries as hubs
7. **Updated test files**: Replaced all legacy profile IDs with `master`

**Utility Modules (Unchanged):**
- `src/game/bot/util/beltRouting.ts` - Belt path finding and port selection
- `src/game/bot/util/processorConfig.ts` - Processor recipe configuration
- `src/game/bot/util/spatialPlanning.ts` - Frontier detection, spiral anchors, density calculation
- `src/game/bot/util/energyPlanning.ts` - Battery/solar calculations, charge state monitoring
- `src/game/bot/util/resourceAnalysis.ts` - Resource rate analysis, throttle detection
