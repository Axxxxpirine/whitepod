import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TooltipBubbleProps {
  content: ReactNode;
  className?: string;
  id?: string;
}

interface HoverTooltipProps {
  content: ReactNode;
  children: ReactNode;
  id?: string;
}

export function TooltipBubble({ content, className, id }: TooltipBubbleProps) {
  return (
    <div
      id={id}
      role="tooltip"
      className={cn(
        'pointer-events-none rounded-md border border-border bg-surface px-2 py-1',
        'panel-title whitespace-nowrap text-[11px] leading-none text-ink',
        'transition-opacity duration-[var(--duration-hover)]',
        className,
      )}
    >
      {content}
    </div>
  );
}

export function HoverTooltip({ content, children, id }: HoverTooltipProps) {
  return (
    <div className="group relative">
      {children}
      <TooltipBubble
        id={id}
        content={content}
        className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
      />
    </div>
  );
}
