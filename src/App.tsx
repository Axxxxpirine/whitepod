import { GameCanvas } from '@/components/GameCanvas';
import { GameHUD } from '@/components/GameHUD';
import { GameMusicController } from '@/components/GameMusicController';
import { GameSfxController } from '@/components/GameSfxController';

function App() {
  return (
    <div className="relative h-screen w-screen">
      <GameMusicController />
      <GameSfxController />
      <GameCanvas />
      <GameHUD />
    </div>
  );
}

export default App;
