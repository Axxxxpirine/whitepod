import type { GameEngine } from '@/game/engine/GameEngine';
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

  start(): void {
    if (this.active) return;
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
