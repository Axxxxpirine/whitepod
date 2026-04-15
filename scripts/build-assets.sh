#!/bin/sh
set -eu

mkdir -p public/assets/tiles public/assets/icons public/assets/cards

cat > public/assets/README.md <<'EOF'
# Whitepod Assets

Generated assets live here:
- `tiles/`
- `icons/`
- `cards/`
EOF

node scripts/extract-resources.mjs
node scripts/generate-asset-prompts.mjs

RESOURCE_COUNT=$(wc -l < docs/resource-list.txt)
PROMPT_COUNT=$(wc -l < prompts/generated-asset-prompts.jsonl)

printf 'Resources: %s\n' "$RESOURCE_COUNT"
printf 'Prompts: %s\n' "$PROMPT_COUNT"
