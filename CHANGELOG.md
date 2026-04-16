# Changelog

All notable changes to Whitepod will be documented in this file.

## [0.0.0.1] - 2026-04-16

### Added

- Numerical scenario test suite (43 tests) verifying engine economics: extraction rates, energy balance, battery charge/discharge, day/night solar production, integrated economy scenarios, edge case invariants, and full-cycle numerical verification

### Changed

- Reworked converter and synthesizer logistics to consume only from connected upstream chains instead of `playerStock`
- Added storage inventories, producer output buffers, processor reservations, and bad-input/error UI state for connected processors
- Rebuilt starter and build-all scenarios around literal storage sinks and dedicated production chains; bumped world snapshot compatibility to version 3
