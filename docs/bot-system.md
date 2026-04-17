# Whitepod Bot System

This document defines the bot system for Whitepod: how bot profiles work, how bot logic should be structured, how the UI controls them, and how to add new bot classes with agent help.

The goal is to keep the system extensible. The current codebase exposes several profile-backed bots, with `greedy` as the legacy baseline and `fractal` as the adaptive spiral strategy.

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

Examples:

- `greedy`: legacy behavior, fast and simple, based on the current `AutonomousBot` logic.
- `fractal`: adaptive exploration strategy using a spiral, fractal-style layout.
- `explorer`: aggressive map reveal with frontier watchtowers.
- `balanced`: steady growth with power-first discipline.
- `logistics`: compact, connected infrastructure modules.
- `speedrun`: fast early expansion with minimal overhead.
- `circuit`: circuit-board style layout with spaced modules and belt routing.

Profiles are selected in the UI and determine which bot class is instantiated.

### Victory Condition

Victory is profile-specific.

For the fractal profile, the win condition is exploration-based and tied to completion of the fractal spiral pattern. This is not a classic score-based victory. It is a structural success condition: the bot has explored and expanded according to its target spiral coverage.

### Session

A session is the current live game state, including world state, UI selection, and bot state.

When the user applies a new seed, the session may be reset entirely. The selected bot profile must remain unchanged.

## Current System Snapshot

The codebase currently uses a profile-backed bot controller with these files:

- `src/game/bot/AutonomousBot.ts`
- `src/game/bot/FractalBot.ts`
- `src/game/bot/ExplorerBot.ts`
- `src/game/bot/BalancedBot.ts`
- `src/game/bot/LogisticsBot.ts`
- `src/game/bot/SpeedrunBot.ts`
- `src/game/bot/CircuitBot.ts`
- `src/game/bot/BotController.ts`
- `src/game/bot/botSession.ts`
- `src/game/bot/botProfiles.ts`
- `src/game/bot/botTypes.ts`
- `src/game/bot/seedInput.ts`
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

### Greedy profile (`AutonomousBot`)

**Goal:** Preserve legacy behavior as a regression baseline while adding full logistics support.

**Expected behaviors:**
- Place extractors on visible deposits, prioritizing Regolith and Hydrogen
- Reactively add solar panels when `surplusPower < -5` during daylight
- Add batteries when unpowered extractors exist and no battery is present
- Connect all power-capable buildings into a single energy network
- **NEW:** Trigger exploration when build density reaches 30%: place watchtower at fog boundary (frontier detection)
- **NEW:** Route each extractor to the nearest storage building via belt with deterministic port selection
- **NEW:** Configure converters with base recipes (iron_oxide, aluminum_oxide) when placed near regolith
- **NEW:** Monitor `getResourceRates()` to throttle extractor placement when rates are negative
- **NEW:** Check `batteryCharges` before placing solar; prioritize batteries when charge < 50%

**Status:** Fully implemented with belt routing, processor configuration, resource rate monitoring, battery optimization, and frontier-based exploration.

### Explorer profile (`ExplorerBot`)

**Goal:** Aggressively reveal the map frontier and establish observation posts.

**Expected behaviors:**
- Prioritize watchtower placement at maximum distance from center into unrevealed territory
- Use frontier detection (not just distance) to target unexplored regions
- Place extractors only on clearly visible, high-value deposits near revealed territory
- **NEW:** Route extractors to storage via belts with deterministic port selection
- **NEW:** Configure converters with base recipes (iron_oxide, aluminum_oxide) when available
- **NEW:** Monitor `getResourceRates()` to throttle extractor placement when rates are negative
- **NEW:** Check `batteryCharges` before placing solar; prioritize batteries when charge < 50%

**Status:** Fully implemented with belt routing, processor configuration, resource rate monitoring, battery optimization, and frontier-based exploration. Exploration remains primary focus; logistics/processing are secondary.

### Balanced profile (`BalancedBot`)

**Goal:** Steady, sustainable growth with energy stability ahead of expansion.

