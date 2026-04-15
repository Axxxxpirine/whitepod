import type { HTMLAttributes, PropsWithChildren } from 'react';
import { cn } from '@/lib/utils';

type PanelProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>> & {
  elevated?: boolean;
};

/**
 * Flat panel with hairline 1px border. Replaces every ad-hoc
 * `border border-white/15 bg-black/75 shadow-xl rounded-xl` combo.
 */
export function Panel({ className, elevated = false, children, ...rest }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-md border border-border backdrop-blur-md',
        elevated ? 'bg-surface-2/95' : 'bg-surface/90',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
