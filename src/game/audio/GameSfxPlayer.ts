import type { GameSfxEvent } from '@/game/audio/sfxEvents';

interface ClipVariant {
  readonly url: string;
}

interface SfxCue {
  readonly family: string;
  readonly variants: readonly ClipVariant[];
  readonly gain: number;
  readonly rateMin: number;
  readonly rateMax: number;
  readonly cooldownMs: number;
  readonly maxVoices: number;
}

interface LoadedVariant {
  readonly url: string;
  readonly buffer: AudioBuffer;
}

interface AudioContextLike {
  readonly state: AudioContextState;
  readonly currentTime: number;
  readonly destination: AudioNode;
  createBufferSource(): AudioBufferSourceNode;
  createGain(): GainNode;
  decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer>;
  resume(): Promise<void>;
  close(): Promise<void>;
}

interface PlayerOptions {
  readonly random?: () => number;
  readonly now?: () => number;
  readonly contextFactory?: () => AudioContextLike;
  readonly fetcher?: typeof fetch;
}

const ONE_SHOT_CUES: Record<GameSfxEvent['type'], SfxCue | null> = {
  building_place_success: cue('build', [['/sfx/build/place_01.ogg', '/sfx/build/place_01.mp3']], 0.9, 0.97, 1.03, 35, 4),
  building_place_fail: cue('error_placement', [['/sfx/error/placement_01.ogg', '/sfx/error/placement_01.mp3']], 0.8, 0.98, 1.02, 70, 2),
  building_remove_success: cue('build_remove', [['/sfx/build/remove_01.ogg', '/sfx/build/remove_01.mp3']], 0.85, 0.96, 1.02, 35, 4),
  belt_place_success: cue('belt_place', [['/sfx/belt/place_01.ogg', '/sfx/belt/place_01.mp3']], 0.5, 0.97, 1.03, 35, 4),
  belt_place_fail: cue('error_belt', [['/sfx/error/belt_01.ogg', '/sfx/error/belt_01.mp3']], 0.8, 0.98, 1.02, 70, 2),
  energy_link_connect: cue('energy_link', [['/sfx/energy/link_connect_01.ogg', '/sfx/energy/link_connect_01.mp3']], 0.9, 0.98, 1.02, 35, 3),
  energy_link_disconnect: cue('energy_unlink', [['/sfx/energy/link_disconnect_01.ogg', '/sfx/energy/link_disconnect_01.mp3']], 0.85, 0.98, 1.02, 35, 3),
  energy_link_fail: cue('error_energy', [['/sfx/error/energy_01.ogg', '/sfx/error/energy_01.mp3']], 0.8, 0.98, 1.02, 80, 2),
  extractor_on: cue('extractor_on', [['/sfx/build/extract_tick_01.ogg', '/sfx/build/extract_tick_01.mp3']], 0.7, 0.97, 1.03, 500, 4),
  tool_select: cue('ui_select', [['/sfx/ui/select_01.ogg', '/sfx/ui/select_01.mp3']], 0.7, 0.98, 1.02, 45, 3),
  rotate_click: cue('ui_rotate', [['/sfx/ui/rotate_01.ogg', '/sfx/ui/rotate_01.mp3']], 0.7, 0.97, 1.03, 45, 2),
  cancel_pop: cue('ui_cancel', [['/sfx/error/cancel_01.ogg', '/sfx/error/cancel_01.mp3']], 0.7, 0.98, 1.02, 45, 2),
  ui_confirm: cue('ui_confirm', [['/sfx/ui/confirm_01.ogg', '/sfx/ui/confirm_01.mp3']], 0.8, 0.98, 1.02, 80, 2),
  ui_back: cue('ui_back', [['/sfx/ui/back_01.ogg', '/sfx/ui/back_01.mp3']], 0.65, 0.98, 1.02, 45, 2),
};

const MAX_GLOBAL_VOICES = 10;

