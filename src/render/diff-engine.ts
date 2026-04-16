import type { PixiExport } from '@/core/types'

export function hashWorld(exportData: PixiExport): string {
  return JSON.stringify({
    phase: exportData.phase,
    cells: exportData.grid.cells,
    activities: exportData.activities,
    tokens: exportData.layerTokens,
  })
}
