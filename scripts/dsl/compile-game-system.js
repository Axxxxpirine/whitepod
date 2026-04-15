import { classifyCanonicalTransition, isControlPlace, listResourcePlaces } from './validate.js'

const LAYERS = ['surface', 'bus', 'stock']

function stableTokens(tokens) {
  const merged = new Map()
  for (const t of tokens) {
    merged.set(t.place, (merged.get(t.place) ?? 0) + t.qty)
  }
  return [...merged.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([place, qty]) => ({ place, qty }))
}

function stableTransitions(transitions) {
  return transitions
    .map(t => ({
      id: t.id,
      consumes: stableTokens(t.consumes),
      produces: stableTokens(t.produces),
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function toLayerPlace(placeId, layer, io) {
  if (isControlPlace(placeId)) return placeId
  if (layer === 'stock' && io === 'in') return `${placeId}_stock`
  if (layer === 'surface' && io === 'out') return `${placeId}_surface`
  throw new Error(`invalid layer mapping request for ${placeId} ${layer} ${io}`)
}

function mapRecipeTransition(base) {
  return {
    id: `recipe__${base.id}`,
    consumes: base.consumes.map(t => ({
      place: isControlPlace(t.place) ? t.place : `${t.place}_stock`,
      qty: t.qty,
    })),
    produces: base.produces.map(t => ({
      place: isControlPlace(t.place) ? t.place : `${t.place}_surface`,
      qty: t.qty,
    })),
  }
}

function extractResourceFromExtractTransition(base) {
  const producedResources = base.produces.filter(p => !isControlPlace(p.place))
  if (producedResources.length !== 1) {
    throw new Error(`extract transition '${base.id}' must produce exactly one resource place`)
  }
  return { resourceId: producedResources[0].place, qty: producedResources[0].qty }
}

export function compileGameSystemTransitions(ast) {
  const resources = listResourcePlaces(ast)

  const baseById = new Map(ast.transitions.map(t => [t.id, t]))
  const init = baseById.get('init')
  const launch = baseById.get('launch')
  const terminate = baseById.get('terminate')
  if (!init || !launch || !terminate) throw new Error('missing init/launch/terminate')

  const transitions = []

  // Control transitions
  transitions.push({ id: init.id, consumes: init.consumes, produces: init.produces })
  transitions.push({
    id: launch.id,
    consumes: launch.consumes.map(t => ({
      place: t.place === 'rocket_ready' ? 'rocket_ready_stock' : t.place,
      qty: t.qty,
    })),
    produces: launch.produces,
  })
  transitions.push({ id: terminate.id, consumes: terminate.consumes, produces: terminate.produces })

  // Logistics transitions (always available as placeable stations)
  for (const resourceId of resources) {
    transitions.push({
      id: `convey__${resourceId}`,
      consumes: [{ place: 'run', qty: 1 }, { place: `${resourceId}_surface`, qty: 1 }],
      produces: [{ place: 'run', qty: 1 }, { place: `${resourceId}_bus`, qty: 1 }],
    })
    transitions.push({
      id: `store__${resourceId}`,
      consumes: [{ place: 'run', qty: 1 }, { place: `${resourceId}_bus`, qty: 1 }],
      produces: [{ place: 'run', qty: 1 }, { place: `${resourceId}_stock`, qty: 1 }],
    })
  }

  // Base transitions projected
  for (const base of ast.transitions) {
    const classification = classifyCanonicalTransition(base.id)
    if (classification.kind !== 'station') continue

    if (classification.stationKind === 'extract') {
      const { resourceId, qty } = extractResourceFromExtractTransition(base)
      transitions.push({
        id: `extract__${resourceId}`,
        consumes: base.consumes.map(t => ({ place: t.place, qty: t.qty })),
        produces: [
          ...base.produces.filter(p => isControlPlace(p.place)).map(p => ({ place: p.place, qty: p.qty })),
          { place: `${resourceId}_surface`, qty },
        ],
      })
      continue
    }

    transitions.push(mapRecipeTransition(base))
  }

  // Derived drains (post-launch)
  for (const resourceId of resources) {
    for (const layer of LAYERS) {
      transitions.push({
        id: `drain__${resourceId}_${layer}`,
        consumes: [{ place: 'done', qty: 1 }, { place: `${resourceId}_${layer}`, qty: 1 }],
        produces: [{ place: 'done', qty: 1 }],
      })
    }
  }

  return stableTransitions(transitions)
}

export function listGameSystemPlaces(ast) {
  const resources = listResourcePlaces(ast)
  const out = ['start', 'run', 'done']
  for (const resourceId of resources) {
    out.push(`${resourceId}_surface`, `${resourceId}_bus`, `${resourceId}_stock`)
  }
  return out
}
