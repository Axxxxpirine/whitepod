# Changelog

All notable changes to Whitepod will be documented in this file.

## [0.0.0.2] - 2026-04-16

### Added

- Lunar ISRU resource lore: base resources renamed Regolith (1), Hydrogen (2), Oxygen (3)
- 9 new resources across 2 tiers: IronOxide, AluminumOxide, SiliconDioxide, NitrogenGas (tier-1 converter outputs); Water, Methane, CarbonDioxide, Ammonia (tier-1 synthesizer outputs); CeramicPlates (tier-2)
- `converter_basic` building (3x3) with 4 recipes transforming base resources into tier-1 refined outputs
- `synthesizer_basic` building (4x4) with 5 recipes combining 2 inputs into tier-1/2 synthesized outputs
- 4 procedural scenario generators: `tier-simple`, `tier-medium`, `tier-complex`, `tier-build-all`
- HUD and storage panel display all 12 resources with sprite, name and count
- Storage panel shows resources as a card grid with sprite and live count
- Resource tile selection: clicking a deposit in select mode shows an anchored tooltip; Escape dismisses it

---

## [0.0.0.1] - 2026-04-16

### Added

- Numerical scenario test suite (43 tests) verifying engine economics: extraction rates, energy balance, battery charge/discharge, day/night solar production, integrated economy scenarios, edge case invariants, and full-cycle numerical verification

### Changed

- Reworked converter and synthesizer logistics to consume only from connected upstream chains instead of `playerStock`
- Added storage inventories, producer output buffers, processor reservations, and bad-input/error UI state for connected processors
- Rebuilt starter and build-all scenarios around literal storage sinks and dedicated production chains; bumped world snapshot compatibility to version 3
