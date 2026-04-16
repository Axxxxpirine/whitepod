import type { ButtonHTMLAttributes } from 'react'
import { AssetImage } from './AssetImage'
import { uiIconCandidates } from '@/render/whitepod-assets'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: 'gear'
  label: string
}

export function IconButton({ icon, label, className = '', type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-black/70 text-white/80 shadow-xl backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white ${className}`.trim()}
      title={label}
      {...props}
    >
      <span className="sr-only">{label}</span>
      {icon === 'gear' ? (
        <AssetImage candidates={uiIconCandidates('settings')} alt="" className="h-5 w-5" imageClassName="h-5 w-5 object-contain" />
      ) : null}
    </button>
  )
}
