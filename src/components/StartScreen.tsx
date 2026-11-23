import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { parseSeedInput } from '@/game/bot/seedInput';
import { GameMode } from '@/game/data/gameMode';
import { readSavedSessionSummary } from '@/game/persistence/sessionStorage';
import { isWorldStorageEvent } from '@/game/persistence/sessionSlots';
import { describeSession, gameModeLabel, summarizeEngine } from '@/game/ui/sessionPresentation';
import { useGameStore } from '@/store/useGameStore';
import { cn } from '@/lib/utils';

/** Ghosted tile grid behind the menu (DESIGN.md: hairline grid, intentional decoration). */
const GRID_BACKGROUND: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(var(--color-grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-grid-line) 1px, transparent 1px)',
  backgroundSize: '32px 32px',
};

interface MenuItemProps {
  readonly title: string;
  readonly detail: ReactNode;
  readonly onClick: () => void;
  readonly autoFocus?: boolean;
  /** Shown but inert (e.g. a new game while the seed is not a number). */
  readonly disabled?: boolean;
}

function MenuItem({ title, detail, onClick, autoFocus, disabled = false }: MenuItemProps) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      autoFocus={autoFocus}
      aria-disabled={disabled || undefined}
      className={cn(
        'flex w-full flex-col items-start gap-0.5 border-b border-l-2 border-b-border border-l-transparent',
        'px-3 py-3 text-left transition-colors duration-[var(--duration-hover)] focus-visible:outline-none',
        disabled
          ? 'cursor-not-allowed opacity-50 focus-visible:border-l-border'
          : 'cursor-pointer hover:border-l-accent hover:bg-surface focus-visible:border-l-accent focus-visible:bg-surface',
      )}
    >
      <span className="text-sm font-medium text-ink">{title}</span>
      <span className="text-xs text-ink-muted">{detail}</span>
    </button>
  );
}

/**
 * Entry point of the game: Continue (when a game exists), New campaign,
 * Sandbox. Shown at boot before any world loads, and over the running game
 * from the settings menu. Starting a new game over an existing one asks first.
 */
