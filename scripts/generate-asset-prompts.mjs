#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'

const input = process.argv[2] || './docs/resource-list.txt'
const output = process.argv[3] || './prompts/generated-asset-prompts.jsonl'

const resources = readFileSync(input, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)

const stationFamilies = ['extractor', 'conveyor', 'factory', 'storage']
const prompts = []

function pushPrompt(id, prompt, parameters) {
  prompts.push({ id, prompt, parameters })
}

for (const resource of resources) {
  pushPrompt(
    `${resource}_tile`,
    `Sprite sheet of animation frames, top-down 2D pixel art tile for ${resource}, industrial lunar factory theme, clean cyberpunk neon, gritty textures, 4x4 frames, subtle micro-motion, only a few pixels change between frames, perfect seamless animation loop where the last sprite exactly matches the first.`,
    { seed: 42, steps: 24, format: 'png', width: 256, height: 256 },
  )

  pushPrompt(
    `${resource}_icon`,
    `Static pixel art UI icon for ${resource}, 64x64, industrial lunar factory theme, dark background, clean cyberpunk neon, crisp readable silhouette, no animation.`,
    { seed: 42, steps: 24, format: 'png', width: 64, height: 64 },
  )

  pushPrompt(
    `${resource}_card`,
    `Static pixel art card illustration for ${resource}, lunar factory scene, industrial textures, clean cyberpunk neon, strong readable composition, no animation.`,
    { seed: 42, steps: 24, format: 'png', width: 512, height: 512 },
  )
}

for (const family of stationFamilies) {
  pushPrompt(
    `${family}_tile`,
    `Sprite sheet of animation frames, top-down 2D pixel art station tile for ${family}, industrial lunar factory theme, clean cyberpunk neon, gritty machine details, 4x4 frames, subtle idle lights, only a few pixels change between frames, perfect seamless animation loop where the last sprite exactly matches the first.`,
    { seed: 42, steps: 24, format: 'png', width: 256, height: 256 },
  )

  pushPrompt(
    `${family}_icon`,
    `Static pixel art UI icon for ${family} station, 64x64, industrial lunar factory theme, dark background, clean cyberpunk neon, crisp readable silhouette, no animation.`,
    { seed: 42, steps: 24, format: 'png', width: 64, height: 64 },
  )

  pushPrompt(
    `${family}_card`,
    `Static pixel art card illustration for ${family} station, lunar factory scene, industrial machine geometry, clean cyberpunk neon, no animation.`,
    { seed: 42, steps: 24, format: 'png', width: 512, height: 512 },
  )
}

for (const fallback of ['resource', 'station', 'icon', 'card']) {
  pushPrompt(
    `fallback_${fallback}`,
    `Static pixel art fallback asset for ${fallback}, industrial lunar factory theme, simple highly readable composition, neutral colors, no animation.`,
    { seed: 42, steps: 12, format: 'png', width: 256, height: 256 },
  )
}

writeFileSync(output, `${prompts.map(prompt => JSON.stringify(prompt)).join('\n')}\n`)
console.log(`Generated ${prompts.length} prompts -> ${output}`)