function clips(urlPairs: readonly (readonly [string, string])[]): readonly ClipVariant[] {
  return urlPairs.map(([ogg, mp3]) => ({ url: `${ogg}|${mp3}` }));
}

function cue(
  family: string,
  urlPairs: readonly (readonly [string, string])[],
  gain: number,
  rateMin: number,
  rateMax: number,
  cooldownMs: number,
  maxVoices: number,
): SfxCue {
  return {
    family,
    variants: clips(urlPairs),
    gain,
    rateMin,
    rateMax,
    cooldownMs,
    maxVoices,
  };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function fallbackUrls(variantUrl: string): readonly string[] {
  const [first, second] = variantUrl.split('|');
  return second ? [first, second] : [variantUrl];
}

export class GameSfxPlayer {
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly contextFactory: () => AudioContextLike;
  private readonly fetcher: typeof fetch;

  private context: AudioContextLike | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.7;
  private destroyed = false;
  private loadingPromise: Promise<void> | null = null;
  private warnedUnavailable = false;

  private readonly loadedVariants = new Map<string, LoadedVariant>();
  private readonly lastPlayedAt = new Map<string, number>();
  private readonly activeByFamily = new Map<string, number>();
  private activeVoices = 0;

  private readonly unlockAudio = () => {
    void this.resumeContext();
  };

  constructor(initialVolume: number, options: PlayerOptions = {}) {
    this.volume = clamp01(initialVolume);
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => Date.now());
    this.contextFactory =
      options.contextFactory ??
      (() => {
        if (typeof window === 'undefined') {
          throw new Error('AudioContext is unavailable');
        }
        const audioContextCtor =
          window.AudioContext ??
          (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (typeof audioContextCtor !== 'function') {
          throw new Error('AudioContext is unavailable');
        }
        return new audioContextCtor();
      });
    this.fetcher = options.fetcher ?? fetch.bind(window);
  }

  setVolume(volume: number): void {
    this.volume = clamp01(volume);
    if (this.masterGain && this.context) {
      const gain = this.masterGain.gain;
      gain.setValueAtTime(this.volume, this.context.currentTime);
    }
  }

  start(): void {
    if (this.destroyed) return;
    this.attachUnlockListeners();
    void this.loadAllAudio();
  }

  destroy(): void {
    this.destroyed = true;
    this.detachUnlockListeners();
    this.loadedVariants.clear();
    this.lastPlayedAt.clear();
    this.activeByFamily.clear();
    this.activeVoices = 0;
    const context = this.context;
    this.context = null;
    this.masterGain = null;
    if (context) {
      void context.close().catch(() => {
        // Ignore close errors on teardown.
      });
    }
  }

  onEvent(event: GameSfxEvent): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    const cue = ONE_SHOT_CUES[event.type];
    if (!cue) return Promise.resolve();
    return this.playCue(cue);
  }

  async preload(): Promise<void> {
    if (this.destroyed) return;
    await this.loadAllAudio();
  }

  private attachUnlockListeners(): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('pointerdown', this.unlockAudio, { passive: true });
    window.addEventListener('keydown', this.unlockAudio);
    window.addEventListener('touchstart', this.unlockAudio, { passive: true });
  }

  private detachUnlockListeners(): void {
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointerdown', this.unlockAudio);
    window.removeEventListener('keydown', this.unlockAudio);
    window.removeEventListener('touchstart', this.unlockAudio);
  }

  private ensureAudioGraph(): void {
    if (this.context && this.masterGain) return;
    try {
      const context = this.contextFactory();
      const masterGain = context.createGain();
      masterGain.gain.value = this.volume;
      masterGain.connect(context.destination);
      this.context = context;
      this.masterGain = masterGain;
    } catch {
      this.context = null;
      this.masterGain = null;
      if (!this.warnedUnavailable) {
        this.warnedUnavailable = true;
        console.warn('[audio] SFX disabled: AudioContext unavailable in this environment.');
      }
    }
  }

  private async resumeContext(): Promise<void> {
    this.ensureAudioGraph();
    if (!this.context) return;
    if (this.context.state === 'suspended') {
      await this.context.resume().catch(() => {
        // Resume can fail before user gesture; ignore and retry later.
      });
    }
  }

  private async loadAllAudio(): Promise<void> {
    if (this.loadingPromise) return this.loadingPromise;
    this.ensureAudioGraph();
    if (!this.context) return;

    const uniqueVariantIds = new Set<string>();
    for (const cue of Object.values(ONE_SHOT_CUES)) {
      if (!cue) continue;
      for (const variant of cue.variants) uniqueVariantIds.add(variant.url);
    }

    this.loadingPromise = (async () => {
      await Promise.all(Array.from(uniqueVariantIds).map((variantId) => this.loadVariant(variantId)));
    })();

    await this.loadingPromise;
  }

  private async loadVariant(variantId: string): Promise<void> {
    if (this.loadedVariants.has(variantId)) return;
    const context = this.context;
    if (!context) return;

    for (const candidateUrl of fallbackUrls(variantId)) {
      try {
        const response = await this.fetcher(candidateUrl);
        if (!response.ok) continue;
        const bytes = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(bytes);
        this.loadedVariants.set(variantId, { url: candidateUrl, buffer });
        return;
      } catch {
        // Try next fallback URL.
      }
    }
  }

  private async playCue(cue: SfxCue): Promise<void> {
    await this.resumeContext();

    const context = this.context;
    const masterGain = this.masterGain;
    if (!context || !masterGain) {
      if (import.meta.env.DEV) console.warn(`[sfx] ${cue.family}: no audio context`);
      return;
    }

    if (this.activeVoices >= MAX_GLOBAL_VOICES) {
      if (import.meta.env.DEV) console.warn(`[sfx] ${cue.family}: global voice limit (${this.activeVoices}/${MAX_GLOBAL_VOICES})`);
      return;
    }

    const lastPlayed = this.lastPlayedAt.get(cue.family) ?? 0;
    if (this.now() - lastPlayed < cue.cooldownMs) {
      if (import.meta.env.DEV) console.warn(`[sfx] ${cue.family}: cooldown (${this.now() - lastPlayed}ms < ${cue.cooldownMs}ms)`);
      return;
    }

    const activeFamily = this.activeByFamily.get(cue.family) ?? 0;
    if (activeFamily >= cue.maxVoices) {
      if (import.meta.env.DEV) console.warn(`[sfx] ${cue.family}: family voice limit (${activeFamily}/${cue.maxVoices})`);
      return;
    }

    const variant = cue.variants[Math.floor(this.random() * cue.variants.length)] ?? cue.variants[0];
    if (!variant) return;

    await this.loadVariant(variant.url);
    const loaded = this.loadedVariants.get(variant.url);
    if (!loaded) {
      if (import.meta.env.DEV) console.warn(`[sfx] ${cue.family}: variant not loaded (${variant.url})`);
      return;
    }

    const source = context.createBufferSource();
    source.buffer = loaded.buffer;

    const gainNode = context.createGain();
    gainNode.gain.value = cue.gain;

    const min = Math.min(cue.rateMin, cue.rateMax);
    const max = Math.max(cue.rateMin, cue.rateMax);
    source.playbackRate.value = min + (max - min) * this.random();

    source.connect(gainNode);
    gainNode.connect(masterGain);

    this.lastPlayedAt.set(cue.family, this.now());
    this.activeVoices += 1;
    this.activeByFamily.set(cue.family, activeFamily + 1);

    source.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
      const current = this.activeByFamily.get(cue.family) ?? 1;
      if (current <= 1) this.activeByFamily.delete(cue.family);
      else this.activeByFamily.set(cue.family, current - 1);
      source.onended = null;
    };

    source.start();
  }

}