export function StartScreen() {
  const sessionStarted = useGameStore((s) => s.sessionStarted);
  const engine = useGameStore((s) => s.engine);
  const saveTakenOver = useGameStore((s) => s.saveTakenOver);
  const saveUnreadable = useGameStore((s) => s.saveUnreadable);
  const storedSeed = useGameStore((s) => s.seedInput);
  const resumeSession = useGameStore((s) => s.resumeSession);
  const startNewGame = useGameStore((s) => s.startNewGame);

  // At boot the save is the only game; in play, the live engine is fresher.
  const [savedAtBoot, setSavedAtBoot] = useState(() => (sessionStarted ? null : readSavedSessionSummary()));
  useEffect(() => {
    if (sessionStarted) return;
    const refreshSave = (event: StorageEvent) => {
      if (isWorldStorageEvent(event.key)) setSavedAtBoot(readSavedSessionSummary());
    };
    window.addEventListener('storage', refreshSave);
    return () => window.removeEventListener('storage', refreshSave);
  }, [sessionStarted]);
  const current = sessionStarted && engine ? summarizeEngine(engine) : savedAtBoot;
  const [seed, setSeed] = useState(storedSeed);
  const [pendingMode, setPendingMode] = useState<GameMode | null>(null);
  const seedValid = parseSeedInput(seed) !== null;
  const seedId = useId();
  const seedHintId = useId();

  // The old Reset flow sounded its confirmation and cancel; keep that in play.
  const confirmNewGame = (mode: GameMode) => {
    engine?.emitSfx({ type: 'ui_confirm', context: 'reset_session' });
    startNewGame(mode, seed);
  };
  const cancelNewGame = useCallback(() => {
    engine?.emitSfx({ type: 'ui_back', context: 'reset_session' });
    setPendingMode(null);
  }, [engine]);

  const choose = (mode: GameMode) => {
    if (!seedValid) return;
    if (current) setPendingMode(mode);
    else startNewGame(mode, seed);
  };

  // Modal: game shortcuts (tools, camera) must not fire under the menu.
  // Escape backs out of the confirmation, then out of the menu when in play.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (pendingMode) cancelNewGame();
      else if (sessionStarted) resumeSession();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true });
  }, [pendingMode, sessionStarted, resumeSession, cancelNewGame]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="start-screen-title"
      className={cn(
        'pointer-events-auto fixed inset-0 z-[60] flex items-center overflow-y-auto select-none',
        sessionStarted ? 'bg-bg/90 backdrop-blur-md' : 'bg-bg',
      )}
    >
      <div className="pointer-events-none absolute inset-0 opacity-40" style={GRID_BACKGROUND} aria-hidden="true" />

      <div className="relative w-full max-w-[380px] px-4 sm:ml-[8vw]">
        <p className="label text-ink-muted">Avant-poste lunaire</p>
        <h1 id="start-screen-title" className="panel-title text-[32px] leading-[1.15] text-ink">
          Whitepod
        </h1>
        <p className="mt-1 text-[11px] text-ink-muted">Architecte d'un système automatisé</p>

        {saveTakenOver && (
          <p role="status" className="mt-2 text-xs text-ink-muted">La partie a été ouverte dans un autre onglet.</p>
        )}

        {saveUnreadable && (
          <p role="alert" className="mt-2 text-xs text-accent-warm">
            La partie enregistrée n'a pas pu être relue. Elle est conservée ; une nouvelle partie la remplacera.
          </p>
        )}

        {pendingMode ? (
          <div role="alertdialog" aria-labelledby="start-screen-confirm" className="mt-8 border-t border-border pt-4">
            <p id="start-screen-confirm" className="text-sm text-ink">
              Commencer une partie en {gameModeLabel(pendingMode).toLowerCase()} efface la partie en cours.
            </p>
            {current && <p className="mt-1 tabular-nums text-xs text-ink-muted">{describeSession(current)}</p>}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => confirmNewGame(pendingMode)}
                className="label cursor-pointer rounded-sm border border-error bg-error/10 px-3 py-1.5 text-error transition-colors hover:bg-error/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-error"
              >
                Effacer et commencer
              </button>
              <button
                type="button"
                onClick={cancelNewGame}
                className="label cursor-pointer rounded-sm border border-border bg-surface px-3 py-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <>
            <nav aria-label="Menu principal" className="mt-8 flex flex-col border-t border-border">
              {current && (
                <MenuItem
                  title={sessionStarted ? 'Reprendre la partie' : 'Continuer'}
                  detail={<span className="tabular-nums">{describeSession(current)}</span>}
                  onClick={resumeSession}
                  autoFocus
                />
              )}
              <MenuItem
                title="Nouvelle campagne"
                detail="La base réclame des livraisons, chaque palier débloque la suite"
                onClick={() => choose(GameMode.Campaign)}
                autoFocus={!current}
                disabled={!seedValid}
              />
              <MenuItem
                title="Bac à sable"
                detail="Tout est débloqué, construire est gratuit"
                onClick={() => choose(GameMode.Sandbox)}
                disabled={!seedValid}
              />
            </nav>

            <div className="mt-6 flex flex-col gap-1">
              <label htmlFor={seedId} className="label text-ink-muted">
                Graine de la carte
              </label>
              <input
                id={seedId}
                type="text"
                inputMode="numeric"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                aria-invalid={!seedValid}
                aria-describedby={seedHintId}
                className={cn(
                  'w-32 rounded-sm border bg-surface px-2 py-1 tabular-nums text-sm text-ink outline-none',
                  seedValid ? 'border-border focus:border-accent' : 'border-accent-warm',
                )}
              />
              <span id={seedHintId} className={cn('text-[11px]', seedValid ? 'text-ink-muted' : 'text-accent-warm')}>
                {seedValid ? 'Pour une nouvelle partie. Même graine, même carte.' : 'La graine doit être un nombre entier.'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
