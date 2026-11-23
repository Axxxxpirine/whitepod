import { BOT_PROFILES } from '@/game/bot/botProfiles';
import type { BotProfileId } from '@/game/bot/botTypes';

interface BotProfileSelectProps {
  readonly value: BotProfileId;
  readonly onChange: (profileId: BotProfileId) => void;
}

export function BotProfileSelect({ value, onChange }: BotProfileSelectProps) {
  return (
    <select
      aria-label="Profil du bot"
      value={value}
      onChange={(e) => onChange(e.target.value as BotProfileId)}
      className="min-w-0 flex-1 rounded-sm border border-border bg-surface-2 px-2 py-1.5 text-xs text-ink outline-none focus-visible:border-accent"
    >
      {BOT_PROFILES.map((profile) => (
        <option key={profile.id} value={profile.id}>
          {profile.label}
        </option>
      ))}
    </select>
  );
}
