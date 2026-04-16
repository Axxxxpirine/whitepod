import { useEffect, useRef } from 'react';
import { GameMusicPlayer } from '@/game/audio/GameMusicPlayer';
import { useGameStore } from '@/store/useGameStore';

const TRACKS = [
  '/music/whitepod-track-06.mp3',
  '/music/whitepod-track-01.mp3',
  '/music/whitepod-track-02.mp3',
  '/music/whitepod-track-03.mp3',
  '/music/whitepod-track-04.mp3',
  '/music/whitepod-track-05.mp3',
  '/music/whitepod-track-07.mp3',
  '/music/whitepod-track-08.mp3',
  '/music/whitepod-track-09.mp3',
  '/music/whitepod-track-10.mp3',
] as const;

export function GameMusicController() {
  const musicVolume = useGameStore((s) => s.musicVolume);
  const playerRef = useRef<GameMusicPlayer | null>(null);
  const initialVolumeRef = useRef(musicVolume);

  useEffect(() => {
    const player = new GameMusicPlayer(TRACKS, initialVolumeRef.current);
    playerRef.current = player;
    player.start();

    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, []);

  useEffect(() => {
    playerRef.current?.setVolume(musicVolume);
  }, [musicVolume]);

  return null;
}
