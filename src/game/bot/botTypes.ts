import type { GameEngine } from '@/game/engine/GameEngine';

export type BotProfileId = 'master' | 'connector';

export interface BotStatus {
  readonly active: boolean;
  readonly phase: string;
  readonly target: string | null;
}

export interface BotLifecycle {
  start(): void;
  stop(): void;
}

export interface BotFactoryArgs {
  readonly engine: GameEngine;
  readonly onStatusChange: (status: BotStatus) => void;
}

export interface BotProfileDefinition {
  readonly id: BotProfileId;
  readonly label: string;
  readonly description: string;
  /** Plays by campaign rules (costs, unlocks, milestones); others run in sandbox only. */
  readonly campaignReady?: boolean;
  create(args: BotFactoryArgs): BotLifecycle;
}
