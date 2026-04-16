interface BotStatusIndicatorProps {
  readonly active: boolean;
}

export function BotStatusIndicator({ active }: BotStatusIndicatorProps) {
  return <span className={`h-2 w-2 shrink-0 rounded-full ${active ? 'bg-ok' : 'bg-border'}`} aria-hidden />;
}
