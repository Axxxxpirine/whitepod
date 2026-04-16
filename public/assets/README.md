# Whitepod Assets

Generated assets live here as individual files plus a manifest:
- `tiles/`
- `icons/`
- `cards/`
- `fallbacks/`
- `manifest.json`
- `build-report.json`

Contract:
- all runtime textures are referenced by `manifest.json`
- `icons` and `cards` are static
- `tiles` are 4x4 placeholder sprite sheets for phase 5 integration
- missing assets fall back to the official `fallback_*` files
