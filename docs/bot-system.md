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

**Goal:** Preserve legacy behavior as a regression baseline while adding minimal logistics support.

**Expected behaviors:**
- Place extractors on visible deposits, prioritizing Regolith and Hydrogen
- Reactively add solar panels when `surplusPower < -5` during daylight
- Add batteries when unpowered extractors exist and no battery is present
- Connect all power-capable buildings into a single energy network
- Expand vision with watchtowers when `surplusPower >= 5`
- **New:** Route each extractor to the nearest storage building via belt
- **New:** Configure converters with base recipes (iron_oxide, aluminum_oxide) when placed near regolith

**Known limitations:** No multi-tier processing, no merger support, no rate-based throttling.

### Explorer profile (`ExplorerBot`)

**Goal:** Aggressively reveal the map frontier and establish observation posts.

**Expected behaviors:**
- Prioritize watchtower placement at maximum distance from center into unrevealed territory
- Use frontier detection (not just distance) to target unexplored regions
- Place extractors only on clearly visible, high-value deposits near revealed territory
- **New:** Route extractors to storage via belts to prevent resource buffering
- **New:** Establish small, isolated energy subnets per frontier outpost rather than one global network

**Known limitations:** Does not build processing chains; exploration is an end in itself.

### Balanced profile (`BalancedBot`)

**Goal:** Steady, sustainable growth with energy stability ahead of expansion.

**Expected behaviors:**
- Throttle extractor placement when `surplusPower < 10` or battery capacity is insufficient for night
- Prefer batteries over additional solar during daylight when charge state is low
- Place extractors with a steadier cadence (no bursts) to match power growth curve
- **New:** Monitor `getResourceRates()` and reduce extractor count if net rate is negative for a resource
- **New:** Route all extractors to storage via belts with deterministic port selection
- **New:** Configure converters for tier-1 output (iron_oxide, aluminum_oxide) when input materials are available

**Known limitations:** No synthesizer placement; tier-2 production (ceramic_plates) not supported.

### Logistics profile (`LogisticsBot`)

**Goal:** Compact, connected infrastructure with organized material flow.

**Expected behaviors:**
- Place extractors in tight clusters near a central storage hub
- **New:** Use mergers to combine multiple extractor outputs into single storage inputs
- **New:** Route all belts with deterministic port preferences (e.g., `out_east` → `in_west`)
- **New:** Configure converters and synthesizers to create complete processing chains from base to tier-2 resources
- **New:** Place batteries as part of infrastructure modules, not reactively

**Expected layout pattern:** Storage in center, extractors in a ring around it, mergers between extractors and storage, energy network distributed evenly.

**Status:** Current implementation does not yet match this specification; the bot behaves like a variant of AutonomousBot.

### Speedrun profile (`SpeedrunBot`)

**Goal:** Fast early expansion to maximize resource accumulation in the first minutes.

**Expected behaviors:**
- Surge extractors immediately on available deposits (up to 18 placements per tick)
- Defer battery placement until after initial extraction ramp-up
- Place watchtowers only when solar count equals extractor count (sufficient power assumed)
- **New:** Route all extractors to storage immediately to unlock buffered resources
- **New:** Configure at least one converter with iron_oxide recipe to demonstrate tier-1 capability

**Known limitations:** Aggressive early growth may lead to power instability; no late-game optimization.

### Circuit profile (`CircuitBot`)

**Goal:** Regular, board-like layouts with explicit belt corridors and modular spacing.

**Expected behaviors:**
- Place modules in spaced rows (e.g., every 4–6 tiles) to create routing channels
- **New:** Designate clear belt corridors between module rows; avoid ad-hoc belt routing
- **New:** Use mergers at corridor intersections to consolidate flows
- **New:** Configure converters and synthesizers within each module, creating self-contained processing units
- **New:** Balance energy per module rather than globally; each module should have its own solar/battery cluster

**Expected layout pattern:** Grid of modules with horizontal and vertical belt highways, energy clusters localized per module.

**Status:** Current implementation does not yet match this specification; no belt routing or circuit logic is present.

### Fractal profile (`FractalBot`)

**Goal:** Adaptive exploration with a recursive spiral layout that scales across the map.

