import { Play, Square } from 'lucide-react';
import { parseSeedInput } from '@/game/bot/seedInput';
import { GameMode } from '@/game/data/gameMode';
import { confirmWorldReplacement } from '@/game/ui/sessionPresentation';
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
  const engine = useGameStore((s) => s.engine);
  const startNewGame = useGameStore((s) => s.startNewGame);
  const botsInCampaign = useGameStore((s) => s.botsInCampaign);
  const setBotsInCampaign = useGameStore((s) => s.setBotsInCampaign);
  const seed = parseSeedInput(seedInput);
  const canApplySeed = engine !== null && seed !== null && seed !== engine.mapSeed;
  const applySeed = () => {
    if (!canApplySeed || !confirmWorldReplacement(engine, `recommencer avec la graine ${seed}`)) return;
    startNewGame(engine.gameMode, String(seed));
  };

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
          canApply={canApplySeed}
          onApply={applySeed}
        />
      </div>

      {engine?.gameMode === GameMode.Campaign && (
        // Dev setting: bots build by campaign rules (costs, unlocks), to measure the balance.
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink-muted">
          <input
            type="checkbox"
            checked={botsInCampaign}
            onChange={(event) => setBotsInCampaign(event.target.checked)}
            className="accent-accent"
          />
          Bot en campagne (dev, profil Master)
        </label>
      )}
    </Panel>
  );
}
