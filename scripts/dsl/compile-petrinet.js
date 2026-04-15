import { isControlPlace, listResourcePlaces } from './validate.js'

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

export function compilePetrinetTransitions(ast) {
  const base = ast.transitions.map(t => ({ id: t.id, consumes: t.consumes, produces: t.produces }))

  const derivedDrains = []
  for (const placeId of listResourcePlaces(ast)) {
    if (isControlPlace(placeId)) continue
    derivedDrains.push({
      id: `drain__${placeId}`,
      consumes: [{ place: 'done', qty: 1 }, { place: placeId, qty: 1 }],
      produces: [{ place: 'done', qty: 1 }],
    })
  }

  return stableTransitions([...base, ...derivedDrains])
}
