#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const manifestPath = path.resolve(process.argv[2] || './public/assets/manifest.json')
const root = process.cwd()

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const assets = manifest.assets ?? []
const missing = []
const ids = new Set()

if (manifest.schemaVersion !== 1) missing.push('schemaVersion')
if (typeof manifest.provider !== 'string' || !manifest.provider) missing.push('provider')
if (!Number.isInteger(manifest.concurrency) || manifest.concurrency < 1) missing.push('concurrency')
if (!Number.isInteger(manifest.assetCount) || manifest.assetCount !== assets.length) missing.push('assetCount')

for (const asset of assets) {
  if (ids.has(asset.id)) missing.push(`duplicate:${asset.id}`)
  ids.add(asset.id)

  if (typeof asset.baseId !== 'string' || !asset.baseId) missing.push(`baseId:${asset.id}`)
  if (!['tile', 'icon', 'card', 'fallback'].includes(asset.kind)) missing.push(`kind:${asset.id}`)
  if (!['resource', 'station', 'fallback'].includes(asset.family)) missing.push(`family:${asset.id}`)
  if (asset.kind === 'tile' && (asset.columns !== 4 || asset.rows !== 4)) missing.push(`tile-grid:${asset.id}`)
  if (asset.kind !== 'tile' && (asset.columns !== 1 || asset.rows !== 1)) missing.push(`sprite-grid:${asset.id}`)
  if (asset.kind === 'tile' && asset.animation !== 'loop') missing.push(`animation:${asset.id}`)
  if (asset.kind !== 'tile' && asset.animation !== 'static') missing.push(`animation:${asset.id}`)
  if (!Number.isInteger(asset.schemaVersion) || asset.schemaVersion !== 1) missing.push(`schemaVersion:${asset.id}`)
  if (typeof asset.fallbackId !== 'string' || !asset.fallbackId.startsWith('fallback_')) missing.push(`fallbackId:${asset.id}`)

  const filePath = path.join(root, 'public', asset.src.replace(/^\//, ''))
  if (!existsSync(filePath)) missing.push(asset.id)
}

if (missing.length > 0) {
  console.error(JSON.stringify({ ok: false, missing }, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ ok: true, assets: assets.length }, null, 2))
}
