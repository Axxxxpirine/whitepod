import type { GameEngine } from '@/game/engine/GameEngine';

export type BotProfileId = 'greedy' | 'fractal';

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
  create(args: BotFactoryArgs): BotLifecycle;
}
