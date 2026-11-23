import type { GameEngine } from '../engine/GameEngine';
import { GRID_HEIGHT, GRID_WIDTH, TILE_SIZE } from '../constants';
import { digitOf } from './keyboardShortcuts';

export interface KeyboardState {
  keysPressed: Set<string>;
  shiftPressed: boolean;
}

type PanDirection = 'up' | 'down' | 'left' | 'right';

/** Physical keys (layout-independent): WASD on QWERTY is ZQSD on AZERTY. */
const PAN_BY_CODE: Readonly<Record<string, PanDirection>> = {
  KeyW: 'up',
  KeyS: 'down',
  KeyA: 'left',
  KeyD: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** Fallback when the event carries no physical code (synthetic events, some remote keyboards). */
const PAN_BY_KEY: Readonly<Record<string, PanDirection>> = {
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
};

const MODIFIER_KEYS: ReadonlySet<string> = new Set(['meta', 'control', 'alt', 'os']);

function panDirectionOf(e: KeyboardEvent): PanDirection | null {
  if (e.code) return PAN_BY_CODE[e.code] ?? null;
  return PAN_BY_KEY[e.key.toLowerCase()] ?? null;
}

export class KeyboardHandler {
  /** Screen pixels per second, whatever the display refresh rate. */
  private static readonly PAN_SPEED_PX_PER_S = 3000;
  /** A frame longer than this (tab switch, hitch) pans as if it had lasted this long. */
  private static readonly MAX_FRAME_SECONDS = 0.1;
  private static readonly FIRST_FRAME_SECONDS = 1 / 60;

  private readonly engine: GameEngine;
  private keyboardState: KeyboardState = { keysPressed: new Set(), shiftPressed: false };
  private animationFrameId: number | null = null;
  private lastFrameAt: number | null = null;
  private isInitialized = false;

  constructor(engine: GameEngine) {
    this.engine = engine;
  }

  private readonly handleKeyDown = (e: KeyboardEvent): void => {
    if (this.isInputFocused()) return;

    const key = e.key.toLowerCase();
    if (key === 'shift') {
      this.keyboardState.shiftPressed = true;
      return;
    }

    // Browser and system shortcuts (Cmd+D, Ctrl+S, Alt+Tab) are not ours, and
    // the keyup of a key pressed with Cmd never arrives on macOS: a key held
    // when a modifier comes down is released rather than left stuck.
    if (e.metaKey || e.ctrlKey || e.altKey || MODIFIER_KEYS.has(key)) {
      this.releaseAllKeys();
      return;
    }

    if (key === ' ' || key === 'spacebar') {
      e.preventDefault();
      this.centerViewport();
      return;
    }

    // The top row belongs to the toolbar, even where it types `-` or `_` (AZERTY).
    if (digitOf(e) !== null) return;

    if (key === '+' || key === '=') {
      e.preventDefault();
      this.zoomIn();
      return;
    }

    if (key === '-' || key === '_') {
      e.preventDefault();
      this.zoomOut();
      return;
    }

    const direction = panDirectionOf(e);
    if (direction === null) return;
    this.keyboardState.keysPressed.add(direction);
    if (this.animationFrameId === null) {
      this.startAnimationLoop();
    }
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    if (key === 'shift') {
      this.keyboardState.shiftPressed = false;
      return;
    }

    const direction = panDirectionOf(e);
    if (direction !== null) this.keyboardState.keysPressed.delete(direction);
  };

  /** The window lost focus or the tab was hidden: the keyups will never come. */
  private readonly releaseAllKeys = (): void => {
    this.keyboardState.keysPressed.clear();
    this.keyboardState.shiftPressed = false;
  };

  initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.releaseAllKeys);
    document.addEventListener('visibilitychange', this.releaseAllKeys);
  }

  private isInputFocused(): boolean {
    const activeElement = document.activeElement;
    return (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      activeElement instanceof HTMLSelectElement ||
      (activeElement instanceof HTMLElement && activeElement.isContentEditable)
    );
  }

  private startAnimationLoop(): void {
    this.lastFrameAt = null;
    const animate = (now: number) => {
      const elapsedSeconds =
        this.lastFrameAt === null
          ? KeyboardHandler.FIRST_FRAME_SECONDS
          : Math.min(Math.max(0, (now - this.lastFrameAt) / 1000), KeyboardHandler.MAX_FRAME_SECONDS);
      this.lastFrameAt = now;
      this.handleContinuousInput(elapsedSeconds);
      if (this.keyboardState.keysPressed.size > 0) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.animationFrameId = null;
      }
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  private handleContinuousInput(elapsedSeconds: number): void {
    const { keysPressed } = this.keyboardState;
    const step = KeyboardHandler.PAN_SPEED_PX_PER_S * elapsedSeconds;

    if (keysPressed.has('up')) {
      this.engine.viewport.pan(0, -step);
    }
    if (keysPressed.has('down')) {
      this.engine.viewport.pan(0, step);
    }
    if (keysPressed.has('left')) {
      this.engine.viewport.pan(-step, 0);
    }
    if (keysPressed.has('right')) {
      this.engine.viewport.pan(step, 0);
    }
  }

  private centerViewport(): void {
    // restore() clamps and notifies listeners so the view actually redraws.
    this.engine.viewport.restore({
      centerX: (GRID_WIDTH * TILE_SIZE) / 2,
      centerY: (GRID_HEIGHT * TILE_SIZE) / 2,
      zoom: 1,
    });
  }

  private zoomIn(): void {
    const factor = 1.1;
    this.engine.viewport.zoomAt(
      this.engine.viewport.screenWidth / 2,
      this.engine.viewport.screenHeight / 2,
      factor
    );
  }

  private zoomOut(): void {
    const factor = 1 / 1.1;
    this.engine.viewport.zoomAt(
      this.engine.viewport.screenWidth / 2,
      this.engine.viewport.screenHeight / 2,
      factor
    );
  }

  getKeyboardState(): KeyboardState {
    return { ...this.keyboardState };
  }

  destroy(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.releaseAllKeys);
    document.removeEventListener('visibilitychange', this.releaseAllKeys);
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.releaseAllKeys();
    this.isInitialized = false;
  }
}
