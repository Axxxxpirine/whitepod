#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = process.cwd()
const input = process.argv[2] || path.join(REPO_ROOT, 'prompts', 'generated-asset-prompts.jsonl')
const outputDir = process.argv[3] || path.join(REPO_ROOT, 'public', 'assets')

const provider = process.env.ASSET_IMAGE_PROVIDER || 'placeholder'
const concurrency = Number.parseInt(process.env.ASSET_IMAGE_CONCURRENCY || '4', 10)

mkdirSync(outputDir, { recursive: true })

const lines = readFileSync(input, 'utf8')
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)

const entries = lines.map(line => JSON.parse(line))
const manifest = []
const schemaVersion = 1
const families = {
  resource: 'resource',
  station: 'station',
  fallback: 'fallback',
}

function getFamily(id) {
  if (id.startsWith('fallback_')) return 'fallback'
  if (['extractor', 'conveyor', 'factory', 'storage'].some(prefix => id.startsWith(`${prefix}_`))) return 'station'
  if (id.endsWith('_tile') || id.endsWith('_icon') || id.endsWith('_card')) return 'resource'
  return 'unknown'
}

function getKind(id) {
  if (id.endsWith('_tile')) return 'tile'
  if (id.endsWith('_icon')) return 'icon'
  if (id.endsWith('_card')) return 'card'
  if (id.startsWith('fallback_')) return 'fallback'
  return 'unknown'
}

function renderPlaceholderPng(filePath, label) {
  const digest = createHash('sha256').update(label).digest('hex')
  const body = `placeholder:${label}:${digest}`
  writeFileSync(filePath, body)
}

function ensureFallback(filePath, label) {
  if (existsSync(filePath)) return
  renderPlaceholderPng(filePath, label)
}

async function main() {
  for (const entry of entries) {
    const kind = getKind(entry.id)
    const family = getFamily(entry.id)
    const baseId = entry.id.startsWith('fallback_') ? entry.id : entry.id.replace(/_(tile|icon|card)$/, '')
    const dir = kind === 'fallback' ? path.join(outputDir, 'fallbacks') : path.join(outputDir, `${kind}s`)
    mkdirSync(dir, { recursive: true })
    const filePath = path.join(dir, `${entry.id}.png`)
    if (!existsSync(filePath)) {
      renderPlaceholderPng(filePath, `${provider}:${entry.id}`)
    }
    manifest.push({
      id: entry.id,
      kind,
      family,
      baseId,
      src: kind === 'fallback' ? `/assets/fallbacks/${entry.id}.png` : `/assets/${kind}s/${entry.id}.png`,
      frameWidth: entry.parameters?.width ?? 0,
      frameHeight: entry.parameters?.height ?? 0,
      columns: kind === 'tile' ? 4 : 1,
      rows: kind === 'tile' ? 4 : 1,
      animation: kind === 'tile' ? 'loop' : 'static',
      fallbackId:
        kind === 'fallback'
          ? entry.id
          : family === 'station'
          ? `fallback_station`
          : kind === 'tile'
            ? 'fallback_resource'
            : kind === 'icon'
              ? 'fallback_icon'
              : 'fallback_card',
      schemaVersion,
    })
  }

  const fallbackDir = path.join(outputDir, 'fallbacks')
  mkdirSync(fallbackDir, { recursive: true })
  for (const fallback of ['resource', 'station', 'icon', 'card']) {
    ensureFallback(path.join(fallbackDir, `fallback_${fallback}.png`), `${provider}:fallback_${fallback}`)
  }

  writeFileSync(
    path.join(outputDir, 'manifest.json'),
    `${JSON.stringify({ schemaVersion, provider, concurrency, assetCount: manifest.length, assets: manifest }, null, 2)}\n`,
  )
  writeFileSync(
    path.join(outputDir, 'build-report.json'),
    `${JSON.stringify({ schemaVersion, generated: manifest.length, failed: 0, fallbackUsed: 0 }, null, 2)}\n`,
  )
  console.log(`Generated ${manifest.length} assets -> ${outputDir}`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
