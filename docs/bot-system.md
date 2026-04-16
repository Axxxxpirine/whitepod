# Whitepod Bot System

This document defines the bot system for Whitepod: how bot profiles work, how bot logic should be structured, how the UI controls them, and how to add new bot classes with agent help.

The goal is to keep the system extensible. The current greedy bot remains available as a legacy profile, while the new fractal profile becomes the adaptive strategy for exploration-driven play.

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
- `src/game/bot/BotController.ts`
- `src/game/bot/botProfiles.ts`
- `src/game/bot/botTypes.ts`

The `greedy` profile preserves the legacy behavior. The `fractal` profile is the adaptive spiral strategy. The UI selects the profile explicitly and the bot no longer auto-starts on page load.

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

## Engine Contract For Bots

Bots must use public engine APIs only.

The most important calls are:

- `engine.canPlaceBuilding(...)`
- `engine.placeBuilding(...)`
- `engine.canPlaceBelt(...)`
- `engine.placeBelt(...)`
- `engine.connectBuildings(...)`
- `engine.disconnectBuildings(...)`
- `engine.getBuildings()`
- `engine.getConnections()`
- `engine.getResourceAt(...)`
- `engine.getResourceCounts()`
- `engine.getResourceRates()`
- `engine.getEnergyGlobalStats()`
- `engine.getBuildingPowerState(...)`
- `engine.generateMap(seed)`
- `engine.runWithoutNotifications(...)`

### Required bot rules

- Use `runWithoutNotifications` when a cycle performs multiple related actions.
- Check `canPlace*` APIs before committing to actions when the placement may fail.
- Prefer deterministic choices for tie-breaking.
- Do not depend on hidden state outside the engine and the bot instance.
- Do not assume storage or belts create automatic economy unless the engine explicitly supports it.

## Profile Responsibilities

### Greedy profile

The greedy profile preserves the current behavior.

It is expected to:

- place extractors on visible deposits
- reactively add solar panels and batteries
- connect the energy network
- expand vision with watchtowers

This profile exists as the legacy baseline and should remain available for comparison and regression testing.

### Fractal profile

The fractal profile is the primary adaptive bot.

It is expected to:

- explore the map aggressively but structurally
- build a large spiral fractal layout across the map
- favor balanced energy over naive short-term placement
- grow in recursive modules rather than random local clusters
- track progress toward an exploration-based victory target

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

1. Extract the current greedy bot into a profile-backed structure.
2. Add profile selection to the HUD.
3. Add the seed input and reset flow.
4. Implement the fractal bot class.
5. Add spiral module planning.
6. Add victory/progress tracking for exploration coverage.
7. Add tests and scenario coverage.

## Notes On Future Expansion

This system is designed to support more profiles later.

Future examples might include:

- a pure explorer bot
- an energy-minimal bot
- a logistics-first bot
- a speedrun bot for a specific seed

Any new profile should follow the same contract: manual control, explicit registration, deterministic behavior when possible, and clear UI status.
