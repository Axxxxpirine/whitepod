import { GameCanvas } from '@/components/GameCanvas';
import { GameHUD } from '@/components/GameHUD';

function App() {
  return (
    <div className="w-screen h-screen">
      <GameCanvas />
      <GameHUD />
    </div>
  );
}

export default App;
