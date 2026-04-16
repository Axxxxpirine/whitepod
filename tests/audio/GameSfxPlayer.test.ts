import { describe, expect, it, vi } from 'vitest';
import { GameSfxPlayer } from '@/game/audio/GameSfxPlayer';

class FakeAudioParam {
  value = 1;
  setValueAtTime(value: number, _time: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number, _time: number): void {
    this.value = value;
  }
}

class FakeGainNode {
  gain = new FakeAudioParam();
  connect(_target: unknown): void {
    // noop
  }
}

class FakeBufferSourceNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  playbackRate = new FakeAudioParam();
  private readonly starts: number[];
  private readonly autoEnd: boolean;

  constructor(starts: number[], autoEnd: boolean) {
    this.starts = starts;
    this.autoEnd = autoEnd;
  }

  connect(_target: unknown): void {
    // noop
  }

  start(): void {
    this.starts.push(1);
    if (this.autoEnd) {
      this.onended?.();
    }
  }

  stop(): void {
    this.onended?.();
  }
}

class FakeAudioContext {
  state: AudioContextState = 'running';
  currentTime = 0;
  destination = {} as AudioNode;

  readonly starts: number[] = [];
  private readonly autoEnd: boolean;

  constructor(autoEnd: boolean) {
    this.autoEnd = autoEnd;
  }

  createBufferSource(): AudioBufferSourceNode {
    return new FakeBufferSourceNode(this.starts, this.autoEnd) as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    return new FakeGainNode() as unknown as GainNode;
  }

  async decodeAudioData(_audioData: ArrayBuffer): Promise<AudioBuffer> {
    return {} as AudioBuffer;
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async close(): Promise<void> {
    this.state = 'closed';
  }
}

function okResponse(): Response {
  return {
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4),
  } as Response;
}

describe('GameSfxPlayer', () => {
  it('enforces cooldown per family', async () => {
    let now = 1000;
    const ctx = new FakeAudioContext(true);
    const fetcher = vi.fn(async () => okResponse());
    const player = new GameSfxPlayer(0.7, {
      now: () => now,
      random: () => 0,
      contextFactory: () => ctx,
      fetcher,
    });

    player.start();
    await player.preload();

    await player.onEvent({ type: 'tool_select', tool: 'select' });
    await player.onEvent({ type: 'tool_select', tool: 'select' });

    expect(ctx.starts.length).toBe(1);

    now += 60;
    await player.onEvent({ type: 'tool_select', tool: 'select' });
    expect(ctx.starts.length).toBe(2);

    player.destroy();
  });

  it('caps simultaneous voices per family', async () => {
    let now = 1000;
    const ctx = new FakeAudioContext(false);
    const fetcher = vi.fn(async () => okResponse());
    const player = new GameSfxPlayer(0.7, {
      now: () => now,
      random: () => 0,
      contextFactory: () => ctx,
      fetcher,
    });

    player.start();
    await player.preload();

    await player.onEvent({ type: 'cancel_pop' });
    now += 100;
    await player.onEvent({ type: 'cancel_pop' });
    now += 100;
    await player.onEvent({ type: 'cancel_pop' });

    expect(ctx.starts.length).toBe(2);

    player.destroy();
  });

  it('falls back to mp3 when ogg cannot be fetched', async () => {
    const ctx = new FakeAudioContext(true);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('.ogg')) {
        return { ok: false } as Response;
      }
      return okResponse();
    });

    const player = new GameSfxPlayer(0.7, {
      random: () => 0,
      contextFactory: () => ctx,
      fetcher,
    });

    player.start();
    await player.preload();
    await player.onEvent({ type: 'ui_confirm', context: 'reset_session' });

    const fetchedUrls = fetcher.mock.calls.map((args) => String(args[0]));
    expect(fetchedUrls.some((url) => url.endsWith('.ogg'))).toBe(true);
    expect(fetchedUrls.some((url) => url.endsWith('.mp3'))).toBe(true);
    expect(ctx.starts.length).toBe(1);

    player.destroy();
  });
});
