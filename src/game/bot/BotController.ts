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
  private readonly allowCampaign: () => boolean;

  constructor(
    engine: GameEngine,
    onStatusChange: (status: BotStatus) => void,
    profileId: BotProfileId,
    allowCampaign: () => boolean = () => false,
  ) {
    this.engine = engine;
    this.onStatusChange = onStatusChange;
    this.profileId = profileId;
    this.allowCampaign = allowCampaign;
    this.bot = this.createBot(profileId);
  }

  /**
   * Sandbox: always. Campaign: behind the dev setting, for profiles that play
   * by campaign rules (MasterBot), as balancing tools (#95).
   */
  get isAvailable(): boolean {
    if (this.engine.gameMode === GameMode.Sandbox) return true;
    return this.allowCampaign() && getBotProfile(this.profileId).campaignReady === true;
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
    if (wasActive && this.isAvailable) {
      this.bot.start();
    } else {
      this.active = false;
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
