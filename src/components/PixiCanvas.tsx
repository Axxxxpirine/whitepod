import { useEffect, useRef } from 'react'
import { PixiRenderer } from '@/render/pixi-renderer'
import { useGameStore } from '@/store/game-store'

interface PixiCanvasProps {
  className?: string
  style?: React.CSSProperties
}

export function PixiCanvas({ className, style }: PixiCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PixiRenderer | null>(null)
  const selectBuildCell = useGameStore(s => s.selectBuildCell)
  const placeStationAtCell = useGameStore(s => s.placeStationAtCell)
  const getPreferredTransitionIdForPalette = useGameStore(s => s.getPreferredTransitionIdForPalette)
  const hoverBuildCell = useGameStore(s => s.hoverBuildCell)
  const getPixiExport = useGameStore(s => s.getPixiExport)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const renderer = new PixiRenderer()
    rendererRef.current = renderer
    renderer.attachTo(container)

    window.__whitepodOnPixiUpdate = (exportData) => {
      renderer.update(exportData)
    }

    const handleClick = (event: MouseEvent) => {
      const exportData = getPixiExport()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const cellSize = rect.width / exportData.grid.width
      const x = Math.floor((event.clientX - rect.left) / cellSize)
      const y = Math.floor((event.clientY - rect.top) / cellSize)
      if (x < 0 || y < 0 || x >= exportData.grid.width || y >= exportData.grid.height) return

      selectBuildCell(x, y)

      const transitionId = getPreferredTransitionIdForPalette()
      if (!transitionId) return

      placeStationAtCell(x, y, transitionId)
    }

    const handleMove = (event: MouseEvent) => {
      const exportData = getPixiExport()
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      const cellSize = rect.width / exportData.grid.width
      const x = Math.floor((event.clientX - rect.left) / cellSize)
      const y = Math.floor((event.clientY - rect.top) / cellSize)
      if (x < 0 || y < 0 || x >= exportData.grid.width || y >= exportData.grid.height) {
        hoverBuildCell(0, null)
        return
      }
      hoverBuildCell(x, y)
    }

    const handleLeave = () => hoverBuildCell(0, null)

    container.addEventListener('click', handleClick)
    container.addEventListener('mousemove', handleMove)
    container.addEventListener('mouseleave', handleLeave)

    return () => {
      window.__whitepodOnPixiUpdate = undefined
      renderer.attachTo(null)
      container.removeEventListener('click', handleClick)
      container.removeEventListener('mousemove', handleMove)
      container.removeEventListener('mouseleave', handleLeave)
      renderer.destroy()
    }
  }, [getPixiExport, getPreferredTransitionIdForPalette, hoverBuildCell, placeStationAtCell, selectBuildCell])

  return (
    <div
      ref={containerRef}
      id="pixi-canvas"
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', minWidth: 0, minHeight: 0, ...style }}
    />
  )
}
