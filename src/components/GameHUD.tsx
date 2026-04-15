import { useState, useRef, useCallback } from 'react';
import { EXTRACTOR_BUILDING_TYPE_ID } from '@/game/data/buildingCatalog';
import { TileType } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

export function GameHUD() {
  const hoverTile = useGameStore((s) => s.hoverTile);
  const engine = useGameStore((s) => s.engine);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const setSelectedTool = useGameStore((s) => s.setSelectedTool);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<{ text: string; type: 'input' | 'output' | 'error' }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const extractorSelected =
    selectedTool.kind === 'building' && selectedTool.buildingType === EXTRACTOR_BUILDING_TYPE_ID;

  const executeCommand = useCallback(
    (cmd: string) => {
      if (!engine) {
        setHistory((h) => [...h, { text: cmd, type: 'input' }, { text: 'Engine not initialized', type: 'error' }]);
        return;
      }

      setHistory((h) => [...h, { text: `> ${cmd}`, type: 'input' }]);

      try {
        // Expose engine in the eval scope
        const fn = new Function('engine', `return ${cmd}`);
        const result = fn(engine);
        const output = result === undefined ? 'undefined' : JSON.stringify(result);
        setHistory((h) => [...h, { text: output, type: 'output' }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setHistory((h) => [...h, { text: msg, type: 'error' }]);
      }

      // Scroll to bottom after render
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
      });
    },
    [engine],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      executeCommand(input.trim());
      setInput('');
    }
  };

  const toggleExtractorTool = () => {
    setSelectedTool(
      extractorSelected
        ? { kind: 'tile', tile: TileType.Ground }
        : { kind: 'building', buildingType: EXTRACTOR_BUILDING_TYPE_ID },
    );
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 select-none">
      {consoleOpen && (
        <div className="absolute bottom-full right-3 mb-2 w-96 max-w-[calc(100vw-1.5rem)] bg-black/85 border border-white/20 rounded-xl overflow-hidden font-mono text-xs backdrop-blur-sm shadow-2xl">
          <div
            ref={scrollRef}
            className="h-48 overflow-y-auto p-2 space-y-0.5"
          >
            {history.length === 0 && (
              <div className="text-white/30">
                Use engine.placeResource(x, y, type), engine.removeResource(x, y), ...
              </div>
            )}
            {history.map((entry, i) => (
              <div
                key={i}
                className={
                  entry.type === 'input'
                    ? 'text-white/70'
                    : entry.type === 'error'
                      ? 'text-red-400'
                      : 'text-green-400'
                }
              >
                {entry.text}
              </div>
            ))}
          </div>
          <div className="border-t border-white/20 flex">
            <span className="text-white/50 px-2 py-1.5">&gt;</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-white outline-none py-1.5 pr-2"
              placeholder="engine.placeResource(10, 10, 1)"
              autoFocus
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-white/15 bg-black/70 px-3 py-2 text-white/85 backdrop-blur-md shadow-2xl">
        <div className="justify-self-start min-w-0">
          {hoverTile && (
            <div className="inline-flex bg-black/40 text-white/80 font-mono text-xs px-2 py-1 rounded-md">
              {hoverTile.x}, {hoverTile.y}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleExtractorTool}
          aria-pressed={extractorSelected}
          className={
            extractorSelected
              ? 'rounded-xl bg-amber-400 text-black font-semibold px-4 py-2 text-sm shadow-lg cursor-pointer transition-colors'
              : 'rounded-xl bg-white/10 hover:bg-white/20 text-white/90 px-4 py-2 text-sm cursor-pointer transition-colors'
          }
        >
          Extracteur
        </button>

        <div className="justify-self-end flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConsoleOpen((o) => !o)}
            aria-expanded={consoleOpen}
            className="bg-white/10 hover:bg-white/20 text-white/90 font-mono text-xs px-3 py-2 rounded-xl transition-colors cursor-pointer"
            title="Toggle console"
          >
            {consoleOpen ? 'Close' : '>_'}
          </button>
        </div>
      </div>
    </div>
  );
}
