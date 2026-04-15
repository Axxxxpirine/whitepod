#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const outputRoot = './public/assets'
const metadataPath = './public/data/lunar-chemistry.metadata.json'
const sourceSheet = './public/assets.png'

const metadata = JSON.parse(readFileSync(metadataPath, 'utf8'))
const places = metadata.canonical?.places ?? []

const resources = places
  .filter(place => place.kind !== 'control')
  .map(place => ({
    id: place.id,
    tier: place.tier ?? 0,
    nameFr: place.name_fr ?? place.id,
  }))
  .sort((a, b) => a.id.localeCompare(b.id))

const uiAssets = [
  { id: 'panel', kind: 'frame', label: 'Panel' },
  { id: 'panel-strong', kind: 'frame', label: 'Panel Strong' },
  { id: 'button', kind: 'button', label: 'Button' },
  { id: 'button-primary', kind: 'button', label: 'Primary Button' },
  { id: 'button-danger', kind: 'button', label: 'Danger Button' },
  { id: 'badge', kind: 'pill', label: 'Badge' },
  { id: 'chip', kind: 'chip', label: 'Chip' },
  { id: 'metric', kind: 'metric', label: 'Metric' },
  { id: 'input', kind: 'field', label: 'Input' },
  { id: 'select', kind: 'field', label: 'Select' },
  { id: 'viewport-frame', kind: 'viewport', label: 'Viewport' },
  { id: 'token-card', kind: 'card', label: 'Token Card' },
  { id: 'resource-pill', kind: 'pill', label: 'Resource Pill' },
  { id: 'scroll-track', kind: 'scroll', label: 'Scroll Track' },
  { id: 'scroll-thumb', kind: 'scroll', label: 'Scroll Thumb' },
  { id: 'toolbar', kind: 'toolbar', label: 'Toolbar' },
  { id: 'section-header', kind: 'header', label: 'Section Header' },
  { id: 'icon-play', kind: 'icon', label: 'Play' },
  { id: 'icon-pause', kind: 'icon', label: 'Pause' },
  { id: 'icon-reset', kind: 'icon', label: 'Reset' },
  { id: 'icon-zoom-in', kind: 'icon', label: 'Zoom In' },
  { id: 'icon-zoom-out', kind: 'icon', label: 'Zoom Out' },
  { id: 'icon-trash', kind: 'icon', label: 'Trash' },
  { id: 'icon-info', kind: 'icon', label: 'Info' },
  { id: 'icon-gear', kind: 'icon', label: 'Gear' },
]

const styleGuide = {
  sourceSheet,
  palette: {
    backdrop: '#071018',
    panel: '#111926',
    panelStrong: '#171f2d',
    steel: '#cdd6df',
    steelDark: '#66717d',
    cyan: '#63d9ff',
    green: '#7de27b',
    amber: '#ffb15c',
    violet: '#c38cff',
    ink: '#121820',
    inkSoft: '#1b2430',
    line: '#243141',
    lineSoft: '#3a4c63',
    glow: 'rgba(99, 217, 255, 0.22)',
  },
  notes: [
    'Use chunky outlines and beveled faces.',
    'Keep the palette muted with cyan, green, amber and violet accents.',
    'Prefer isometric or slightly top-down industrial forms.',
    'UI assets should feel like diegetic control-room hardware.',
  ],
}

