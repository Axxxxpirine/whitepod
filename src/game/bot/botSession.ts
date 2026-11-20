import type { GameEngine } from '@/game/engine/GameEngine';
import { useGameStore } from '@/store/useGameStore';
import { BotController } from './BotController';
import { DEFAULT_BOT_PROFILE_ID } from './botProfiles';
import type { BotProfileId } from './botTypes';

interface BotSessionArgs {
  readonly engine: GameEngine;
  readonly initialProfileId?: BotProfileId;
}

interface BotSession {
  destroy(): void;
}

export function createBotSession({ engine, initialProfileId = DEFAULT_BOT_PROFILE_ID }: BotSessionArgs): BotSession {
  const setBot = useGameStore.getState().setBot;
  const setBotControls = useGameStore.getState().setBotControls;
  const controller = new BotController(engine, setBot, initialProfileId);

  // Without controls the HUD disables the bot button (campaign worlds).
  setBotControls(
    controller.isAvailable
      ? {
          start: () => controller.start(),
          stop: () => controller.stop(),
        }
      : null,
  );

  const unsubscribe = useGameStore.subscribe((nextState, previousState) => {
    if (nextState.selectedBotProfileId !== previousState.selectedBotProfileId) {
      controller.setProfile(nextState.selectedBotProfileId);
    }
  });

  return {
    destroy() {
      setBotControls(null);
      unsubscribe();
      controller.destroy();
    },
  };
}
