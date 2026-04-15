#!/bin/sh
set -eu

mkdir -p public/assets/tiles public/assets/icons public/assets/cards
mkdir -p public/assets/ui

node scripts/extract-resources.mjs
node scripts/generate-asset-prompts.mjs
node scripts/generate-images.mjs

RESOURCE_COUNT=$(wc -l < docs/resource-list.txt)
PROMPT_COUNT=$(wc -l < prompts/generated-asset-prompts.jsonl)

printf 'Resources: %s\n' "$RESOURCE_COUNT"
printf 'Prompts: %s\n' "$PROMPT_COUNT"
