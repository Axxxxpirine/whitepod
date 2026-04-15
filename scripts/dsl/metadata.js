import { classifyCanonicalTransition, listResourcePlaces } from './validate.js'

const LAYERS = ['surface', 'bus', 'stock']

function placeMetaForGameSystem(basePlaceMeta, resourceId, layer) {
  const meta = {
    id: `${resourceId}_${layer}`,
    resourceId,
    layer,
  }
  if (typeof basePlaceMeta?.tier === 'number') meta.tier = basePlaceMeta.tier
  if (typeof basePlaceMeta?.name_fr === 'string') meta.name_fr = basePlaceMeta.name_fr
  return meta
}

export function compileMetadata(ast) {
  const resources = listResourcePlaces(ast)

  const canonicalPlaces = [...ast.places.values()].sort((a, b) => a.id.localeCompare(b.id))

  const canonicalTransitions = ast.transitions
    .map(t => {
      const baseMeta = ast.transitionsMeta.get(t.id) ?? { id: t.id }
      const classification = classifyCanonicalTransition(t.id)
      const enriched = {
        ...baseMeta,
        kind: classification.kind,
        activation: classification.activation,
      }
      if (classification.stationKind) enriched.stationKind = classification.stationKind
      return enriched
    })
    .sort((a, b) => a.id.localeCompare(b.id))

  const gameSystemPlaces = []
  gameSystemPlaces.push({ id: 'start', kind: 'control', name_fr: ast.places.get('start')?.name_fr ?? 'start' })
  gameSystemPlaces.push({ id: 'run', kind: 'control', name_fr: ast.places.get('run')?.name_fr ?? 'run' })
  gameSystemPlaces.push({ id: 'done', kind: 'control', name_fr: ast.places.get('done')?.name_fr ?? 'done' })

  for (const resourceId of resources) {
    const baseMeta = ast.places.get(resourceId)
    for (const layer of LAYERS) {
      gameSystemPlaces.push(placeMetaForGameSystem(baseMeta, resourceId, layer))
    }
  }

  gameSystemPlaces.sort((a, b) => a.id.localeCompare(b.id))

  const gameSystemTransitions = []

  // system transitions
  for (const id of ['init', 'launch', 'terminate']) {
    const baseMeta = ast.transitionsMeta.get(id) ?? { id }
    gameSystemTransitions.push({
      ...baseMeta,
      id,
      kind: 'system',
      activation: 'manual',
    })
  }

  for (const resourceId of resources) {
    const placeName = ast.places.get(resourceId)?.name_fr ?? resourceId

    gameSystemTransitions.push({
      id: `extract__${resourceId}`,
      kind: 'station',
      activation: 'placed',
      stationKind: 'extract',
      name_fr: `Extraction: ${placeName}`,
    })

    gameSystemTransitions.push({
      id: `convey__${resourceId}`,
      kind: 'station',
      activation: 'placed',
      stationKind: 'convey',
      name_fr: `Convoyage: ${placeName}`,
    })

    gameSystemTransitions.push({
      id: `store__${resourceId}`,
      kind: 'station',
      activation: 'placed',
      stationKind: 'store',
      name_fr: `Stockage: ${placeName}`,
    })

    for (const layer of ['surface', 'bus', 'stock']) {
      gameSystemTransitions.push({
        id: `drain__${resourceId}_${layer}`,
        kind: 'system',
        activation: 'always',
        name_fr: `Purge: ${placeName} (${layer})`,
      })
    }
  }

  // recipe transitions
  for (const t of ast.transitions) {
    const classification = classifyCanonicalTransition(t.id)
    if (classification.kind !== 'station' || classification.stationKind !== 'recipe') continue

    const baseMeta = ast.transitionsMeta.get(t.id) ?? { id: t.id }
    gameSystemTransitions.push({
      ...baseMeta,
      id: `recipe__${t.id}`,
      kind: 'station',
      activation: 'placed',
      stationKind: 'recipe',
    })
  }

  gameSystemTransitions.sort((a, b) => a.id.localeCompare(b.id))

  return {
    version: 1,
    canonical: {
      places: canonicalPlaces,
      transitions: canonicalTransitions,
      arcs: ast.arcs,
    },
    gameSystem: {
      places: gameSystemPlaces,
      transitions: gameSystemTransitions,
      resources,
    },
  }
}
