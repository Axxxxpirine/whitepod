import fs from 'node:fs'

function parseJsonMaybe(text, context) {
  const trimmed = text.trim()
  if (trimmed === '') return {}
  try {
    return JSON.parse(trimmed)
  } catch (error) {
    throw new Error(`${context}: invalid JSON: ${String(error)}`)
  }
}

function parseTokenTerm(term, context) {
  const trimmed = term.trim()
  if (trimmed === '' || trimmed === '()') return null

  const parts = trimmed.split('*')
  if (parts.length > 2) throw new Error(`${context}: invalid token term '${term}'`)

  const place = parts[0]
  if (!place) throw new Error(`${context}: missing place id`)

  const qty = parts.length === 2 ? Number.parseInt(parts[1], 10) : 1
  if (!Number.isInteger(qty) || qty < 1) throw new Error(`${context}: invalid qty in '${term}'`)

  return { place, qty }
}

function parseTokenList(text, context) {
  const trimmed = text.trim()
  if (trimmed === '' || trimmed === '()') return []

  const terms = trimmed.split(/\s+/g)
  const out = []
  for (const term of terms) {
    const parsed = parseTokenTerm(term, context)
    if (parsed) out.push(parsed)
  }
  return out
}

function parseDirective(line, directive, lineNo) {
  const withoutPrefix = line.slice(directive.length).trim()
  const sepIndex = withoutPrefix.indexOf('|')
  if (sepIndex === -1) {
    return { id: withoutPrefix.trim(), meta: {}, lineNo }
  }

  const id = withoutPrefix.slice(0, sepIndex).trim()
  const jsonText = withoutPrefix.slice(sepIndex + 1)
  const meta = parseJsonMaybe(jsonText, `${directive}@${lineNo}`)
  return { id, meta, lineNo }
}

function parseArcDirective(line, lineNo) {
  // @arc <transitionId> in|out <placeId> | <json>
  const withoutPrefix = line.slice('@arc'.length).trim()
  const sepIndex = withoutPrefix.indexOf('|')

  const left = (sepIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, sepIndex)).trim()
  const jsonText = sepIndex === -1 ? '' : withoutPrefix.slice(sepIndex + 1)

  const parts = left.split(/\s+/g)
  if (parts.length < 3) throw new Error(`@arc@${lineNo}: expected '@arc <transitionId> in|out <placeId>'`)

  const transitionId = parts[0]
  const direction = parts[1]
  const placeId = parts[2]
  if (direction !== 'in' && direction !== 'out') {
    throw new Error(`@arc@${lineNo}: direction must be 'in' or 'out'`)
  }

  return {
    transitionId,
    direction,
    placeId,
    meta: parseJsonMaybe(jsonText, `@arc@${lineNo}`),
    lineNo,
  }
}

function parseTransitionLine(line, lineNo) {
  const body = line.slice(1).trim()
  const arrowIndex = body.indexOf('->')
  if (arrowIndex === -1) throw new Error(`;transition@${lineNo}: missing '->'`)

  const left = body.slice(0, arrowIndex).trim()
  const right = body.slice(arrowIndex + 2).trim()

  const leftParts = left.split(/\s+/g).filter(Boolean)
  if (leftParts.length === 0) throw new Error(`;transition@${lineNo}: missing id`)

  const id = leftParts[0]
  const consumesText = leftParts.slice(1).join(' ')

  return {
    id,
    consumes: parseTokenList(consumesText, `;${id}@${lineNo}:consumes`),
    produces: parseTokenList(right, `;${id}@${lineNo}:produces`),
    lineNo,
  }
}

export function parseDslText(text) {
  const places = new Map()
  const transitionsMeta = new Map()
  const arcs = []
  const transitions = []

  const lines = text.split(/\r?\n/g)
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1
    const rawLine = lines[i]
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue

    if (line.startsWith('@place')) {
      const { id, meta } = parseDirective(line, '@place', lineNo)
      if (!id) throw new Error(`@place@${lineNo}: missing id`)
      if (places.has(id)) throw new Error(`@place@${lineNo}: duplicate place '${id}'`)
      places.set(id, { id, ...meta })
      continue
    }

    if (line.startsWith('@transition')) {
      const { id, meta } = parseDirective(line, '@transition', lineNo)
      if (!id) throw new Error(`@transition@${lineNo}: missing id`)
      if (transitionsMeta.has(id)) throw new Error(`@transition@${lineNo}: duplicate transition meta '${id}'`)
      transitionsMeta.set(id, { id, ...meta })
      continue
    }

    if (line.startsWith('@arc')) {
      arcs.push(parseArcDirective(line, lineNo))
      continue
    }

    if (line.startsWith(';')) {
      transitions.push(parseTransitionLine(line, lineNo))
      continue
    }
  }

  return { places, transitionsMeta, arcs, transitions }
}

export function parseDslFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8')
  return parseDslText(text)
}
