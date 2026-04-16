# Whitepod Assets

Generated assets live here as copied source images plus a manifest:
- `raw/` contains copied files from `output/whitepod-assets/`
- `manifest.json` maps runtime ids to those files
- `build-report.json` summarizes the last build

Runtime contract:
- `raw/` is the only file source used by the app at runtime
- missing textures fall back to the `fallback_*` files in `raw/`
