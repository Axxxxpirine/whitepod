import type { ButtonHTMLAttributes, ReactNode } from 'react'

type IconName =
  | 'gear'
  | 'reset'
  | 'play'
  | 'pause'
  | 'info'
  | 'trash'
  | 'zoom-in'
  | 'zoom-out'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  label: ReactNode
  tone?: 'default' | 'primary' | 'danger'
}

export function IconButton({ icon, label, tone = 'default', className = '', ...props }: IconButtonProps) {
  const toneClass =
    tone === 'primary'
      ? 'runtime-icon-button--primary'
      : tone === 'danger'
        ? 'runtime-icon-button--danger'
        : ''

  return (
    <button
      type="button"
      className={['runtime-icon-button', toneClass, className].filter(Boolean).join(' ')}
      {...props}
    >
      <img src={`/assets/ui/icon-${icon}.svg`} alt="" aria-hidden="true" className="runtime-icon-button__icon" />
      <span className="runtime-icon-button__label">{label}</span>
    </button>
  )
}
