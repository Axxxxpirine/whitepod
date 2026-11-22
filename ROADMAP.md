# Whitepod — Roadmap to 1.0

**Status:** draft for team review · **Drafted:** 2026-11-20 · **Current version:** 0.0.0.2

The goal of 1.0 is a game that is **playable, fun and hard to put down**: a full campaign with a clear ending, built on top of the simulation we already have.

---

## 1. Where we are

The simulation is solid. The game around it does not exist yet.

**Already in place**

- 256×256 seeded map, fog of war, watchtower reveal.
- Extractors, auto-routed belts with flow resolution, mergers, storage.
- Energy network: solar, batteries, day/night cycle, power states.
- Converter (4 recipes) and synthesizer (5 recipes), 12 resources over 2 tiers.
- Local persistence, exact offline catch-up (8 h cap), music and SFX, bots, scenario generators, CI.
- A strong visual direction (`DESIGN.md`, "Architect's Drawing Board").

**Missing for it to be a game**

- Building is free: `placeBuilding` never charges any resource.
- Deposits are infinite: `resourceAmount` is set to 100 but never decremented.
- Resources have no use: stocks grow for nothing, ceramic plates (top of the tree) feed nothing.
- No goal, no unlocks, no ending: everything is available from second one.
- No onboarding: a new player does not know what to do.
- Belts have no throughput cap, so layout never becomes a puzzle.

---

## 2. Vision for 1.0 (decided 2026-11-20)

| Pillar | Decision |
|---|---|
| **Structure** | A **campaign with an ending** (target 4–6 h), then free play on the same map. |
| **Tension** | **Soft constraints**, no game over: lunar night, depleting deposits, limited space, belt throughput, energy balance. Fits the calm "architect" tone. |
| **Progression** | A **central hub that requests deliveries**. Each milestone delivered unlocks buildings and recipes. The next goal is always visible. |

### The core loop we are building

```
  Hub requests X ──▶ player builds a production line ──▶ delivers X
        ▲                                                     │
        │                                                     ▼
  new, harder request ◀── unlock new buildings/recipes ◀── milestone done
                         (construction is paid with what you produce)
```

What makes the genre addictive, and what each phase must protect:

1. **Demand pulls production**: the hub always wants something specific.
2. **Production pays for growth**: you build with what you extract.
3. **Unlocks create new problems**, not just bigger numbers.
4. **A next goal is always on screen**, with a progress bar.
5. **First reward within 3 minutes**, then a steady rhythm of "one more milestone".

### Campaign arc (working proposal)

Fantasy: make the Whitepod lunar outpost self-sufficient so it can host its first crew. The final goal is building the **Habitat Dome**, a multi-stage megaproject.

| Chapter | Theme | Hub asks for | Unlocks |
|---|---|---|---|
| 1 · Landing | Get the base running | Regolith, Oxygen | Battery, watchtower, converter |
| 2 · Refining | First transformations | Iron oxide, aluminum oxide, silicon dioxide | Merger, splitter *(new)*, synthesizer |
| 3 · Chemistry | Two-input recipes, night power | Water, methane, ammonia | Fuel cell *(new, night power)*, extractor mk2, fast belt |
| 4 · Industry | Tier-3 materials | Iron, glass, ceramic plates | Assembler *(new, 3 inputs)*, foundry, kiln |
| 5 · Colony | Megaproject | Structural frames, life-support modules, water, oxygen | Habitat Dome stages → **ending**, then free play |

---

## 3. Phases

Each phase ends with a **playtest among the team** and a short written debrief. A phase is done when its exit criterion is met, not when its list is empty.

### 0.1 — Core loop *(vertical slice)*

> Exit criterion: a new player can play 30–45 min of chapters 1–2 with costs and goals, and wants to keep going.

- **Hub building** placed at game start (lander), pre-revealed area, inputs on all sides.
- **Starting kit**: initial stock in the hub, enough for a first extraction line.
- **Construction costs** for every building, paid from stock; cost shown in the picker and on placement preview; placement refused with a clear reason when unaffordable.
- **Milestone system** (data-driven catalog): requested resources, amounts, rewards.
- **Unlock system**: buildings and recipes locked until their milestone.
- **"Next goal" panel** in the HUD with progress.
- **New game flow**: start screen (new game / continue), seed choice.
- Save format bump with progression state (pre-1.0: old saves may be reset).
- Chapters 1–2 content using existing buildings and recipes.

