import { AutonomousBot } from './AutonomousBot';
import { FractalBot } from './FractalBot';
import type { BotFactoryArgs, BotProfileDefinition, BotProfileId } from './botTypes';

export const DEFAULT_BOT_PROFILE_ID: BotProfileId = 'greedy';

export const BOT_PROFILES: readonly BotProfileDefinition[] = [
  {
    id: DEFAULT_BOT_PROFILE_ID,
    label: 'Greedy',
    description: 'Legacy baseline that prioritizes extractors and power support.',
    create: (args: BotFactoryArgs) => new AutonomousBot(args.engine, args.onStatusChange),
  },
  {
    id: 'fractal',
    label: 'Fractal',
    description: 'Spiral exploration profile with structured expansion.',
    create: (args: BotFactoryArgs) => new FractalBot(args.engine, args.onStatusChange),
  },
] as const;

export function getBotProfile(profileId: BotProfileId): BotProfileDefinition {
  const profile = BOT_PROFILES.find((entry) => entry.id === profileId);
  if (!profile) {
    return BOT_PROFILES[0]!;
  }
  return profile;
}