function ensureDirFor(filePath) {
  mkdirSync(dirname(filePath), { recursive: true })
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function svg(width, height, body, defs = '') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${styleGuide.palette.panelStrong}"/>
      <stop offset="100%" stop-color="${styleGuide.palette.panel}"/>
    </linearGradient>
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${styleGuide.palette.steel}"/>
      <stop offset="100%" stop-color="${styleGuide.palette.steelDark}"/>
    </linearGradient>
    <linearGradient id="darkSteel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${styleGuide.palette.inkSoft}"/>
      <stop offset="100%" stop-color="${styleGuide.palette.ink}"/>
    </linearGradient>
    <linearGradient id="cyanGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${styleGuide.palette.cyan}" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#2e8cff" stop-opacity="0.82"/>
    </linearGradient>
    <linearGradient id="greenGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${styleGuide.palette.green}" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#2fbf7d" stop-opacity="0.82"/>
    </linearGradient>
    <linearGradient id="amberGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${styleGuide.palette.amber}" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#f07b27" stop-opacity="0.82"/>
    </linearGradient>
    <linearGradient id="violetGlow" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${styleGuide.palette.violet}" stop-opacity="0.96"/>
      <stop offset="100%" stop-color="#8852ff" stop-opacity="0.82"/>
    </linearGradient>
    ${defs}
  </defs>
  ${body}
</svg>
`
}

function hash(value) {
  let result = 0
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0
  }
  return result
}

function tierColor(tier) {
  switch (tier) {
    case 0:
      return 'url(#cyanGlow)'
    case 1:
      return 'url(#greenGlow)'
    case 2:
      return 'url(#amberGlow)'
    default:
      return 'url(#violetGlow)'
  }
}

function accentColor(resourceId) {
  const hue = hash(resourceId) % 4
  return ['url(#cyanGlow)', 'url(#greenGlow)', 'url(#amberGlow)', 'url(#violetGlow)'][hue]
}

function resourceCategory(resourceId) {
  if (/(helium|hydrogen|oxygen|ammonia|methane|nitrogen|gas|dioxide|liquid)/.test(resourceId)) return 'fluid'
  if (/(regolith|oxide|graphite|iron|aluminum|carbon_fiber|ceramic|plastic|batteries|pellets|plates|bars)/.test(resourceId)) return 'solid'
  if (/(tank|pump|valve|injector|nozzle|chamber|fuel|shield|rocket|module|computer|antenna|system|landing|navigation|instrumentation|container|doors|gaskets|hatch|support)/.test(resourceId)) return 'machine'
  return 'component'
}

function resourceGlyph(resourceId, tier, size = 1) {
  const category = resourceCategory(resourceId)
  const fill = tierColor(tier)
  const stroke = '#0c1017'

  if (category === 'fluid') {
    return `
      <g transform="scale(${size})">
        <path d="M0 -34C10 -20 24 -3 24 14C24 27 13 38 0 38C-13 38 -24 27 -24 14C-24 -3 -10 -20 0 -34Z" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
        <circle cx="-10" cy="10" r="4" fill="#ffffff" fill-opacity="0.34"/>
        <circle cx="9" cy="-2" r="3" fill="#ffffff" fill-opacity="0.18"/>
      </g>
    `
  }

  if (category === 'solid') {
    return `
      <g transform="scale(${size})">
        <path d="M-28 16L-10 -20H18L34 8L14 30H-12Z" fill="${fill}" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M-10 -20L2 6L-12 30" stroke="#ffffff" stroke-opacity="0.22" stroke-width="4" stroke-linecap="round"/>
        <path d="M18 -20L34 8" stroke="#ffffff" stroke-opacity="0.2" stroke-width="4" stroke-linecap="round"/>
      </g>
    `
  }

  if (category === 'machine') {
    return `
      <g transform="scale(${size})">
        <rect x="-24" y="-24" width="48" height="48" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
        <rect x="-15" y="-15" width="30" height="18" rx="4" fill="#0e1722" fill-opacity="0.62"/>
        <path d="M-15 10H15" stroke="#ffffff" stroke-opacity="0.24" stroke-width="4" stroke-linecap="round"/>
        <path d="M-8 20L-8 30M0 20L0 30M8 20L8 30" stroke="#ffffff" stroke-opacity="0.18" stroke-width="4" stroke-linecap="round"/>
      </g>
    `
  }

  return `
    <g transform="scale(${size})">
      <circle cx="0" cy="0" r="28" fill="${fill}" stroke="${stroke}" stroke-width="4"/>
      <path d="M-16 10L0 -18L16 10Z" fill="#0e1722" fill-opacity="0.24"/>
    </g>
  `
}

function resourceTileSvg(resource) {
  const accent = accentColor(resource.id)
  const background = resourceCategory(resource.id) === 'machine' ? 'darkSteel' : 'bg'

  return svg(256, 256, `
    <rect width="256" height="256" fill="${styleGuide.palette.backdrop}"/>
    <rect x="18" y="18" width="220" height="220" rx="28" fill="url(#${background})" stroke="${styleGuide.palette.line}" stroke-width="4"/>
    <path d="M128 34L214 92V164L128 222L42 164V92Z" fill="#1a2531" stroke="${styleGuide.palette.lineSoft}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M128 58L194 101V155L128 198L62 155V101Z" fill="#0f1620" fill-opacity="0.78" stroke="#3c4e63" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M128 72L182 107V149L128 184L74 149V107Z" fill="#0a1118" fill-opacity="0.65" stroke="#5b7087" stroke-opacity="0.32" stroke-width="2" stroke-linejoin="round"/>
    <path d="M52 164L128 214L204 164" stroke="${styleGuide.palette.lineSoft}" stroke-width="4" stroke-linecap="round"/>
    <path d="M52 92L128 42L204 92" stroke="#425467" stroke-opacity="0.85" stroke-width="4" stroke-linecap="round"/>
    <g transform="translate(128 130)">
      ${resourceGlyph(resource.id, resource.tier, 1.1)}
    </g>
    <circle cx="72" cy="88" r="4" fill="${accent}"/>
    <circle cx="184" cy="168" r="4" fill="${accent}"/>
    <circle cx="168" cy="82" r="3" fill="${styleGuide.palette.cyan}" fill-opacity="0.8"/>
    <circle cx="86" cy="172" r="3" fill="${styleGuide.palette.green}" fill-opacity="0.8"/>
  `)
}

function resourceIconSvg(resource) {
  return svg(128, 128, `
    <rect width="128" height="128" rx="24" fill="${styleGuide.palette.backdrop}"/>
    <rect x="10" y="10" width="108" height="108" rx="20" fill="#141c27" stroke="${styleGuide.palette.line}" stroke-width="4"/>
    <path d="M64 24L96 44V84L64 104L32 84V44Z" fill="#202d3b" stroke="${styleGuide.palette.lineSoft}" stroke-width="3"/>
    <g transform="translate(64 64)">
      ${resourceGlyph(resource.id, resource.tier, 0.72)}
    </g>
    <path d="M34 44L64 28L94 44" stroke="${styleGuide.palette.lineSoft}" stroke-width="3" stroke-linecap="round"/>
    <path d="M34 84L64 100L94 84" stroke="#50657f" stroke-width="3" stroke-linecap="round"/>
  `)
}

function resourceCardSvg(resource) {
  const accent = accentColor(resource.id)
  return svg(512, 512, `
    <rect width="512" height="512" fill="${styleGuide.palette.backdrop}"/>
    <rect x="24" y="24" width="464" height="464" rx="36" fill="url(#bg)" stroke="${styleGuide.palette.line}" stroke-width="4"/>
    <path d="M64 130H448" stroke="#223041" stroke-width="2" stroke-dasharray="6 10" opacity="0.9"/>
    <path d="M64 382H448" stroke="#223041" stroke-width="2" stroke-dasharray="6 10" opacity="0.9"/>
    <path d="M96 160L160 116H352L416 160V352L352 396H160L96 352Z" fill="#182231" stroke="#43566d" stroke-width="4" stroke-linejoin="round"/>
    <path d="M128 176L180 140H332L384 176V336L332 372H180L128 336Z" fill="#0f1722" fill-opacity="0.9" stroke="#556a83" stroke-width="3" stroke-linejoin="round"/>
    <path d="M164 200H348" stroke="${accent}" stroke-width="8" stroke-linecap="round" opacity="0.82"/>
    <path d="M164 304H348" stroke="${styleGuide.palette.steel}" stroke-width="6" stroke-linecap="round" opacity="0.22"/>
    <g transform="translate(256 260)">
      ${resourceGlyph(resource.id, resource.tier, 2.0)}
    </g>
    <circle cx="146" cy="188" r="6" fill="${styleGuide.palette.cyan}"/>
    <circle cx="366" cy="324" r="6" fill="${styleGuide.palette.green}"/>
    <circle cx="256" cy="104" r="7" fill="${styleGuide.palette.amber}"/>
    <path d="M112 412C168 384 344 384 400 412" stroke="${styleGuide.palette.lineSoft}" stroke-width="4" stroke-linecap="round"/>
  `)
}

function uiFrameSvg(asset) {
  const fill = asset.id.includes('strong') ? 'url(#bg)' : 'rgba(255,255,255,0.05)'
  const accent = asset.id.includes('danger') ? styleGuide.palette.amber : asset.id.includes('primary') ? styleGuide.palette.green : styleGuide.palette.cyan

  return svg(256, 96, `
    <rect width="256" height="96" rx="20" fill="${styleGuide.palette.backdrop}"/>
    <rect x="8" y="8" width="240" height="80" rx="16" fill="${fill}" stroke="${styleGuide.palette.line}" stroke-width="3"/>
    <rect x="20" y="18" width="216" height="60" rx="12" fill="${asset.kind === 'button' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)'}" stroke="${styleGuide.palette.lineSoft}" stroke-width="2"/>
    <path d="M34 24H222" stroke="${accent}" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
    <path d="M34 72H222" stroke="#ffffff" stroke-opacity="0.1" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 7"/>
    <circle cx="54" cy="48" r="8" fill="${accent}" opacity="0.85"/>
    <path d="M170 34H210M170 48H210M170 62H210" stroke="#d9e4f0" stroke-opacity="0.24" stroke-width="4" stroke-linecap="round"/>
    <path d="M34 24L52 24" stroke="#ffffff" stroke-opacity="0.2" stroke-width="3" stroke-linecap="round"/>
  `)
}

function uiPillSvg(asset) {
  const accent = asset.id.includes('resource') ? styleGuide.palette.green : styleGuide.palette.cyan
  return svg(256, 80, `
    <rect width="256" height="80" rx="40" fill="${styleGuide.palette.backdrop}"/>
    <rect x="8" y="8" width="240" height="64" rx="32" fill="rgba(255,255,255,0.05)" stroke="${styleGuide.palette.line}" stroke-width="3"/>
    <path d="M34 20H222" stroke="${accent}" stroke-width="4" stroke-linecap="round" opacity="0.82"/>
    <circle cx="54" cy="40" r="14" fill="${accent}"/>
    <path d="M166 28H214M166 40H214M166 52H214" stroke="#d7e3ef" stroke-opacity="0.3" stroke-width="4" stroke-linecap="round"/>
  `)
}

function uiChipSvg() {
  return svg(256, 96, `
    <rect width="256" height="96" rx="18" fill="${styleGuide.palette.backdrop}"/>
    <rect x="10" y="16" width="236" height="64" rx="16" fill="rgba(255,255,255,0.05)" stroke="${styleGuide.palette.line}" stroke-width="3"/>
    <rect x="22" y="28" width="88" height="40" rx="12" fill="rgba(52,211,153,0.13)" stroke="rgba(125,226,123,0.6)" stroke-width="2"/>
    <path d="M128 46H222" stroke="${styleGuide.palette.steel}" stroke-opacity="0.22" stroke-width="4" stroke-linecap="round"/>
    <path d="M142 34H192M142 46H204M142 58H182" stroke="#d8e4ef" stroke-opacity="0.28" stroke-width="3.5" stroke-linecap="round"/>
  `)
}

function uiMetricSvg() {
  return svg(256, 96, `
    <rect width="256" height="96" rx="18" fill="${styleGuide.palette.backdrop}"/>
    <rect x="10" y="10" width="236" height="76" rx="16" fill="url(#bg)" stroke="${styleGuide.palette.line}" stroke-width="3"/>
    <rect x="22" y="22" width="46" height="52" rx="12" fill="rgba(99,217,255,0.14)" stroke="${styleGuide.palette.cyan}" stroke-width="2"/>
    <path d="M88 30H214M88 46H180M88 62H200" stroke="#d8e4ef" stroke-opacity="0.3" stroke-width="4" stroke-linecap="round"/>
  `)
}

function uiFieldSvg(asset) {
  const accent = asset.id === 'select' ? styleGuide.palette.amber : styleGuide.palette.cyan
  return svg(256, 96, `
    <rect width="256" height="96" rx="18" fill="${styleGuide.palette.backdrop}"/>
    <rect x="10" y="14" width="236" height="68" rx="14" fill="rgba(255,255,255,0.04)" stroke="${styleGuide.palette.line}" stroke-width="3"/>
    <path d="M24 28H198" stroke="${accent}" stroke-width="4" stroke-linecap="round" opacity="0.85"/>
    <rect x="24" y="44" width="152" height="16" rx="8" fill="rgba(255,255,255,0.08)"/>
    <path d="M214 34L224 44L214 54" stroke="${accent}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  `)
}

