import type { LucideIcon, LucideProps } from 'lucide-react';
import { cn } from '@/lib/utils';

type IconProps = Omit<LucideProps, 'ref'> & {
  icon: LucideIcon;
};

/**
 * Architectural 1.5px-stroke lucide wrapper. Every HUD icon goes through
 * this so stroke weight and default color stay consistent with DESIGN.md.
 */
export function Icon({ icon: Lucide, className, size = 16, strokeWidth = 1.5, ...rest }: IconProps) {
  return <Lucide size={size} strokeWidth={strokeWidth} className={cn('shrink-0', className)} {...rest} />;
}
