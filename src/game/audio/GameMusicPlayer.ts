function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export class GameMusicPlayer {
  private readonly audio: HTMLAudioElement;
  private readonly tracks: readonly string[];
  private readonly unlockPlay: () => void;
  private currentIndex = -1;
  private destroyed = false;

  constructor(tracks: readonly string[], initialVolume: number) {
    this.tracks = tracks;
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = clampVolume(initialVolume);
    this.audio.addEventListener('ended', this.handleTrackEnded);

    this.unlockPlay = () => {
      if (this.destroyed || this.audio.ended || !this.audio.paused) {
        return;
      }
      void this.audio.play().catch(() => {
        // Ignore autoplay failure until another user gesture occurs.
      });
    };
  }

  start(): void {
    if (this.destroyed || this.tracks.length === 0) {
      return;
    }

    this.playInitialTrack();
    window.addEventListener('pointerdown', this.unlockPlay, { passive: true });
    window.addEventListener('keydown', this.unlockPlay);
    window.addEventListener('touchstart', this.unlockPlay, { passive: true });
  }

  setVolume(volume: number): void {
    this.audio.volume = clampVolume(volume);
  }

  destroy(): void {
    this.destroyed = true;
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.audio.removeEventListener('ended', this.handleTrackEnded);
    window.removeEventListener('pointerdown', this.unlockPlay);
    window.removeEventListener('keydown', this.unlockPlay);
    window.removeEventListener('touchstart', this.unlockPlay);
  }

  private readonly handleTrackEnded = () => {
    this.playNextTrack();
  };

  private playInitialTrack(): void {
    this.playTrack(0);
  }

  private playNextTrack(): void {
    if (this.tracks.length === 0 || this.destroyed) {
      return;
    }

    const nextIndex = this.pickNextTrackIndex();
    this.playTrack(nextIndex);
  }

  private playTrack(index: number): void {
    if (this.destroyed || this.tracks.length === 0) {
      return;
    }

    this.currentIndex = index;
    this.audio.src = this.tracks[index];
    this.audio.currentTime = 0;
    this.audio.load();
    this.audio.addEventListener('canplay', this.unlockPlay, { once: true });
    this.unlockPlay();
  }

  private pickNextTrackIndex(): number {
    if (this.tracks.length === 1) {
      return 0;
    }

    let candidate = this.currentIndex;
    while (candidate === this.currentIndex) {
      candidate = Math.floor(Math.random() * this.tracks.length);
    }
    return candidate;
  }
}