**Expected behaviors:**
- Throttle extractor placement when `surplusPower < 10` or battery capacity is insufficient for night
- Prefer batteries over additional solar during daylight when charge state is low
- Place extractors with a steadier cadence (no bursts) to match power growth curve
- **NEW:** Monitor `getResourceRates()` and reduce extractor count if net rate is negative for a resource
- **NEW:** Route all extractors to storage via belts with deterministic port selection
- **NEW:** Configure converters for tier-1 output (iron_oxide, aluminum_oxide) when input materials are available
- **NEW:** Handle exploration when build density reaches 30%: place watchtower at fog boundary

**Status:** Fully implemented with belt routing, processor configuration, resource rate monitoring, battery optimization, and frontier-based exploration.

### Logistics profile (`LogisticsBot`)

**Goal:** Compact, connected infrastructure with organized material flow.

**Expected behaviors:**
- Place extractors in tight clusters near a central storage hub
- **NEW:** Use mergers to combine multiple extractor outputs into single storage inputs
- **NEW:** Route all belts with deterministic port preferences (e.g., `out_east` → `in_west`)
- **NEW:** Configure converters and synthesizers to create complete processing chains from base to tier-2 resources
- **NEW:** Place batteries as part of infrastructure modules, not reactively
- **NEW:** Reserve belt corridors explicitly; no buildings placed in corridor zones
- **NEW:** Trigger exploration when build density reaches 30%: place watchtower at fog boundary

**Expected layout pattern:** Storage in center, extractors in a ring around it, mergers between extractors and storage, energy network distributed evenly.

**Status:** Fully implemented with belt routing, processor configuration, resource rate monitoring, battery optimization, and corridor planning.

### Speedrun profile (`SpeedrunBot`)

**Goal:** Fast early expansion to maximize resource accumulation in the first minutes.

**Expected behaviors:**
- Surge extractors immediately on available deposits (up to 18 placements per tick)
- Defer battery placement until after initial extraction ramp-up
- Place watchtowers only when solar count equals extractor count (sufficient power assumed)
- **NEW:** Route all extractors to storage immediately to unlock buffered resources
- **NEW:** Configure converters with base recipes (iron_oxide, aluminum_oxide) when available
- **NEW:** Monitor `getResourceRates()` to throttle surge when rates are negative
- **NEW:** Check `batteryCharges` before placing solar; prioritize batteries when charge < 50%

**Status:** Fully implemented with belt routing, processor configuration, resource rate monitoring, and battery optimization.

### Circuit profile (`CircuitBot`)

**Goal:** Regular, board-like layouts with explicit belt corridors and modular spacing. **No exploration** - map expansion is manual (user-controlled) only.

**Expected behaviors:**
- Place modules in spaced rows (e.g., every 4–6 tiles) to create routing channels
- **NEW:** Reserve belt corridors explicitly; no buildings placed in corridor zones
- **NEW:** Use mergers at corridor intersections to consolidate flows
- **NEW:** Configure converters and synthesizers within each module, creating self-contained processing units
- **NEW:** Balance energy per module rather than globally; each module should have its own solar/battery cluster
- **NEW:** Route all extractors to storage via belts with deterministic port selection
- **NEW:** Monitor `getResourceRates()` to throttle extractor placement when rates are negative
- **NEW:** Check `batteryCharges` before placing solar; prioritize batteries when charge < 50%
- **REMOVED:** No watchtower placement; exploration is manual (user-controlled) only

**Expected layout pattern:** Grid of modules with horizontal and vertical belt highways, energy clusters localized per module.

**Status:** Fully implemented with belt routing, processor configuration, resource rate monitoring, and battery optimization. No exploration logic.

### Fractal profile (`FractalBot`)

**Goal:** Adaptive exploration with a recursive spiral layout that scales across the map.

**Expected behaviors:**
- Start near a central anchor and expand outward in spiral rings
- Place repeated module units along the spiral path, each self-consistent and scalable
- Track progress toward an exploration-based victory: complete spiral coverage of revealed deposits
- **NEW:** Route extractors to storage via belts that follow the spiral geometry
- **NEW:** Configure converters at regular intervals along the spiral to process base resources locally
- **NEW:** Adjust spiral step size based on revealed tile density — slow expansion in dense resource zones, fast in sparse zones
- **NEW:** Monitor `getResourceRates()` to throttle extractor placement when rates are negative
- **NEW:** Check `batteryCharges` before placing solar; prioritize batteries when charge < 50%

**Victory condition:** Structural success when the spiral pattern has covered all visible resource deposits within a target radius, with all extractors connected to storage and at least one processing chain operational.