### 0.2 — Progression and constraints

> Exit criterion: chapters 1–3 playable end to end (~2 h), constraints felt but never blocking.

- **Belt throughput cap**, fast belt unlock.
- **Finite deposits** with much larger amounts, richer veins hidden in the fog to reward exploration.
- **Lunar night tuning**: night long enough to require batteries or fuel cells.
- New buildings: splitter, fuel cell, extractor mk2.
- **Recipe review** for coherence and interesting graphs: nitrogen and carbon now come out of regolith through the converter, and methane, CO₂ and ammonia are built on them (#93).
- Chapter 3 content.
- Bots updated to play with costs and unlocks (needed for balancing in 0.6).

### 0.3 — Readability and quality of life

> Exit criterion: someone outside the team plays the first 20 minutes without any explanation.

- **Guided tutorial** woven into chapter 1 milestones (no separate tutorial mode).
- **Diagnostics**: why is this machine stopped (no power, no input, output blocked, wrong recipe); bottleneck highlight.
- **Overlays**: power network, belt flow, deposit amounts.
- **QoL essentials of the genre**: undo, move building, copy/paste with rotation, area delete, pipette.
- **Production stats**: rates over time per resource.

### 0.4 — Game feel

> Exit criterion: playtesters describe completing a milestone as "satisfying".

- Milestone celebration (visual + audio), unlock reveal.
- Machine animations and feedback when working, idle or starved.
- Audio pass: per-building loops, milestone stingers, music intensity by chapter.
- Sprites for every new building, faithful to `DESIGN.md`.
- Offline summary tied to goals ("while you were away: milestone 80 %").

### 0.5 — Full campaign

> Exit criterion: the campaign can be finished from start to ending.

- Tier-3 resources and recipes, assembler, foundry, kiln.
- Chapters 4–5, Habitat Dome megaproject in stages.
- Ending sequence, end-of-run stats, free play continues.
- Soft events: solar storm (solar output drop), long night, deposit discovery.

### 0.6 — Balance, performance, robustness

> Exit criterion: campaign length within target on bot runs; 60 fps on a late-game factory.

- **Automated balancing bench**: the Master bot plays seeded runs in accelerated time and reports time-to-milestone; runs in CI to catch balance regressions.
- Performance target: late-game factory (≈ 2 000 buildings) at 60 fps, simulation tick budget documented.
- Save robustness: versioned migrations, several save slots, export/import.
- Medium and complex generator routing is covered by seeded regressions across mirrored layouts and viewport sizes.

### 1.0 — Release

> Exit criterion: external playtesters finish the campaign and would recommend it.

- External playtests and a final balance pass.
- Settings: audio, controls, accessibility (colour-safe overlays, UI scale).
- Credits, versioning, changelog.
- Release target to decide (web build, itch.io, desktop wrapper).

---

## 4. Open decisions

| # | Question | Proposal |
|---|---|---|
| D1 | Final goal and name of the campaign | Habitat Dome, "make the outpost self-sufficient" |
| D2 | Where construction is paid from: hub only, or every storage | **Decided 2026-11-20: global stock (hub + every storage)**, already aggregated by `getResourceCounts` |
| D3 | Deposit size once finite | **Decided 2026-11-22 (#89):** 1 500 units per tile near the centre (50 min of one extractor), growing with distance (doubles at 64 tiles); beyond 24 tiles, 1 in 5 tiles is a rich vein (×4). Campaign only, sandbox deposits stay endless. Measured on the scripted playthrough: the most used deposit still holds ~970 units at the end of chapter 2. Numbers in `src/game/data/depositAmounts.ts` |
| D4 | Target campaign length | 4–6 h, measured by the balancing bench |
| D5 | Release platform | Decide during 0.5 |
| D6 | Playtest telemetry (milestone times, session length) | Opt-in, local first, decide in 0.3 |
| D7 | Role of bots in 1.0 | Dev and balancing tool; an in-game automation feature could come after 1.0 |
| D8 | Who owns which phase or system | To agree as a team |

---

## 5. How we work this roadmap

- Each phase becomes a **GitHub milestone**; each bullet becomes one or more issues.
- Small, focused PRs, as described in `CLAUDE.md`.
- Gameplay numbers (costs, milestone amounts, rates) live in data catalogs, never hard-coded in systems, so balancing does not require code changes.
- This file is updated when a phase closes or a decision is taken.
