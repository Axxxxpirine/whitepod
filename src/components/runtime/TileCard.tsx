import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface TileCardProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title'> {
  title: ReactNode
  subtitle?: ReactNode
  selected?: boolean
  leading?: ReactNode
}

export function TileCard({ title, subtitle, selected, leading, className = '', ...props }: TileCardProps) {
  return (
    <button
      type="button"
      className={['runtime-tile', selected ? 'is-selected' : '', className].filter(Boolean).join(' ')}
      {...props}
    >
      <div className="runtime-tile__leading">{leading}</div>
      <div className="runtime-tile__copy">
        <span className="runtime-tile__title">{title}</span>
        {subtitle ? <span className="runtime-tile__subtitle">{subtitle}</span> : null}
      </div>
    </button>
  )
}
