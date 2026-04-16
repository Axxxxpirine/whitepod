import type { ReactNode } from 'react'

interface GridViewportProps {
  title: string
  meta?: ReactNode
  children: ReactNode
}

export function GridViewport({ title, meta, children }: GridViewportProps) {
  return (
    <section className="runtime-grid-frame panel-surface panel-dark">
      <header className="runtime-grid-frame__header panel-header panel-header--dark">
        <h2>{title}</h2>
        <div className="hud-viewport-meta">{meta}</div>
      </header>
      <div className="runtime-grid-frame__body">{children}</div>
    </section>
  )
}
