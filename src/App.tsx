import { GameCanvas } from '@/components/GameCanvas';
import { GameHUD } from '@/components/GameHUD';
import { GameMusicController } from '@/components/GameMusicController';

function App() {
  return (
    <div className="relative h-screen w-screen">
      <GameMusicController />
      <GameCanvas />
      <GameHUD />
    </div>
  );
}

export default App;
