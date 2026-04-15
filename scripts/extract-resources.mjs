#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'

const input = process.argv[2] || './public/data/lunar-chemistry.metadata.json'
const output = process.argv[3] || './docs/resource-list.txt'

const data = JSON.parse(readFileSync(input, 'utf8'))
const resources = new Set()

for (const place of data.canonical?.places || []) {
  if (place.kind === 'control') continue
  if (!place.id) continue
  resources.add(place.id)
}

const filtered = [...resources].filter(resource => !['start', 'run', 'done'].includes(resource)).sort()

writeFileSync(output, `${filtered.join('\n')}\n`)
console.log(`Extracted ${filtered.length} resources -> ${output}`)
