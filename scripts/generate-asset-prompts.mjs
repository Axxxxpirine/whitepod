#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'

const input = process.argv[2] || './docs/resource-list.txt'
const output = process.argv[3] || './prompts/generated-asset-prompts.jsonl'

const resources = readFileSync(input, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)

const uiAssets = [
  'panel',
  'panel-strong',
  'button',
  'button-primary',
  'button-danger',
  'badge',
  'chip',
  'metric',
  'input',
  'select',
  'viewport-frame',
  'token-card',
  'resource-pill',
  'scroll-track',
  'scroll-thumb',
  'toolbar',
  'section-header',
  'icon-play',
  'icon-pause',
  'icon-reset',
  'icon-zoom-in',
  'icon-zoom-out',
  'icon-trash',
  'icon-info',
  'icon-gear',
]

const prompts = []

for (const resource of resources) {
  prompts.push({
    id: `${resource}_tile`,
    prompt: `Sprite sheet of animation frames, top-down 2D pixel art grid tile for Whitepod, lunar factory resource ${resource}, chunky industrial silhouette, muted steel and neon accent palette, inspired by the provided Whitepod asset sheet, subtle mechanical motion, only a few pixels change between frames, perfect seamless animation loop where the last sprite exactly matches the first.`,
    parameters: { seed: 42, steps: 30, format: 'png', width: 256, height: 256 },
  })

  prompts.push({
    id: `${resource}_icon`,
    prompt: `Sprite sheet of animation frames, 64x64 pixel art UI icon for Whitepod, resource ${resource}, isometric industrial badge, clean dark background, neon cyan/green/orange highlights, inspired by the provided Whitepod asset sheet, subtle idle animation, only a few pixels change between frames, perfect seamless animation loop where the last sprite exactly matches the first.`,
    parameters: { seed: 42, steps: 30, format: 'png', width: 256, height: 256 },
  })

  prompts.push({
    id: `${resource}_card`,
    prompt: `Sprite sheet animation sequence, pixel art card illustration for Whitepod, lunar factory scene featuring ${resource}, layered industrial machinery, compact sci-fi management-game framing, muted steel surfaces with neon accents, inspired by the provided Whitepod asset sheet, very slow subtle background movement, only a few pixels change between frames, perfect seamless animation loop where the last sprite exactly matches the first.`,
    parameters: { seed: 42, steps: 30, format: 'png', width: 512, height: 512 },
  })
}

for (const asset of uiAssets) {
  const isIcon = asset.startsWith('icon-')
  prompts.push({
    id: asset,
    prompt: `Sprite sheet of animation frames, pixel art UI asset for Whitepod, ${asset.replace(/-/g, ' ')}, dark industrial HUD styling, clean cyberpunk neon combined with gritty industrial textures, inspired by the provided Whitepod asset sheet, subtle idle motion or glow pulse, only a few pixels change between frames, perfect seamless animation loop where the last sprite exactly matches the first.`,
    parameters: { seed: 42, steps: 24, format: 'png', width: isIcon ? 128 : 256, height: isIcon ? 128 : 256 },
  })
}

writeFileSync(output, `${prompts.map(prompt => JSON.stringify(prompt)).join('\n')}\n`)
console.log(`Generated ${prompts.length} prompts -> ${output}`)
