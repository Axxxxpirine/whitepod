import { useState, useRef, useCallback } from 'react';
import { useGameStore } from '@/store/useGameStore';

export function GameHUD() {
  const hoverTile = useGameStore((s) => s.hoverTile);
  const engine = useGameStore((s) => s.engine);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<{ text: string; type: 'input' | 'output' | 'error' }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="fixed bottom-3 right-3 flex items-end gap-2 z-50 select-none">
      {/* Console panel */}
      {consoleOpen && (
        <div className="w-96 bg-black/85 border border-white/20 rounded-lg overflow-hidden font-mono text-xs backdrop-blur-sm">
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

      {/* Bottom bar: coordinates + console toggle */}
      <div className="flex items-center gap-2">
        {hoverTile && (
          <div className="bg-black/70 text-white/80 font-mono text-xs px-2 py-1 rounded backdrop-blur-sm">
            {hoverTile.x}, {hoverTile.y}
          </div>
        )}
        <button
          onClick={() => setConsoleOpen((o) => !o)}
          className="bg-black/70 hover:bg-black/90 text-white/80 font-mono text-xs px-2.5 py-1 rounded backdrop-blur-sm transition-colors cursor-pointer"
          title="Toggle console"
        >
          {consoleOpen ? 'Close' : '>_'}
        </button>
      </div>
    </div>
  );
}
