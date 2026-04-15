const CONTROL_PLACES = new Set(['start', 'run', 'done'])
const RESERVED_TRANSITION_PREFIXES = ['drain__', 'convey__', 'store__', 'recipe__', 'extract__']

function sumQty(tokens, place) {
  return tokens
    .filter(t => t.place === place)
    .reduce((acc, t) => acc + t.qty, 0)
}

export function classifyCanonicalTransition(transitionId) {
  if (transitionId === 'init' || transitionId === 'launch' || transitionId === 'terminate') {
    return { kind: 'system', activation: 'manual' }
  }

  return {
    kind: 'station',
    activation: 'placed',
    stationKind: transitionId.endsWith('_extraction') ? 'extract' : 'recipe',
  }
}

export function validateCanonicalAst(ast) {
  const { places, resourcesMeta, transitionsMeta, transitions } = ast

  for (const requiredPlace of CONTROL_PLACES) {
    if (!places.has(requiredPlace)) throw new Error(`missing required control place '${requiredPlace}'`)
  }

  for (const requiredTransition of ['init', 'launch', 'terminate']) {
    const exists = transitions.some(t => t.id === requiredTransition)
    if (!exists) throw new Error(`missing required transition '${requiredTransition}'`)
  }

  const transitionIds = new Set()
  for (const t of transitions) {
    if (transitionIds.has(t.id)) throw new Error(`duplicate transition id '${t.id}'`)
    transitionIds.add(t.id)

    for (const prefix of RESERVED_TRANSITION_PREFIXES) {
      if (t.id.startsWith(prefix)) {
        throw new Error(`canonical DSL must not define derived transition '${t.id}'`)
      }
    }

    if (!transitionsMeta.has(t.id)) {
      throw new Error(`missing @transition metadata for '${t.id}'`)
    }

    for (const tok of [...t.consumes, ...t.produces]) {
      if (!places.has(tok.place)) throw new Error(`transition '${t.id}' references unknown place '${tok.place}'`)
      if (!Number.isInteger(tok.qty) || tok.qty < 1) throw new Error(`transition '${t.id}' has invalid qty for '${tok.place}'`)
    }

    const classification = classifyCanonicalTransition(t.id)
    if (classification.kind === 'station') {
      const runIn = sumQty(t.consumes, 'run')
      const runOut = sumQty(t.produces, 'run')
      if (runIn < 1 || runOut < 1) {
        throw new Error(`station transition '${t.id}' must explicitly consume+produce 'run'`)
      }
    }
  }

  // Validate deposit config
  const requiredDepositResources = ['lunar_helium3', 'lunar_hydrogen', 'lunar_oxygen', 'lunar_regolith']
  for (const resourceId of requiredDepositResources) {
    const meta = resourcesMeta?.get(resourceId)
    if (!meta) throw new Error(`missing @resource deposit config for '${resourceId}'`)

    const depositCount = meta.depositCount
    const depositCapacity = meta.depositCapacity
    if (!Number.isInteger(depositCount) || depositCount < 1) {
      throw new Error(`@resource '${resourceId}' depositCount must be an integer >= 1`)
    }
    if (!Number.isInteger(depositCapacity) || depositCapacity < 1) {
      throw new Error(`@resource '${resourceId}' depositCapacity must be an integer >= 1`)
    }

    if (!places.has(resourceId)) {
      throw new Error(`@resource '${resourceId}' must refer to an existing @place id`)
    }
  }

  // Validate system meta activation (manual)
  for (const systemId of ['init', 'launch', 'terminate']) {
    const meta = transitionsMeta.get(systemId)
    if (!meta) continue
    if (meta.kind && meta.kind !== 'system') throw new Error(`@transition '${systemId}' kind must be 'system'`)
    if (meta.activation && meta.activation !== 'manual') {
      throw new Error(`@transition '${systemId}' activation must be 'manual'`)
    }
  }

  return { controlPlaces: CONTROL_PLACES }
}

export function isControlPlace(placeId) {
  return CONTROL_PLACES.has(placeId)
}

export function listResourcePlaces(ast) {
  const out = []
  for (const placeId of ast.places.keys()) {
    if (CONTROL_PLACES.has(placeId)) continue
    out.push(placeId)
  }
  out.sort()
  return out
}
