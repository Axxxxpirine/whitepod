import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import App from '@/App';
import { StartScreen } from '@/components/StartScreen';
import { GameMode } from '@/game/data/gameMode';
import { GameEngine } from '@/game/engine/GameEngine';
import {
  VIEW_STORAGE_KEY,
  WORLD_STORAGE_KEY,
  clearPersistedSession,
  saveWorldSession,
} from '@/game/persistence/sessionStorage';
import { useGameStore } from '@/store/useGameStore';

// App shell only: the game itself (Pixi canvas, HUD, audio) is out of scope here.
vi.mock('@/components/GameCanvas', () => ({ GameCanvas: () => <div data-testid="game-canvas" /> }));
vi.mock('@/components/GameHUD', () => ({ GameHUD: () => null }));
vi.mock('@/components/GameMusicController', () => ({ GameMusicController: () => null }));
vi.mock('@/components/GameSfxController', () => ({ GameSfxController: () => null }));

function saveCampaign(seed = 7) {
  const engine = new GameEngine(640, 480, { gameMode: GameMode.Campaign });
  engine.generateMap(seed);
  saveWorldSession(engine, 'session-start-screen');
  window.localStorage.setItem(VIEW_STORAGE_KEY, 'view');
}

function bootState() {
  useGameStore.setState({
    engine: null,
    startScreenOpen: true,
    sessionStarted: false,
    newGameMode: GameMode.Sandbox,
    seedInput: '42',
    sessionEpoch: 0,
  });
}

describe('StartScreen at boot', () => {
  beforeEach(() => {
    clearPersistedSession();
    window.localStorage.clear();
    bootState();
  });

  it('loads no world before the player chooses', () => {
    render(<App />);

    expect(screen.getByRole('dialog', { name: 'Whitepod' })).toBeInTheDocument();
    expect(screen.queryByTestId('game-canvas')).toBeNull();
  });

  it('offers Continue only when a save exists, with what it holds', () => {
    const { unmount } = render(<StartScreen />);
    expect(screen.queryByRole('button', { name: /^Continuer/ })).toBeNull();
    unmount();

    saveCampaign(7);
    render(<StartScreen />);

    expect(screen.getByRole('button', { name: /^Continuer/ })).toHaveTextContent('Campagne · graine 7 · 0 / 6 paliers');
  });

  it('continues the saved game without touching it', () => {
    saveCampaign();
    const saved = window.localStorage.getItem(WORLD_STORAGE_KEY);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /^Continuer/ }));

    expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).toBe(saved);
    expect(useGameStore.getState().sessionEpoch).toBe(0);
  });

  it('starts a new campaign straight away when there is no save, with the chosen seed', () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText('Graine de la carte'), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('button', { name: /^Nouvelle campagne/ }));

    const state = useGameStore.getState();
    expect(state.newGameMode).toBe(GameMode.Campaign);
    expect(state.seedInput).toBe('1234');
    expect(state.startScreenOpen).toBe(false);
    expect(screen.getByTestId('game-canvas')).toBeInTheDocument();
  });

  it('asks before overwriting a save, and keeps it on cancel', () => {
    saveCampaign();
    const saved = window.localStorage.getItem(WORLD_STORAGE_KEY);
    render(<StartScreen />);

    fireEvent.click(screen.getByRole('button', { name: /^Bac à sable/ }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('efface la partie en cours');
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).toBe(saved);
    expect(useGameStore.getState().sessionStarted).toBe(false);
    expect(screen.getByRole('button', { name: /^Continuer/ })).toBeInTheDocument();
  });

  it('clears the save and starts the new game once confirmed', () => {
    saveCampaign();
    render(<StartScreen />);

    fireEvent.click(screen.getByRole('button', { name: /^Bac à sable/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Effacer et commencer' }));

    expect(window.localStorage.getItem(WORLD_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
    expect(useGameStore.getState()).toMatchObject({
      newGameMode: GameMode.Sandbox,
      sessionStarted: true,
      startScreenOpen: false,
      sessionEpoch: 1,
    });
  });

  it('refuses a seed that is not a number', () => {
    render(<StartScreen />);

    fireEvent.change(screen.getByLabelText('Graine de la carte'), { target: { value: 'lune' } });
    fireEvent.click(screen.getByRole('button', { name: /^Nouvelle campagne/ }));

    expect(screen.getByText('La graine doit être un nombre entier.')).toBeInTheDocument();
    expect(useGameStore.getState().sessionStarted).toBe(false);
  });
});

describe('StartScreen over a running game', () => {
  beforeEach(() => {
    clearPersistedSession();
    window.localStorage.clear();
    const engine = new GameEngine(640, 480, { gameMode: GameMode.Campaign });
    engine.generateMap(5);
    useGameStore.setState({ engine, startScreenOpen: true, sessionStarted: true, sessionEpoch: 0, seedInput: '5' });
  });

  it('describes the live game and resumes it', () => {
    render(<StartScreen />);

    const resume = screen.getByRole('button', { name: /^Reprendre la partie/ });
    expect(resume).toHaveTextContent('Campagne · graine 5');
    fireEvent.click(resume);

    expect(useGameStore.getState().startScreenOpen).toBe(false);
    expect(useGameStore.getState().sessionEpoch).toBe(0);
  });

  it('keeps game shortcuts from firing under the menu, and Escape resumes', () => {
    const gameKeys = vi.fn();
    window.addEventListener('keydown', gameKeys);
    render(<StartScreen />);

    fireEvent.keyDown(window, { key: '1' });
    expect(gameKeys).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useGameStore.getState().startScreenOpen).toBe(false);
    window.removeEventListener('keydown', gameKeys);
  });

  it('always confirms a new game, since one is running', () => {
    render(<StartScreen />);

    fireEvent.click(screen.getByRole('button', { name: /^Nouvelle campagne/ }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(useGameStore.getState().startScreenOpen).toBe(true);
  });
});