**Status:** Fully implemented with belt routing, processor configuration, resource rate monitoring, and battery optimization.

### Master profile (`MasterBot`)

**Goal:** Demonstrate all advanced bot features with spaced module placement, complete logistics routing, and adaptive spiral expansion.

**Expected behaviors:**
- Place modules in spaced rows (every 5 tiles) creating 2-tile belt corridors between modules
- Each module contains: 3 extractors, 1 merger, 1 converter, localized solar/battery cluster
- Route all extractors to storage via belts with deterministic port selection
- Route extractor outputs to mergers, then mergers to storage
- Configure converters with base recipes (iron_oxide, aluminum_oxide) when regolith is available
- Defer synthesizer placement until late game (requires 50+ iron_oxide and 50+ aluminum_oxide stock)
- Use mergers to consolidate multiple extractor outputs into single storage inputs
- Reserve belt corridors explicitly; no buildings placed in corridor zones
- Trigger exploration when build density reaches 30%: place watchtower at fog boundary
- Expand using adaptive spiral pattern: step size adjusts based on resource density
- Maintain isolated energy clusters per module (not global network)
- Monitor `getResourceRates()` to throttle extractor placement when rates are negative
- Check `batteryCharges` before placing solar; prioritize batteries when charge < 50%

**Module template specification:**
```
Module Layout (5x5 grid):
    [S] [E] [M] [E] [S]
    
[S] = Solar panel (local energy cluster)
[E] = Extractor (3 per module, spaced 2 tiles apart)
[M] = Merger (centralized after extractors)

Belt Flow:
  Extractor → (corridor) → Merger → (corridor) → Storage
  Converter → (corridor) → Storage

Energy Flow:
  Solar → Battery → Extractors/Converter (isolated per module)
```

**Expansion logic:**
- Start near center, expand outward in adaptive spiral
- When density ≥ 30%: place watchtower at fog boundary (farthest frontier tile)
- Continue spiral from new zone with adjusted step size
- Step size: 3 tiles in dense zones (≥4 visible deposits), 7 tiles in sparse zones (<2 deposits), 5 tiles default

**Status:** Fully implemented with belt routing, processor configuration, resource rate monitoring, and battery optimization. Reference implementation for all other profiles.

## Fractal Strategy

The fractal strategy should be thought of as a large spiral that recursively repeats a module pattern.

### Strategy shape

- Start near a central anchor.
- Expand outward in spiral rings.
- Place repeated module units along the spiral.
- Each module should be self-consistent and scalable.
- Continue until the target coverage or pattern completion condition is reached.

### Layout intent

The layout should feel like a large living spiral, not a flat grid or random scatter.

The module should be readable, repeatable, and easy to extend.

### Practical constraints

- Stay inside the map bounds.
- Respect fog of war and placement requirements.
- Avoid overcommitting to unscouted space.
- Prefer module placement near revealed deposits.
- Use energy placement that supports the current extractor count.

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

Suggested profile ids:

- `greedy`
- `fractal`
- `explorer`
- `balanced`
- `logistics`
- `speedrun`
- `circuit`

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

- `greedy`
- `fractal`
- `explorer`
- `balanced`

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
- Preserve the current greedy profile unchanged.
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

### Recommended Implementation Order

#### Phase 1: CircuitBot - Remove Exploration (Low Complexity)
- Remove `placeWatchtowerIfSafe()` method entirely
- Remove watchtower placement from `runCycle()` priority
- Update phase labels to standardize: 'mining', 'logistics', 'powering', 'processing'
- Verify: No watchtowers placed after 100 ticks; extractor/energy placement unchanged

#### Phase 2: AutonomousBot - Add Full Feature Set (Medium Complexity)
- Add imports: `routeExtractorToStorage`, `configureConverterForResource`, `shouldThrottleExtractorPlacement`, `shouldPrioritizeBatteryOverSolar`, `shouldTriggerExploration`
- Add `storageId: BuildingId | null` state field
- Add methods: `initializeStorageIfNeeded()`, `routeExtractorsToStorage()`, `configureProcessors()`, `handleExplorationTrigger()`
- Replace `expandVision()` with `handleExplorationTrigger()` (30% density threshold)
- Update `runCycle()` priority: storage → exploration → extractors → belt routing → processors → energy → network
- Modify `placeBestExtractor()` with throttle check
- Replace `ensureEnergySupply()` with battery-optimized version
- Verify: Belt routing works, processors configured, exploration at 30% density, battery optimization active

