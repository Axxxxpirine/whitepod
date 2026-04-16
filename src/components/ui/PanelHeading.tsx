import type { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

/**
 * Serif small-caps panel heading (Newsreader) — the architectural voice of
 * the HUD. Use for card titles, section dividers, subject names.
 */
export function PanelHeading({
  className,
  children,
}: PropsWithChildren<{ className?: string }>) {
  return (
    <h2 className={cn('panel-title text-sm text-ink', className)}>{children}</h2>
  );
}