function uiViewportSvg() {
  return svg(320, 180, `
    <rect width="320" height="180" rx="26" fill="${styleGuide.palette.backdrop}"/>
    <rect x="10" y="10" width="300" height="160" rx="20" fill="#121b27" stroke="${styleGuide.palette.line}" stroke-width="3"/>
    <path d="M24 38H296M24 142H296" stroke="#2a3747" stroke-width="2" stroke-dasharray="6 10" opacity="0.9"/>
    <path d="M52 24V48M52 132V156M268 24V48M268 132V156" stroke="${styleGuide.palette.lineSoft}" stroke-width="3" stroke-linecap="round"/>
    <rect x="66" y="54" width="188" height="72" rx="16" fill="rgba(99,217,255,0.06)" stroke="rgba(99,217,255,0.18)" stroke-width="2"/>
  `)
}

function uiScrollSvg(kind) {
  if (kind === 'scroll-thumb') {
    return svg(96, 256, `
      <rect width="96" height="256" rx="40" fill="${styleGuide.palette.backdrop}"/>
      <rect x="30" y="18" width="36" height="220" rx="18" fill="rgba(255,255,255,0.06)" stroke="${styleGuide.palette.line}" stroke-width="3"/>
      <rect x="32" y="86" width="32" height="84" rx="16" fill="rgba(52,211,153,0.18)" stroke="rgba(125,226,123,0.7)" stroke-width="2"/>
    `)
  }

  return svg(96, 256, `
    <rect width="96" height="256" rx="40" fill="${styleGuide.palette.backdrop}"/>
    <rect x="36" y="18" width="24" height="220" rx="12" fill="rgba(255,255,255,0.05)" stroke="${styleGuide.palette.line}" stroke-width="3"/>
    <path d="M36 52H60M36 204H60" stroke="${styleGuide.palette.cyan}" stroke-width="3" stroke-linecap="round" opacity="0.8"/>
  `)
}

