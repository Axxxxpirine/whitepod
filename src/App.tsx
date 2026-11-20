import { GameCanvas } from '@/components/GameCanvas';
import { GameHUD } from '@/components/GameHUD';
import { GameMusicController } from '@/components/GameMusicController';
import { GameSfxController } from '@/components/GameSfxController';
import { StartScreen } from '@/components/StartScreen';
import { useGameStore } from '@/store/useGameStore';

function App() {
  // No world loads before the player picks Continue, New campaign or Sandbox:
  // mounting the canvas first would create and save a sandbox world.
  const sessionStarted = useGameStore((s) => s.sessionStarted);
  const startScreenOpen = useGameStore((s) => s.startScreenOpen);

  return (
    <div className="relative h-screen w-screen">
      <GameMusicController />
      <GameSfxController />
      {sessionStarted && (
        <>
          <GameCanvas />
          <GameHUD />
        </>
      )}
      {startScreenOpen && <StartScreen />}
    </div>
  );
}

export default App;
