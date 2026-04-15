import type { LunarChemistryMetadata, Transition } from '@/core/types'

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

export async function loadGameSystemTransitions(): Promise<Transition[]> {
  return fetchJson<Transition[]>('/data/lunar-chemistry.game-system.transitions.json')
}

export async function loadLunarChemistryMetadata(): Promise<LunarChemistryMetadata> {
  return fetchJson<LunarChemistryMetadata>('/data/lunar-chemistry.metadata.json')
}
