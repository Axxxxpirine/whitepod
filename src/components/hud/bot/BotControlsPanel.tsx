import { Play, Square } from 'lucide-react';
import { applySeedAndResetSession } from '@/game/session/seedSession';
import { useGameStore } from '@/store/useGameStore';
import { Icon, Panel } from '@/components/ui';
import { BotProfileSelect } from './BotProfileSelect';
import { BotSeedControls } from './BotSeedControls';
import { BotStatusIndicator } from './BotStatusIndicator';

export function BotControlsPanel() {
  const bot = useGameStore((s) => s.bot);
  const botControls = useGameStore((s) => s.botControls);
  const selectedBotProfileId = useGameStore((s) => s.selectedBotProfileId);
  const seedInput = useGameStore((s) => s.seedInput);
  const setSelectedBotProfileId = useGameStore((s) => s.setSelectedBotProfileId);
  const setSeedInput = useGameStore((s) => s.setSeedInput);
  const resetSession = useGameStore((s) => s.resetSession);

  return (
    <Panel className="pointer-events-auto flex max-w-[320px] flex-col gap-2 px-3 py-2.5 text-ink">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (!botControls) return;
            if (bot.active) botControls.stop();
            else botControls.start();
          }}
          disabled={!botControls}
          className={`inline-flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-xs transition-colors ${botControls ? 'bg-accent text-bg hover:bg-accent/90' : 'bg-surface-2 text-ink-muted'}`}
        >
          <Icon icon={bot.active ? Square : Play} className="h-3.5 w-3.5" />
          <span>{bot.active ? 'Stop' : 'Start'}</span>
        </button>

        <BotProfileSelect value={selectedBotProfileId} onChange={setSelectedBotProfileId} />
        <BotStatusIndicator active={bot.active} />
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="label text-ink-muted">Bot</div>
          <div className="truncate text-xs text-ink">{bot.phase}</div>
          {bot.target && <div className="truncate text-[11px] text-ink-muted">{bot.target}</div>}
        </div>

        <BotSeedControls
          value={seedInput}
          onChange={setSeedInput}
          onApply={() => applySeedAndResetSession({ seedInput, setSeedInput, resetSession })}
        />
      </div>
    </Panel>
  );
}
