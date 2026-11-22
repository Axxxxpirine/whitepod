import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { BotControlsPanel } from '@/components/hud/bot/BotControlsPanel';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import { useGameStore } from '@/store/useGameStore';

describe('BotControlsPanel campaign setting', () => {
  beforeEach(() => {
    useGameStore.setState({ engine: null, botsInCampaign: false, botControls: null });
  });

  it('offers the dev setting in campaign and turns it on', () => {
    const engine = new GameEngine(800, 600, { gameMode: GameMode.Campaign });
    engine.generateMap(42);
    useGameStore.setState({ engine });
    render(<BotControlsPanel />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Bot en campagne/ }));

    expect(useGameStore.getState().botsInCampaign).toBe(true);
  });

  it('does not show it in sandbox', () => {
    const engine = new GameEngine(800, 600);
    engine.generateMap(42);
    useGameStore.setState({ engine });
    render(<BotControlsPanel />);

    expect(screen.queryByRole('checkbox', { name: /Bot en campagne/ })).toBeNull();
  });
});
