import type { ButtonHTMLAttributes } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: 'gear'
  label: string
}

function GearIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="1.8">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.53 3.18a1.5 1.5 0 0 1 2.94 0l.2.9a1.5 1.5 0 0 0 2.08 1.03l.83-.41a1.5 1.5 0 0 1 2.08 2.08l-.41.83a1.5 1.5 0 0 0 1.03 2.08l.9.2a1.5 1.5 0 0 1 0 2.94l-.9.2a1.5 1.5 0 0 0-1.03 2.08l.41.83a1.5 1.5 0 0 1-2.08 2.08l-.83-.41a1.5 1.5 0 0 0-2.08 1.03l-.2.9a1.5 1.5 0 0 1-2.94 0l-.2-.9a1.5 1.5 0 0 0-2.08-1.03l-.83.41a1.5 1.5 0 0 1-2.08-2.08l.41-.83a1.5 1.5 0 0 0-1.03-2.08l-.9-.2a1.5 1.5 0 0 1 0-2.94l.9-.2a1.5 1.5 0 0 0 1.03-2.08l-.41-.83A1.5 1.5 0 0 1 7.42 4.7l.83.41a1.5 1.5 0 0 0 2.08-1.03z"
      />
      <circle cx="12" cy="12" r="3.2" />
    </svg>
  )
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
      {icon === 'gear' ? <GearIcon /> : null}
    </button>
  )
}
