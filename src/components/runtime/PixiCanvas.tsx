import { useEffect, useRef } from 'react'
import { loadAssetManifest } from '@/render/asset-manifest-loader'
import { PixiRenderer } from '@/render/pixi-runtime'
import { useGameStore } from '@/store/game-store'

interface PixiCanvasProps {
  className?: string
  style?: React.CSSProperties
}

export function PixiCanvas({ className, style }: PixiCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PixiRenderer | null>(null)
  const exportData = useGameStore(s => s.getPixiExport())
  const selectBuildCell = useGameStore(s => s.selectBuildCell)
  const placeStationAtCell = useGameStore(s => s.placeStationAtCell)
  const getPreferredTransitionIdForPalette = useGameStore(s => s.getPreferredTransitionIdForPalette)
  const hoverBuildCell = useGameStore(s => s.hoverBuildCell)

  useEffect(() => {
    let cancelled = false

    async function boot() {
      const manifest = await loadAssetManifest()
      if (cancelled || !containerRef.current) return

      const renderer = new PixiRenderer()
      rendererRef.current = renderer
      await renderer.init(manifest)
      if (cancelled || !containerRef.current) return
      renderer.mount(containerRef.current)
      renderer.update(exportData)
    }

    boot()

    return () => {
      cancelled = true
      rendererRef.current?.destroy()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      rendererRef.current?.update(useGameStore.getState().getPixiExport())
    }, 250)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const onClick = (event: MouseEvent) => {
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const x = Math.floor((event.clientX - rect.left) / (rect.width / exportData.grid.width))
      const y = Math.floor((event.clientY - rect.top) / (rect.height / exportData.grid.height))
      if (x < 0 || y < 0 || x >= exportData.grid.width || y >= exportData.grid.height) return
      selectBuildCell(x, y)
      const transitionId = getPreferredTransitionIdForPalette()
      if (transitionId) placeStationAtCell(x, y, transitionId)
    }

    const onMove = (event: MouseEvent) => {
      const rect = node.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      const x = Math.floor((event.clientX - rect.left) / (rect.width / exportData.grid.width))
      const y = Math.floor((event.clientY - rect.top) / (rect.height / exportData.grid.height))
      if (x < 0 || y < 0 || x >= exportData.grid.width || y >= exportData.grid.height) {
        hoverBuildCell(0, null)
        return
      }
      hoverBuildCell(x, y)
    }

    const onLeave = () => hoverBuildCell(0, null)

    node.addEventListener('click', onClick)
    node.addEventListener('mousemove', onMove)
    node.addEventListener('mouseleave', onLeave)

    return () => {
      node.removeEventListener('click', onClick)
      node.removeEventListener('mousemove', onMove)
      node.removeEventListener('mouseleave', onLeave)
    }
  }, [exportData, getPreferredTransitionIdForPalette, hoverBuildCell, placeStationAtCell, selectBuildCell])

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const resize = () => {
      const rect = node.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        rendererRef.current?.resize(rect.width, rect.height)
      }
    }

    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return <div ref={containerRef} className={className} style={{ display: 'block', width: '100%', height: '100%', minWidth: 0, minHeight: 0, ...style }} />
}
