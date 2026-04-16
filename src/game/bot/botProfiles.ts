import { AutonomousBot } from './AutonomousBot';
import { FractalBot } from './FractalBot';
import { ExplorerBot } from './ExplorerBot';
import { BalancedBot } from './BalancedBot';
import { LogisticsBot } from './LogisticsBot';
import { SpeedrunBot } from './SpeedrunBot';
import { CircuitBot } from './CircuitBot';
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
  {
    id: 'explorer',
    label: 'Explorer',
    description: 'Aggressive map reveal with frontier watchtowers.',
    create: (args: BotFactoryArgs) => new ExplorerBot(args.engine, args.onStatusChange),
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Steady growth with power-first discipline.',
    create: (args: BotFactoryArgs) => new BalancedBot(args.engine, args.onStatusChange),
  },
  {
    id: 'logistics',
    label: 'Logistics',
    description: 'Compact, connected infrastructure modules.',
    create: (args: BotFactoryArgs) => new LogisticsBot(args.engine, args.onStatusChange),
  },
  {
    id: 'speedrun',
    label: 'Speedrun',
    description: 'Fast early expansion with minimal overhead.',
    create: (args: BotFactoryArgs) => new SpeedrunBot(args.engine, args.onStatusChange),
  },
  {
    id: 'circuit',
    label: 'Circuit',
    description: 'Circuit-board style layout with spaced modules and belt routing.',
    create: (args: BotFactoryArgs) => new CircuitBot(args.engine, args.onStatusChange),
  },
] as const;

export function getBotProfile(profileId: BotProfileId): BotProfileDefinition {
  const profile = BOT_PROFILES.find((entry) => entry.id === profileId);
  if (!profile) {
    return BOT_PROFILES[0]!;
  }
  return profile;
}
