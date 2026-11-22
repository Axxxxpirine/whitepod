import { MasterBot } from './MasterBot';
import { ConnectorBot } from './ConnectorBot';
import type { BotFactoryArgs, BotProfileDefinition, BotProfileId } from './botTypes';

export const DEFAULT_BOT_PROFILE_ID: BotProfileId = 'master';

export const BOT_PROFILES: readonly BotProfileDefinition[] = [
  {
    id: DEFAULT_BOT_PROFILE_ID,
    label: 'Master',
    description: 'Cluster-based bot with distributed storage, local energy hubs, and belt routing.',
    campaignReady: true,
    create: (args: BotFactoryArgs) => new MasterBot(args.engine, args.onStatusChange),
  },
  {
    id: 'connector',
    label: 'Connector',
    description: 'Routes existing buildings only - connects extractors to storage and power to grid.',
    create: (args: BotFactoryArgs) => new ConnectorBot(args.engine, args.onStatusChange),
  },
] as const;

export function getBotProfile(profileId: BotProfileId): BotProfileDefinition {
  const profile = BOT_PROFILES.find((entry) => entry.id === profileId);
  if (!profile) {
    return BOT_PROFILES[0]!;
  }
  return profile;
}
