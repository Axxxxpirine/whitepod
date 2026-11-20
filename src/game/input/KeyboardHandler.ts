import type { GameEngine } from '../engine/GameEngine';
import { isoWorldCenter } from '../engine/IsoTransform';

export interface KeyboardState {
  keysPressed: Set<string>;
  shiftPressed: boolean;
}

export class KeyboardHandler {
  private readonly engine: GameEngine;
  private keyboardState: KeyboardState = { keysPressed: new Set(), shiftPressed: false };
  private animationFrameId: number | null = null;
  private readonly panSpeed = 50;
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

    if (key === ' ' || key === 'spacebar') {
      e.preventDefault();
      this.centerViewport();
      return;
    }

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

    this.keyboardState.keysPressed.add(key);
    if (!this.animationFrameId) {
      this.startAnimationLoop();
    }
  };

  private readonly handleKeyUp = (e: KeyboardEvent): void => {
    const key = e.key.toLowerCase();
    if (key === 'shift') {
      this.keyboardState.shiftPressed = false;
      return;
    }

    this.keyboardState.keysPressed.delete(key);
  };

  initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
  }

  private isInputFocused(): boolean {
    const activeElement = document.activeElement;
    return (
      activeElement instanceof HTMLInputElement ||
      activeElement instanceof HTMLTextAreaElement ||
      (activeElement instanceof HTMLElement && activeElement.isContentEditable)
    );
  }

  private startAnimationLoop(): void {
    const animate = () => {
      this.handleContinuousInput();
      if (this.keyboardState.keysPressed.size > 0) {
        this.animationFrameId = requestAnimationFrame(animate);
      } else {
        this.animationFrameId = null;
      }
    };
    this.animationFrameId = requestAnimationFrame(animate);
  }

  private handleContinuousInput(): void {
    const { keysPressed } = this.keyboardState;
    // Pan in screen pixels per frame: screen-aligned, so it works the same in iso.
    const step = this.panSpeed;

    if (keysPressed.has('w') || keysPressed.has('arrowup')) {
      this.engine.viewport.pan(0, -step);
    }
    if (keysPressed.has('s') || keysPressed.has('arrowdown')) {
      this.engine.viewport.pan(0, step);
    }
    if (keysPressed.has('a') || keysPressed.has('arrowleft')) {
      this.engine.viewport.pan(-step, 0);
    }
    if (keysPressed.has('d') || keysPressed.has('arrowright')) {
      this.engine.viewport.pan(step, 0);
    }
  }

  private centerViewport(): void {
    const center = isoWorldCenter();
    // restore() clamps and notifies listeners so the view actually redraws.
    this.engine.viewport.restore({ centerX: center.wx, centerY: center.wy, zoom: 1 });
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
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.keyboardState.keysPressed.clear();
    this.isInitialized = false;
  }
}
