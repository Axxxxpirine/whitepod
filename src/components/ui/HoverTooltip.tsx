import type { ReactNode } from 'react';

interface HoverTooltipProps {
  content: ReactNode;
  children: ReactNode;
  id?: string;
}

export function HoverTooltip({ content, children, id }: HoverTooltipProps) {
  return (
    <div className="group relative">
      {children}
      <div
        id={id}
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-md border border-border bg-surface px-2 py-1 text-[11px] text-ink whitespace-nowrap opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {content}
      </div>
    </div>
  );
}
