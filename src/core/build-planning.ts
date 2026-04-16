import type { LunarChemistryMetadata, PlaceMeta, TokenRef, Transition, TransitionMeta } from '@/core/types'

const LAYER_SUFFIXES = ['_surface', '_bus', '_stock'] as const

type PlaceLayer = (typeof LAYER_SUFFIXES)[number] extends `_${infer T}` ? T : never

export interface TierRecipeGuide {
  outputPlaceId: string
  outputName: string
  transitionId: string
  transitionName: string
  inputs: Array<{
    placeId: string
    placeName: string
    qty: number
    tier: number | null
  }>
}

export interface TierGuideSection {
  tier: number
  nextTier: number
  tierResourceNames: string[]
  recipes: TierRecipeGuide[]
}

export function buildPlaceMetaMap(metadata: LunarChemistryMetadata | null): Map<string, PlaceMeta> {
  return new Map((metadata?.gameSystem.places ?? []).map(place => [place.id, place]))
}

export function buildTransitionMetaMap(metadata: LunarChemistryMetadata | null): Map<string, TransitionMeta> {
  return new Map((metadata?.gameSystem.transitions ?? []).map(transition => [transition.id, transition]))
}

export function splitPlaceId(placeId: string): { baseId: string; layer: PlaceLayer | null } {
  for (const suffix of LAYER_SUFFIXES) {
    if (placeId.endsWith(suffix)) {
      return {
        baseId: placeId.slice(0, -suffix.length),
        layer: suffix.slice(1) as PlaceLayer,
      }
    }
  }

  return { baseId: placeId, layer: null }
}

export function getStationBuildCost(transition: Transition): TokenRef[] {
  return transition.consumes.filter(token => token.place !== 'run')
}

export function getMissingBuildCost(tokens: Record<string, number>, cost: readonly TokenRef[]): TokenRef[] {
  return cost.flatMap(token => {
    const available = tokens[token.place] ?? 0
    if (available >= token.qty) return []
    return [{ place: token.place, qty: token.qty - available }]
  })
}

export function applyBuildCost(tokens: Record<string, number>, cost: readonly TokenRef[]): Record<string, number> | null {
  const missing = getMissingBuildCost(tokens, cost)
  if (missing.length > 0) return null

  const next = { ...tokens }
  for (const token of cost) {
    const remaining = (next[token.place] ?? 0) - token.qty
    if (remaining <= 0) {
      delete next[token.place]
      continue
    }
    next[token.place] = remaining
  }

  return next
}

export function getPlaceLabel(placeId: string, placeMetaById: ReadonlyMap<string, PlaceMeta>): string {
  const { baseId, layer } = splitPlaceId(placeId)
  const meta = placeMetaById.get(baseId) ?? placeMetaById.get(placeId)
  const baseName = meta?.name_fr ?? baseId

  if (!layer) return baseName

  switch (layer) {
    case 'surface':
      return `${baseName} (surface)`
    case 'bus':
      return `${baseName} (bus)`
    case 'stock':
      return `${baseName} (stock)`
  }
}

export function getTransitionLabel(transitionId: string, transitionMetaById: ReadonlyMap<string, TransitionMeta>): string {
  return transitionMetaById.get(transitionId)?.name_fr ?? transitionId
}

function getPrimaryOutputPlace(transition: Transition): string | null {
  return transition.produces.find(token => token.place !== 'run' && token.place !== 'done')?.place ?? null
}

export function buildTierGuideSections(
  metadata: LunarChemistryMetadata | null,
  transitions: readonly Transition[],
): TierGuideSection[] {
  if (!metadata) return []

  const placeMetaById = buildPlaceMetaMap(metadata)
  const transitionMetaById = buildTransitionMetaMap(metadata)
  const recipesByTier = new Map<number, TierRecipeGuide[]>()
  const tierResourceNames = new Map<number, string[]>()

  for (const place of metadata.gameSystem.places) {
    if (place.kind === 'control' || place.layer || place.tier === undefined) continue
    const names = tierResourceNames.get(place.tier) ?? []
    names.push(place.name_fr ?? place.id)
    tierResourceNames.set(place.tier, names)
  }

  for (const transition of transitions) {
    if (!transition.id.startsWith('recipe__')) continue

    const outputPlaceId = getPrimaryOutputPlace(transition)
    if (!outputPlaceId) continue

    const outputBaseId = splitPlaceId(outputPlaceId).baseId
    const outputMeta = placeMetaById.get(outputBaseId)
    if (!outputMeta || outputMeta.tier === undefined || outputMeta.tier < 1) continue

    const sectionTier = outputMeta.tier - 1
    const recipes = recipesByTier.get(sectionTier) ?? []
    recipes.push({
      outputPlaceId,
      outputName: outputMeta.name_fr ?? outputBaseId,
      transitionId: transition.id,
      transitionName: getTransitionLabel(transition.id, transitionMetaById),
      inputs: getStationBuildCost(transition).map(input => {
        const inputBaseId = splitPlaceId(input.place).baseId
        const inputMeta = placeMetaById.get(inputBaseId)
        return {
          placeId: input.place,
          placeName: getPlaceLabel(input.place, placeMetaById),
          qty: input.qty,
          tier: inputMeta?.tier ?? null,
        }
      }),
    })
    recipesByTier.set(sectionTier, recipes)
  }

  return [...recipesByTier.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tier, recipes]) => ({
      tier,
      nextTier: tier + 1,
      tierResourceNames: (tierResourceNames.get(tier) ?? []).slice().sort((a, b) => a.localeCompare(b)),
      recipes: recipes.slice().sort((a, b) => a.outputName.localeCompare(b.outputName)),
    }))
}
