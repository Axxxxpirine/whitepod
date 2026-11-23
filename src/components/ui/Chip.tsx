import type { PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

type ChipTone = 'accent' | 'accent-warm' | 'ok' | 'error' | 'muted';

const TONE_CLASS: Record<ChipTone, string> = {
  accent: 'bg-accent/10 border-accent text-accent',
  'accent-warm': 'bg-accent-warm/10 border-accent-warm text-accent-warm',
  ok: 'bg-ok/10 border-ok text-ok',
  error: 'bg-error/10 border-error text-error',
  muted: 'bg-surface-2 border-border text-ink-muted',
};

/**
 * Small-caps architectural chip (Space Grotesk via `.label`). Used for mode
 * indicators, ON/OFF badges, tool state.
 */
export function Chip({
  tone = 'accent',
  className,
  children,
}: PropsWithChildren<{ tone?: ChipTone; className?: string }>) {
  return (
    <span
      className={cn(
        'label inline-flex items-center rounded-sm border px-1 py-0.5',
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
