import { useEffect, useRef } from 'react'
import { PixiRenderer } from '@/render/pixi-renderer'
import { useGameStore } from '@/store/game-store'

interface PixiCanvasProps {
  className?: string
  style?: React.CSSProperties
}

function traceLine(from: { x: number; y: number }, to: { x: number; y: number }) {
  const cells: Array<{ x: number; y: number }> = []
  let x0 = from.x
  let y0 = from.y
  const x1 = to.x
  const y1 = to.y
  const dx = Math.abs(x1 - x0)
  const dy = Math.abs(y1 - y0)
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy

  for (;;) {
    cells.push({ x: x0, y: y0 })
    if (x0 === x1 && y0 === y1) break
    const twiceErr = err * 2
    if (twiceErr > -dy) {
      err -= dy
      x0 += sx
    }
    if (twiceErr < dx) {
      err += dx
      y0 += sy
    }
  }

  return cells
}

export function PixiCanvas({ className, style }: PixiCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const selectBuildCell = useGameStore((s) => s.selectBuildCell)
  const placeStationAtCell = useGameStore((s) => s.placeStationAtCell)
  const getPreferredTransitionIdForPalette = useGameStore((s) => s.getPreferredTransitionIdForPalette)
  const hoverBuildCell = useGameStore((s) => s.hoverBuildCell)
  const getPixiExport = useGameStore((s) => s.getPixiExport)
  const buildPalette = useGameStore((s) => s.buildPalette)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new PixiRenderer()
    renderer.attachTo(container)

    window.__whitepodOnPixiUpdate = (exportData) => {
      renderer.update(exportData)
    }

    let drawingTransitionId: string | null = null
    let lastDrawCell: { x: number; y: number } | null = null
    const visitedDrawCells = new Set<string>()

    const getCellFromPointer = (event: MouseEvent) => {
      const exportData = getPixiExport()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return null

      const cellSize = rect.width / exportData.grid.width
      const x = Math.floor((event.clientX - rect.left) / cellSize)
      const y = Math.floor((event.clientY - rect.top) / cellSize)
      if (x < 0 || y < 0 || x >= exportData.grid.width || y >= exportData.grid.height) return null
      return { x, y }
    }

    const placeDrawCell = (cell: { x: number; y: number }, transitionId: string) => {
      const key = `${cell.x},${cell.y}`
      if (visitedDrawCells.has(key)) return
      visitedDrawCells.add(key)
      selectBuildCell(cell.x, cell.y)
      placeStationAtCell(cell.x, cell.y, transitionId)
    }

    const handlePointerDown = (event: PointerEvent) => {
      const cell = getCellFromPointer(event)
      if (!cell) return

      selectBuildCell(cell.x, cell.y)
      hoverBuildCell(cell.x, cell.y)

      const transitionId = getPreferredTransitionIdForPalette()
      if (!transitionId) return

      if (buildPalette === 'conveyor') {
        drawingTransitionId = transitionId
        lastDrawCell = cell
        visitedDrawCells.clear()
        placeDrawCell(cell, transitionId)
        container.setPointerCapture(event.pointerId)
        return
      }

      placeStationAtCell(cell.x, cell.y, transitionId)
    }

    const handlePointerMove = (event: PointerEvent) => {
      const cell = getCellFromPointer(event)
      if (!cell) {
        hoverBuildCell(0, null)
        return
      }

      hoverBuildCell(cell.x, cell.y)

      if (drawingTransitionId && lastDrawCell) {
        for (const nextCell of traceLine(lastDrawCell, cell)) {
          placeDrawCell(nextCell, drawingTransitionId)
        }
        lastDrawCell = cell
      }
    }

    const finishDraw = () => {
      drawingTransitionId = null
      lastDrawCell = null
      visitedDrawCells.clear()
    }

    const handlePointerUp = (event: PointerEvent) => {
      finishDraw()
      if (container.hasPointerCapture(event.pointerId)) {
        container.releasePointerCapture(event.pointerId)
      }
    }

    const handlePointerLeave = () => {
      finishDraw()
      hoverBuildCell(0, null)
    }

    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    container.addEventListener('pointerdown', handlePointerDown)
    container.addEventListener('pointermove', handlePointerMove)
    container.addEventListener('pointerup', handlePointerUp)
    container.addEventListener('pointerleave', handlePointerLeave)
    container.addEventListener('contextmenu', handleContextMenu)

    return () => {
      window.__whitepodOnPixiUpdate = undefined
      renderer.attachTo(null)
      container.removeEventListener('pointerdown', handlePointerDown)
      container.removeEventListener('pointermove', handlePointerMove)
      container.removeEventListener('pointerup', handlePointerUp)
      container.removeEventListener('pointerleave', handlePointerLeave)
      container.removeEventListener('contextmenu', handleContextMenu)
      renderer.destroy()
    }
  }, [buildPalette, getPixiExport, getPreferredTransitionIdForPalette, hoverBuildCell, placeStationAtCell, selectBuildCell])

  return (
    <div
      ref={containerRef}
      id="pixi-canvas"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', minWidth: 0, minHeight: 0, touchAction: 'none', ...style }}
    />
  )
}
