import type { GameEngine } from '../engine/GameEngine';
import { GRID_WIDTH, GRID_HEIGHT, TILE_SIZE } from '../constants';

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

  initialize(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const handleKeyDown = (e: KeyboardEvent) => {
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

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'shift') {
        this.keyboardState.shiftPressed = false;
        return;
      }

      this.keyboardState.keysPressed.delete(key);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
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
    const TILE_PAN_SPEED = this.panSpeed / TILE_SIZE;

    if (keysPressed.has('w') || keysPressed.has('arrowup')) {
      this.engine.viewport.pan(0, -TILE_PAN_SPEED * TILE_SIZE);
    }
    if (keysPressed.has('s') || keysPressed.has('arrowdown')) {
      this.engine.viewport.pan(0, TILE_PAN_SPEED * TILE_SIZE);
    }
    if (keysPressed.has('a') || keysPressed.has('arrowleft')) {
      this.engine.viewport.pan(-TILE_PAN_SPEED * TILE_SIZE, 0);
    }
    if (keysPressed.has('d') || keysPressed.has('arrowright')) {
      this.engine.viewport.pan(TILE_PAN_SPEED * TILE_SIZE, 0);
    }
  }

  private centerViewport(): void {
    this.engine.viewport.centerX = (GRID_WIDTH * TILE_SIZE) / 2;
    this.engine.viewport.centerY = (GRID_HEIGHT * TILE_SIZE) / 2;
    this.engine.viewport.zoom = 1;
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
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.isInitialized = false;
  }
}
