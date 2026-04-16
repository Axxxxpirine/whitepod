import { useEffect, useRef } from 'react';
import { GameSfxPlayer } from '@/game/audio/GameSfxPlayer';
import { useGameStore } from '@/store/useGameStore';

export function GameSfxController() {
  const engine = useGameStore((s) => s.engine);
  const sfxVolume = useGameStore((s) => s.sfxVolume);

  const playerRef = useRef<GameSfxPlayer | null>(null);

  useEffect(() => {
    const player = new GameSfxPlayer(sfxVolume);
    playerRef.current = player;
    player.start();
    void player.preload();

    return () => {
      player.destroy();
      playerRef.current = null;
    };
    // mount once; volume sync is handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    playerRef.current?.setVolume(sfxVolume);
  }, [sfxVolume]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    const unsubscribe = engine?.subscribeSfx((event) => {
      void player.onEvent(event);
    });

    return () => {
      unsubscribe?.();
    };
  }, [engine]);

  return null;
}
