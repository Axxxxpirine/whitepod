#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'

const input = process.argv[2] || './docs/resource-list.txt'
const output = process.argv[3] || './prompts/generated-asset-prompts.jsonl'

const resources = readFileSync(input, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)

const prompts = []

for (const resource of resources) {
  prompts.push({
    id: `${resource}_tile`,
    prompt: `Top-down pixel art sprite sheet for ${resource}, industrial lunar factory theme, 4x4 animation frames, subtle mechanical motion, seamless loop.`,
    parameters: { seed: 42, steps: 30, format: 'png', width: 256, height: 256 },
  })

  prompts.push({
    id: `${resource}_icon`,
    prompt: `Pixel art UI icon for ${resource}, 64x64 style, dark background, clean industrial neon, subtle idle animation, seamless loop.`,
    parameters: { seed: 42, steps: 30, format: 'png', width: 256, height: 256 },
  })

  prompts.push({
    id: `${resource}_card`,
    prompt: `Pixel art illustrated card for ${resource}, lunar factory scene, industrial textures, subtle background motion, seamless loop.`,
    parameters: { seed: 42, steps: 30, format: 'png', width: 512, height: 512 },
  })
}

writeFileSync(output, `${prompts.map(prompt => JSON.stringify(prompt)).join('\n')}\n`)
console.log(`Generated ${prompts.length} prompts -> ${output}`)