function uiToolbarSvg() {
  return svg(320, 120, `
    <rect width="320" height="120" rx="22" fill="${styleGuide.palette.backdrop}"/>
    <rect x="10" y="12" width="300" height="96" rx="18" fill="rgba(255,255,255,0.04)" stroke="${styleGuide.palette.line}" stroke-width="3"/>
    <path d="M30 30H290" stroke="${styleGuide.palette.cyan}" stroke-width="4" stroke-linecap="round"/>
    <rect x="30" y="50" width="54" height="36" rx="10" fill="rgba(99,217,255,0.12)"/>
    <rect x="92" y="50" width="54" height="36" rx="10" fill="rgba(125,226,123,0.12)"/>
    <rect x="154" y="50" width="54" height="36" rx="10" fill="rgba(255,177,92,0.12)"/>
    <rect x="216" y="50" width="54" height="36" rx="10" fill="rgba(195,140,255,0.12)"/>
  `)
}

function uiHeaderSvg() {
  return svg(320, 96, `
    <rect width="320" height="96" rx="18" fill="${styleGuide.palette.backdrop}"/>
    <rect x="10" y="10" width="300" height="76" rx="16" fill="url(#bg)" stroke="${styleGuide.palette.line}" stroke-width="3"/>
    <path d="M26 28H294" stroke="${styleGuide.palette.cyan}" stroke-width="4" stroke-linecap="round" opacity="0.86"/>
    <path d="M26 68H238" stroke="#ffffff" stroke-opacity="0.16" stroke-width="2" stroke-linecap="round" stroke-dasharray="5 7"/>
  `)
}

