interface BotSeedControlsProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly canApply: boolean;
  readonly onApply: () => void;
}

export function BotSeedControls({ value, onChange, canApply, onApply }: BotSeedControlsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="label text-ink-muted">Graine</span>
      <input
        aria-label="Graine de la carte"
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onApply();
        }}
        className="w-20 rounded-sm border border-border bg-surface-2 px-2 py-1 text-xs tabular-nums text-ink outline-none focus-visible:border-accent"
      />
      <button
        type="button"
        disabled={!canApply}
        onClick={onApply}
        className="cursor-pointer rounded-sm border border-border bg-surface px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-border hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        Appliquer
      </button>
    </div>
  );
}
