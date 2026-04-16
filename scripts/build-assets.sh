#!/bin/sh
set -eu

mkdir -p public/assets/tiles public/assets/icons public/assets/cards
mkdir -p public/assets/fallbacks

cat > public/assets/README.md <<'EOF'
# Whitepod Assets

Generated assets live here as individual files plus a manifest:
- `tiles/`
- `icons/`
- `cards/`
- `fallbacks/`
- `manifest.json`
- `build-report.json`
EOF

node scripts/extract-resources.mjs
node scripts/generate-asset-prompts.mjs
node scripts/generate-images.mjs
node scripts/validate-assets.mjs public/assets/manifest.json

RESOURCE_COUNT=$(wc -l < docs/resource-list.txt)
PROMPT_COUNT=$(wc -l < prompts/generated-asset-prompts.jsonl)
ASSET_COUNT=$(node -e "const fs=require('fs'); const p='public/assets/manifest.json'; const data=JSON.parse(fs.readFileSync(p,'utf8')); process.stdout.write(String(data.assets.length));" 2>/dev/null || printf '0')

printf 'Resources: %s\n' "$RESOURCE_COUNT"
printf 'Prompts: %s\n' "$PROMPT_COUNT"
printf 'Assets: %s\n' "$ASSET_COUNT"