function iconGlyphSvg(kind) {
  switch (kind) {
    case 'icon-play':
      return '<path d="M48 34L82 58L48 82Z" fill="url(#greenGlow)" stroke="#0c1017" stroke-width="4" stroke-linejoin="round"/>'
    case 'icon-pause':
      return '<rect x="40" y="32" width="14" height="40" rx="5" fill="url(#cyanGlow)" stroke="#0c1017" stroke-width="4"/><rect x="70" y="32" width="14" height="40" rx="5" fill="url(#cyanGlow)" stroke="#0c1017" stroke-width="4"/>'
    case 'icon-reset':
      return '<path d="M82 54A30 30 0 1 1 66 30" stroke="url(#amberGlow)" stroke-width="8" stroke-linecap="round"/><path d="M68 18V36H50" stroke="url(#amberGlow)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>'
    case 'icon-zoom-in':
      return '<circle cx="50" cy="48" r="20" fill="none" stroke="url(#cyanGlow)" stroke-width="8"/><path d="M78 76L98 96" stroke="url(#cyanGlow)" stroke-width="8" stroke-linecap="round"/><path d="M50 38V58M40 48H60" stroke="url(#cyanGlow)" stroke-width="8" stroke-linecap="round"/>'
    case 'icon-zoom-out':
      return '<circle cx="50" cy="48" r="20" fill="none" stroke="url(#cyanGlow)" stroke-width="8"/><path d="M78 76L98 96" stroke="url(#cyanGlow)" stroke-width="8" stroke-linecap="round"/><path d="M40 48H60" stroke="url(#cyanGlow)" stroke-width="8" stroke-linecap="round"/>'
    case 'icon-trash':
      return '<path d="M36 34H84" stroke="url(#amberGlow)" stroke-width="8" stroke-linecap="round"/><path d="M44 40V80H76V40" fill="rgba(255,255,255,0.04)" stroke="url(#amberGlow)" stroke-width="6" stroke-linejoin="round"/><path d="M54 48V72M66 48V72" stroke="url(#amberGlow)" stroke-width="6" stroke-linecap="round"/>'
    case 'icon-info':
      return '<circle cx="64" cy="50" r="28" fill="rgba(99,217,255,0.12)" stroke="url(#cyanGlow)" stroke-width="6"/><path d="M64 42V70" stroke="url(#cyanGlow)" stroke-width="8" stroke-linecap="round"/><circle cx="64" cy="30" r="5" fill="url(#cyanGlow)"/>'
    case 'icon-gear':
      return '<circle cx="64" cy="50" r="16" fill="url(#violetGlow)" stroke="#0c1017" stroke-width="4"/><path d="M64 18V30M64 70V82M32 50H44M84 50H96M42 28L50 36M78 64L86 72M42 72L50 64M78 36L86 28" stroke="url(#violetGlow)" stroke-width="6" stroke-linecap="round"/>'
    default:
      return '<circle cx="64" cy="50" r="22" fill="url(#steel)" stroke="#0c1017" stroke-width="4"/>'
  }
}

