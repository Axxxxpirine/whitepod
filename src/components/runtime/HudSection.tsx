import type { ReactNode } from 'react'

interface HudSectionProps {
  title: string
  badge?: ReactNode
  children: ReactNode
  action?: ReactNode
  className?: string
}

export function HudSection({ title, badge, children, action, className = '' }: HudSectionProps) {
  return (
    <section className={['runtime-section panel-surface panel-dark', className].filter(Boolean).join(' ')}>
      <header className="runtime-section__header panel-header panel-header--dark">
        <div className="runtime-section__header-copy">
          <h2>{title}</h2>
          {badge ? <span className="hud-badge">{badge}</span> : null}
        </div>
        {action}
      </header>
      <div className="runtime-section__body">{children}</div>
    </section>
  )
}
