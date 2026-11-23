import { cn } from '@/lib/utils';
import { costText, type CostLine } from '@/game/ui/costPresentation';

interface CostListProps {
  readonly lines: readonly CostLine[];
  /** `compact` fits under a hotbar slot: smaller sprites and digits. */
  readonly size?: 'compact' | 'regular';
  /** Read before the amounts by assistive tech, e.g. "Coût" or "Coût du tracé". */
  readonly label?: string;
  readonly className?: string;
}

/**
 * Construction cost as resource sprites and mono amounts. A line the global
 * stock cannot cover turns amber (DESIGN.md: amber = "not enough").
 */
export function CostList({ lines, size = 'regular', label = 'Coût', className }: CostListProps) {
  if (lines.length === 0) return null;
  const compact = size === 'compact';
  const short = lines.some((line) => line.missing > 0);

  return (
    <span
      role="group"
      aria-label={`${label} : ${costText(lines)}${short ? ', ressources insuffisantes' : ''}`}
      className={cn('inline-flex items-center', compact ? 'gap-1' : 'gap-2', className)}
    >
      {lines.map((line) => (
        <span
          key={line.resourceType}
          data-short={line.missing > 0 || undefined}
          className={cn(
            'inline-flex items-center gap-0.5 tabular-nums',
            compact ? 'text-[11px] leading-none' : 'text-xs',
            line.missing > 0 ? 'text-accent-warm' : 'text-ink',
          )}
        >
          {line.sprite && (
            <img
              src={line.sprite}
              alt=""
              className={cn('object-contain', compact ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5')}
              draggable={false}
            />
          )}
          {line.amount}
        </span>
      ))}
    </span>
  );
}