function resourceFilePath(kind, id) {
  return join(outputRoot, kind, `${id}.svg`)
}

function uiFilePath(id) {
  return join(outputRoot, 'ui', `${id}.svg`)
}

const manifest = {
  version: 1,
  sourceSheet,
  styleGuide,
  generatedAt: new Date().toISOString(),
  resources: [],
  ui: [],
}

for (const resource of resources) {
  const tilePath = resourceFilePath('tiles', resource.id)
  const iconPath = resourceFilePath('icons', resource.id)
  const cardPath = resourceFilePath('cards', resource.id)

  ensureDirFor(tilePath)
  ensureDirFor(iconPath)
  ensureDirFor(cardPath)

  writeFileSync(tilePath, resourceTileSvg(resource))
  writeFileSync(iconPath, resourceIconSvg(resource))
  writeFileSync(cardPath, resourceCardSvg(resource))

  manifest.resources.push({
    id: resource.id,
    tier: resource.tier,
    nameFr: resource.nameFr,
    tile: `tiles/${resource.id}.svg`,
    icon: `icons/${resource.id}.svg`,
    card: `cards/${resource.id}.svg`,
  })
}

for (const asset of uiAssets) {
  const filePath = uiFilePath(asset.id)
  ensureDirFor(filePath)

  let contents
  if (asset.kind === 'icon') {
    contents = svg(128, 128, `
      <rect width="128" height="128" rx="24" fill="${styleGuide.palette.backdrop}"/>
      <rect x="10" y="10" width="108" height="108" rx="20" fill="rgba(255,255,255,0.04)" stroke="${styleGuide.palette.line}" stroke-width="3"/>
      ${iconGlyphSvg(asset.id)}
    `)
  } else if (asset.kind === 'pill') {
    contents = uiPillSvg(asset)
  } else if (asset.kind === 'chip') {
    contents = uiChipSvg()
  } else if (asset.kind === 'metric') {
    contents = uiMetricSvg()
  } else if (asset.kind === 'field') {
    contents = uiFieldSvg(asset)
  } else if (asset.kind === 'viewport') {
    contents = uiViewportSvg()
  } else if (asset.kind === 'scroll') {
    contents = uiScrollSvg(asset.id)
  } else if (asset.kind === 'toolbar') {
    contents = uiToolbarSvg()
  } else if (asset.kind === 'header') {
    contents = uiHeaderSvg()
  } else {
    contents = uiFrameSvg(asset)
  }

  writeFileSync(filePath, contents)
  manifest.ui.push({
    id: asset.id,
    label: asset.label,
    kind: asset.kind,
    file: `ui/${asset.id}.svg`,
  })
}

const manifestPath = join(outputRoot, 'manifest.json')
ensureDirFor(manifestPath)
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

const readmePath = join(outputRoot, 'README.md')
writeFileSync(readmePath, `# Whitepod Assets\n\n` +
  `Generated SVG assets live here.\n\n` +
  `## Inspiration\n` +
  `- Reference sheet: \`${sourceSheet}\`\n` +
  `- Style: chunky industrial pixel art, isometric machine parts, muted steel palette with cyan/green/amber/violet accents\n\n` +
  `## Layout\n` +
  `- \`tiles/\` resource tiles\n` +
  `- \`icons/\` resource icons\n` +
  `- \`cards/\` resource cards\n` +
  `- \`ui/\` HUD primitives and control icons\n` +
  `- \`manifest.json\` file map for loaders\n\n` +
  `## Counts\n` +
  `- Resources: ${resources.length}\n` +
  `- UI assets: ${uiAssets.length}\n` +
  `\n` +
  `## Notes\n` +
  `These files are deterministic SVG placeholders and can be replaced by raster or hand-painted assets later without changing the manifest shape.\n`)

console.log(`Generated ${resources.length * 3 + uiAssets.length} SVG assets -> ${outputRoot}`)
