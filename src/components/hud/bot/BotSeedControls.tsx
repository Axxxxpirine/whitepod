interface BotSeedControlsProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onApply: () => void;
}

export function BotSeedControls({ value, onChange, onApply }: BotSeedControlsProps) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <span className="label text-ink-muted">Seed</span>
      <input
        aria-label="Seed input"
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onApply();
        }}
        className="w-20 rounded-sm border border-border bg-surface-2 px-2 py-1.5 text-xs tabular-nums text-ink outline-none"
      />
      <button
        type="button"
        onClick={onApply}
        className="rounded-sm border border-border bg-surface px-2 py-1.5 text-xs text-ink-muted transition-colors hover:bg-border hover:text-ink"
      >
        Apply
      </button>
    </div>
  );
}