**Expected behaviors:**
- Start near a central anchor and expand outward in spiral rings
- Place repeated module units along the spiral path, each self-consistent and scalable
- Track progress toward an exploration-based victory: complete spiral coverage of revealed deposits
- **New:** Route extractors to storage via belts that follow the spiral geometry
- **New:** Configure converters at regular intervals along the spiral to process base resources locally
- **New:** Adjust spiral step size based on revealed tile density — slow expansion in dense resource zones, fast in sparse zones

**Victory condition:** Structural success when the spiral pattern has covered all visible resource deposits within a target radius, with all extractors connected to storage and at least one processing chain operational.

**Known limitations:** Current implementation does not yet implement belt routing or processor configuration; spiral step adaptation is not tied to fog density.

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

## Recommended Implementation Order

### Phase 1: Extract shared utilities (zero behavior change)
- Extract `priorities.ts`, `placementUtils.ts`, `energyUtils.ts`, `resourceScoring.ts`
- Refactor all 7 bots to import from shared modules
- Verify: `npm test`, `npm run lint`, `npm run build` pass; bots behave identically to baseline

### Phase 2: Add belt routing to AutonomousBot (greedy)
- Implement `placeBeltToStorage(extractorId, storageId)` using `engine.placeBelt(...)`
- Wire all extractors to nearest storage with deterministic port selection
- Verify: Resources flow from extractors; `getResourceCounts()` increases over time

### Phase 3: Add processor support to BalancedBot
- Implement `setProcessorRecipes()` that calls `engine.setProcessorRecipe(id, recipeId)`
- Detect available converters/synthesizers via `isProcessorTypeId()`
- Check `getProcessorLogisticsStatus()` before recipe changes
- Verify: Converters/synthesizers produce output; tier-1 resources appear in stock

### Phase 4: Add resource rate monitoring to BalancedBot
- Replace `describeBalanceTarget()` to include `engine.getResourceRates()`
- Throttle extractors when stock grows faster than processing capacity
- Verify: Bots prevent overproduction; negative rates are detected and corrected

### Phase 5: Optimize watchtower placement in ExplorerBot and FractalBot
- Replace distance-based heuristics with frontier detection using `grid.isRevealed()`
- Track `grid.fogVersion` for stale targets
- Verify: Watchtowers target unexplored regions; faster map coverage

### Phase 6: Battery state optimization (all bots)
- Check `engine.batteryCharges` before placing solar/batteries
- Use `engine.getEnergyStorageTotals()` for capacity planning
- Verify: Fewer extractors go unpowered at night; fewer batteries needed

### Phase 7: Update LogisticsBot and CircuitBot to specification
- Add merger placement, belt corridor logic, and module-based energy balancing
- Verify: Compact infrastructure layout with organized material flow

### Phase 8: Complete FractalBot spiral adaptation
- Implement spiral step adaptation based on revealed tile density
- Add belt routing that follows spiral geometry
- Configure converters at regular intervals along the spiral
- Implement victory condition tracking (spiral coverage percentage)

### Phase 9: Add scenario tests and regression coverage
- Create seed-backed scenarios for `bootstrap-energy-grid`, `tier-complex`, `tier-build-all`
- Add bot execution tests that verify belt routing and processor configuration
- Verify: Each profile passes its scenario on at least 3 different seeds

## Notes On Future Expansion

This system is designed to support more profiles later.

Future examples might include:

- a pure explorer bot (no processing, only map reveal)
- an energy-minimal bot (optimize solar/battery ratio for specific seeds)
- a logistics-first bot (prioritize mergers and belt corridors over raw extraction)
- a speedrun bot tuned for a specific seed pattern
- a circuit-bot variant with automated module replication

Any new profile should follow the same contract: manual control, explicit registration, deterministic behavior when possible, clear UI status, and **complete logistics support** (belts, storage routing, processor recipes).

## Known Limitations

As of this revision, the following profiles do not yet match their specifications:

| Profile | Missing Features |
|---------|------------------|
| **LogisticsBot** | No belt routing, no merger placement, no processor configuration; behaves like AutonomousBot |
| **CircuitBot** | No belt corridors, no module spacing logic, no localized energy clusters |
| **FractalBot** | No belt routing following spiral geometry, no processor configuration, no spiral step adaptation based on fog density |
| **All profiles** | No resource rate monitoring (`getResourceRates()`), no battery charge state optimization |

These gaps are documented to set expectations for the implementation phases outlined above.
