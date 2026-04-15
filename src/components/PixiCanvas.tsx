import { useEffect, useRef } from 'react'
import { PixiRenderer } from '@/render/pixi-renderer'

interface PixiCanvasProps {
  className?: string
  style?: React.CSSProperties
}

export function PixiCanvas({ className, style }: PixiCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<PixiRenderer | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const renderer = new PixiRenderer()
    rendererRef.current = renderer

    window.__whitepodOnPixiUpdate = (exportData) => {
      renderer.update(exportData)
    }

    return () => {
      window.__whitepodOnPixiUpdate = undefined
      renderer.destroy()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: '1280px', height: '1280px', ...style }}
    />
  )
}