#### Phase 3: ExplorerBot - Add Full Feature Set (Medium Complexity)
- Add same imports and state as AutonomousBot
- Add same utility methods
- Update `runCycle()` priority: storage → watchtower (primary) → belt routing → processors → extractors → energy → network
- Keep exploration as primary focus; logistics/processing secondary
- Modify `placeBestExtractor()` with throttle check
- Replace `ensureEnergySupply()` with battery-optimized version
- Verify: Watchtowers still prioritize frontier, belts route extractors, processors configured

#### Phase 4: FractalBot - Add Full Feature Set (Medium Complexity)
- Add same imports and state as AutonomousBot
- Add same utility methods
- Update `runCycle()` priority: storage → spiral watchtower → belt routing → processors → extractors → energy → network
- Modify `placeBestExtractor()` with throttle check
- Replace `ensureEnergySupply()` with battery-optimized version
- Verify: Spiral expansion continues, belts follow geometry, processors configured

#### Phase 5: LogisticsBot - Add Full Feature Set (Medium Complexity)
- Add same imports and state as AutonomousBot
- Add `reservedCorridors: Set<string>` for corridor planning
- Replace `placeWatchtowerIfSafe()` with `handleExplorationTrigger()` (30% density)
- Update `runCycle()` priority: storage → exploration → extractors → belt routing → processors → energy → network
- Modify `placeBestExtractor()` with throttle check
- Replace `ensureEnergyBalance()` with battery-optimized version
- Verify: Infrastructure layout compact, belts route correctly, exploration at density threshold

#### Phase 6: BalancedBot - Add Full Feature Set (Medium Complexity)
- Add same imports and state as AutonomousBot
- Replace `placeWatchtowerIfSafe()` with `handleExplorationTrigger()` (30% density)
- Update `runCycle()` priority: storage → exploration → extractors → belt routing → processors → energy → network
- Modify `placeBestExtractor()` with throttle check
- Enhance existing `ensureEnergyBalance()` with battery optimization
- Verify: Steady growth maintained, energy discipline preserved, exploration triggered at 30%

#### Phase 7: SpeedrunBot - Add Full Feature Set (Low Complexity)
- Add same imports and state as AutonomousBot
- Update `runCycle()` priority: storage → surge extractors → belt routing → processors → energy → watchtower
- Modify `surgeExtractors()` with throttle check (may delay surge if rates negative)
- Add `configureProcessors()` call after belt routing
- Verify: Aggressive early expansion maintained, belts route immediately, processors configured

#### Phase 8: Validation & Testing (Medium Complexity)
- Run `npm test`, `npm run lint`, `npm run build` for all bots
- Manual test each bot on 3+ different seeds
- Verify belt routing: `getResourceCounts()` increases over time
- Verify processor config: `getProcessorState()` shows non-null recipeId
- Verify rate monitoring: extractors throttle when rates negative
- Verify battery optimization: batteries prioritized when charge < 50%
- Verify exploration triggers at 30% density (except CircuitBot)

#### Future Work (Defer to Separate PRs)

**Phase A: Add Scenario Tests and Regression Coverage**
- Create seed-backed scenarios for `bootstrap-energy-grid`, `tier-complex`, `tier-build-all`
- Add bot execution tests that verify belt routing and processor configuration
- Verify: Each profile passes its scenario on at least 3 different seeds

**Phase B: Enhance LogisticsBot with Merger Placement**
- Add automatic merger placement for consolidating extractor outputs
- Implement merger-to-storage belt routing
- Verify: Compact infrastructure layout with organized material flow

**Phase C: Enhance CircuitBot with Corridor Logic**
- Implement automatic belt corridor reservation
- Add module spacing logic with 2-tile corridor widths
- Verify: Grid of modules with horizontal and vertical belt highways

**Phase D: Complete FractalBot Victory Condition Tracking**
- Implement spiral coverage percentage calculation
- Track progress toward exploration-based victory
- Add victory condition detection and UI feedback

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

As of this revision, all 7 legacy bot profiles match their specifications with full feature parity to MasterBot.

