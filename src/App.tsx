import { GameCanvas } from '@/components/GameCanvas';
import { GameHUD } from '@/components/GameHUD';

function App() {
  return (
    <div className="relative h-screen w-screen">
      <GameCanvas />
      <GameHUD />
    </div>
  );
}

export default App;
