import type { GameEngine } from '@/game/engine/GameEngine';
import { GameMode } from '@/game/data/gameMode';
import type { BotLifecycle, BotProfileId, BotStatus } from './botTypes';
import { getBotProfile } from './botProfiles';

export class BotController {
  private bot: BotLifecycle;
  private active = false;
  private profileId: BotProfileId;
  private readonly engine: GameEngine;
  private readonly onStatusChange: (status: BotStatus) => void;

  constructor(
    engine: GameEngine,
    onStatusChange: (status: BotStatus) => void,
    profileId: BotProfileId,
  ) {
    this.engine = engine;
    this.onStatusChange = onStatusChange;
    this.profileId = profileId;
    this.bot = this.createBot(profileId);
  }

  /** Bots place buildings freely, so they only run in sandbox worlds until they learn campaign rules. */
  get isAvailable(): boolean {
    return this.engine.gameMode === GameMode.Sandbox;
  }

  start(): void {
    if (this.active || !this.isAvailable) return;
    this.active = true;
    this.bot.start();
  }

  stop(): void {
    this.active = false;
    this.bot.stop();
  }

  setProfile(profileId: BotProfileId): void {
    if (this.profileId === profileId) return;
    const wasActive = this.active;
    this.bot.stop();
    this.profileId = profileId;
    this.bot = this.createBot(profileId);
    if (wasActive) {
      this.bot.start();
    }
  }

  destroy(): void {
    this.active = false;
    this.bot.stop();
  }

  private createBot(profileId: BotProfileId): BotLifecycle {
    return getBotProfile(profileId).create({
      engine: this.engine,
      onStatusChange: this.onStatusChange,
    });
  }
}