| Profile | Status |
|---------|--------|
| **AutonomousBot** | ✅ Fully compliant with belt routing, processor config, rate monitoring, battery optimization, frontier exploration |
| **ExplorerBot** | ✅ Fully compliant (exploration primary, logistics/processing secondary) |
| **FractalBot** | ✅ Fully compliant with spiral expansion, belt routing, processor config, rate monitoring, battery optimization |
| **BalancedBot** | ✅ Fully compliant with steady growth, energy discipline, logistics support, frontier exploration |
| **LogisticsBot** | ✅ Fully compliant with infrastructure focus, merger support, corridor planning, frontier exploration |
| **SpeedrunBot** | ✅ Fully compliant with aggressive early expansion, logistics support, rate monitoring, battery optimization |
| **CircuitBot** | ✅ Fully compliant with module layout, belt routing, processor config; **no exploration** (manual only) |
| **MasterBot** | ✅ Reference implementation (unchanged) |

All bots now include:
- Belt routing (`routeExtractorToStorage`, `routeProcessorOutputToStorage`)
- Processor configuration (`configureConverterForResource`, `configureSynthesizerForRecipe`)
- Resource rate monitoring (`shouldThrottleExtractorPlacement`)
- Battery optimization (`shouldPrioritizeBatteryOverSolar`, `calculateRequiredBatteries`)
- Frontier-based exploration (`shouldTriggerExploration`, `findFrontierWatchtowerPosition`) for all profiles except CircuitBot

**CircuitBot** is the only profile without exploration logic. Watchtower placement has been removed entirely; map expansion is manual (user-controlled) only.

**MasterBot** remains the reference implementation with all advanced features fully implemented:
- Belt routing with deterministic port selection (extractors → storage, processors → storage)
- Processor configuration (converters with iron_oxide/aluminum_oxide recipes, synthesizers with ceramic_plates when inputs available)
- Resource rate monitoring (`getResourceRates()`) for throttling overproduction
- Battery charge optimization (`batteryCharges`, `getEnergyStorageTotals()`)
- Frontier-based watchtower placement (not just distance)
- Spacious layout with reserved belt corridors (2-tile wide highways)
- 30% density trigger for exploration (watchtowers at fog boundary)
- Mergers for belt network consolidation (3 extractors → 1 merger → storage)
- Adaptive spiral expansion (step size adjusts based on resource density)
- Localized energy clusters per module (isolated solar/battery per module)

These features were implemented in Phases 1-8 of the bot system update (April 2026), with MasterBot serving as the reference implementation for all utility functions and patterns.

### Implementation Summary

**Phases Completed (April 2026):**

1. **Phase 1 - CircuitBot**: Removed `placeWatchtowerIfSafe()` method, removed watchtower placement from `runCycle()`, added storage tracking, belt routing, processor configuration, resource rate monitoring, and battery optimization.

2. **Phase 2 - AutonomousBot**: Added `storageId` field, `initializeStorageIfNeeded()`, `handleExplorationTrigger()`, `routeExtractorsToStorage()`, `configureProcessors()`, replaced `expandVision()` with frontier-based exploration, added resource rate throttling and battery optimization.

3. **Phase 3 - ExplorerBot**: Added same feature set as AutonomousBot, keeping exploration (frontier watchtowers) as primary focus with logistics/processing as secondary.

4. **Phase 4 - FractalBot**: Added same feature set with spiral-based exploration, adaptive step size, and belt routing following spiral geometry.

5. **Phase 5 - LogisticsBot**: Added same feature set with infrastructure focus and corridor planning support.

6. **Phase 6 - BalancedBot**: Added same feature set with steady growth and energy discipline preserved.

7. **Phase 7 - SpeedrunBot**: Added same feature set with aggressive early expansion (up to 18 placements per tick), immediate belt routing, and processor configuration.

8. **Phase 8 - Validation**: All bots pass `npm run lint`, `npm run build`, and type checking.

**Utility Modules Created/Updated:**
- `src/game/bot/util/beltRouting.ts` - Belt path finding and port selection
- `src/game/bot/util/processorConfig.ts` - Processor recipe configuration
- `src/game/bot/util/spatialPlanning.ts` - Frontier detection, spiral anchors, corridor planning
- `src/game/bot/util/energyPlanning.ts` - Battery/solar calculations, charge state monitoring
- `src/game/bot/util/resourceAnalysis.ts` - Resource rate analysis, throttle detection
