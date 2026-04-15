import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Settings, Zap } from 'lucide-react';
import { getBuildingType } from '@/game/data/buildingCatalog';
import { useGameStore } from '@/store/useGameStore';
import { SelectedBuildingPanel } from './hud/SelectedBuildingPanel';
import { BuildingPicker } from './hud/BuildingPicker';
import { ToolModeIndicator } from './hud/ToolModeIndicator';

export function GameHUD() {
  const hoverTile = useGameStore((s) => s.hoverTile);
  const engine = useGameStore((s) => s.engine);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const simulationTime = useGameStore((s) => s.simulationTime);
  const simulationSpeed = useGameStore((s) => s.simulationSpeed);
const pendingEnergyLinkSource = useGameStore((s) => s.pendingEnergyLinkSource);
  const energyVersion = useGameStore((s) => s.engine?.energyNetwork.version ?? 0);
  const linkSolarOnPlacement = useGameStore((s) => s.linkSolarOnPlacement);
  const setSimulationTime = useGameStore((s) => s.setSimulationTime);
  const setSimulationSpeed = useGameStore((s) => s.setSimulationSpeed);
const resetSession = useGameStore((s) => s.resetSession);
  const setLinkSolarOnPlacement = useGameStore((s) => s.setLinkSolarOnPlacement);

  const [worldTick, setWorldTick] = useState(0);
  useEffect(() => {
    if (!engine) return;
    return engine.subscribe((kind) => {
      if (kind === 'world') setWorldTick((t) => t + 1);
    });
  }, [engine]);

  const [consoleOpen, setConsoleOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<{ text: string; type: 'input' | 'output' | 'error' }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const energyLinkSelected = selectedTool.kind === 'energy_link';

  const pendingEnergyLinkSourceName = useMemo(() => {
    if (!engine || pendingEnergyLinkSource === null) return null;
    const source = engine.getBuildings().get(pendingEnergyLinkSource);
    if (!source) return null;
    return getBuildingType(source.typeId)?.name ?? null;
  }, [engine, pendingEnergyLinkSource]);
const globalEnergy = useMemo(() => {
    void energyVersion;
    void worldTick;
    return engine ? engine.getEnergyGlobalStats() : null;
  }, [engine, energyVersion, worldTick]);
  const energyStorage = useMemo(() => {
    void energyVersion;
    void worldTick;
    return engine ? engine.getEnergyStorageTotals() : null;
  }, [engine, energyVersion, worldTick]);
  const simulationClockLabel = useMemo(() => formatSimulationTime(simulationTime), [simulationTime]);
  const isDaylight = simulationTime >= 0.25 && simulationTime < 0.75;
  const simulationHour = Math.floor((((simulationTime % 1) + 1) % 1) * 24);
  const simulationPhase =
    simulationHour < 6 ? 'Nuit' : simulationHour < 12 ? 'Matin' : simulationHour < 18 ? 'Jour' : 'Soir';

  const resourceCounts = useMemo(() => {
    void worldTick;
    return engine?.getResourceCounts() ?? null;
  }, [engine, worldTick]);

  const resourceRates = useMemo(() => {
    void worldTick;
    void energyVersion;
    return engine?.getResourceRates() ?? null;
  }, [engine, worldTick, energyVersion]);

  const executeCommand = useCallback(
    (cmd: string) => {
      if (!engine) {
        setHistory((h) => [...h, { text: cmd, type: 'input' }, { text: 'Engine not initialized', type: 'error' }]);
        return;
      }

      setHistory((h) => [...h, { text: `> ${cmd}`, type: 'input' }]);

      try {
        const fn = new Function('engine', `return ${cmd}`);
        const result = fn(engine);
        const output = result === undefined ? 'undefined' : JSON.stringify(result);
        setHistory((h) => [...h, { text: output, type: 'output' }]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setHistory((h) => [...h, { text: msg, type: 'error' }]);
      }

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

  useEffect(() => {
    if (!settingsOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [settingsOpen]);

  const handleResetSession = () => {
    if (!window.confirm('Reset the current session and start a new game?')) {
      return;
    }
    resetSession();
  };

  const applySimulationTime = useCallback(
    (value: number) => {
      if (!engine) return;
      engine.setSimulationTime(value);
      setSimulationTime(engine.simulationTime);
    },
    [engine, setSimulationTime],
  );

  return (
    <div className="pointer-events-none fixed inset-0 z-50 select-none">
      {engine && (
        <div className="pointer-events-auto absolute top-3 left-3">
          <div className="min-w-[180px] rounded-xl border border-white/15 bg-black/75 px-3 py-2.5 text-sm text-white/90 shadow-xl backdrop-blur-md">
            {resourceCounts && (
              <>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Ressources
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <img src="sprites/coal.png" className="h-4 w-4 object-contain" alt="Charbon" />
                    <span className="font-bold">{resourceCounts.coal}</span>
                    <span className="text-xs text-white/40">{resourceRates?.coal ?? 0} /min</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <img src="sprites/iron-ore.png" className="h-4 w-4 object-contain" alt="Minerai de fer" />
                    <span className="font-bold">{resourceCounts.ironOre}</span>
                    <span className="text-xs text-white/40">{resourceRates?.ironOre ?? 0} /min</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <img src="sprites/copper-ore.png" className="h-4 w-4 object-contain" alt="Cuivre" />
                    <span className="font-bold">{resourceCounts.copperOre}</span>
                    <span className="text-xs text-white/40">{resourceRates?.copperOre ?? 0} /min</span>
                  </div>
                </div>
              </>
            )}

            {resourceCounts && globalEnergy && (
              <div className="my-2 border-t border-white/10" />
            )}

            {globalEnergy && (
              <>
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Énergie
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-1">
                    <Zap
                      size={13}
                      className={globalEnergy.remaining >= 0 ? 'text-emerald-400' : 'text-red-400'}
                    />
                    <span
                      className={`font-bold ${globalEnergy.remaining >= 0 ? 'text-emerald-300' : 'text-red-300'}`}
                    >
                      {globalEnergy.remaining >= 0 ? '+' : ''}
                      {Math.round(globalEnergy.remaining * 10) / 10} kW
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-white/50">
                    <span className="text-emerald-400/70">↑</span>
                    {Math.round(globalEnergy.production * 10) / 10} kW
                  </div>
                  <div className="flex items-center gap-1 text-xs text-white/50">
                    <span className="text-orange-400/70">↓</span>
                    {Math.round(globalEnergy.consumption * 10) / 10} kW
                  </div>
                </div>
                {energyStorage && energyStorage.capacity > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 text-xs text-white/60">
                    <span className="text-amber-400/70">⬢</span>
                    Stockage {Math.round(energyStorage.stored * 10) / 10} /{' '}
                    {Math.round(energyStorage.capacity * 10) / 10} kWh
                  </div>
                )}
              </>
            )}

            <div className="mt-2 border-t border-white/10 pt-1.5 text-xs text-white/60">
              {simulationClockLabel} ({isDaylight ? 'Jour' : 'Nuit'})
              <button
                type="button"
                onClick={() => setDebugOpen((value) => !value)}
                aria-expanded={debugOpen}
                className="ml-2 cursor-pointer rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50 transition-colors hover:bg-white/20"
              >
                {debugOpen ? '▲' : '▼'}
              </button>
            </div>

            {debugOpen && (
              <div className="mt-2 space-y-2 border-t border-white/10 pt-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-md bg-black/40 px-2 py-1">
                    <div className="text-white/60">Phase</div>
                    <div className="font-medium text-white">{simulationPhase}</div>
                  </div>
                  <div className="rounded-md bg-black/40 px-2 py-1">
                    <div className="text-white/60">Consommateurs</div>
                    <div className="font-medium text-white">
                      {globalEnergy?.onlineConsumers ?? 0} ON / {globalEnergy?.offlineConsumers ?? 0} OFF
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-white/70">Temps (0h-24h)</div>
                  <input
                    aria-label="Simulation time"
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={simulationTime}
                    onChange={(e) => applySimulationTime(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => applySimulationTime(0)}
                      className="cursor-pointer rounded-md bg-white/10 px-2 py-1 text-xs transition-colors hover:bg-white/20"
                    >
                      Nuit
                    </button>
                    <button
                      type="button"
                      onClick={() => applySimulationTime(0.25)}
                      className="cursor-pointer rounded-md bg-white/10 px-2 py-1 text-xs transition-colors hover:bg-white/20"
                    >
                      Aube
                    </button>
                    <button
                      type="button"
                      onClick={() => applySimulationTime(0.5)}
                      className="cursor-pointer rounded-md bg-white/10 px-2 py-1 text-xs transition-colors hover:bg-white/20"
                    >
                      Midi
                    </button>
                    <button
                      type="button"
                      onClick={() => applySimulationTime(0.75)}
                      className="cursor-pointer rounded-md bg-white/10 px-2 py-1 text-xs transition-colors hover:bg-white/20"
                    >
                      Crépuscule
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs text-white/70">Vitesse simulation</div>
                  <div className="flex flex-wrap items-center gap-1">
                    {[0, 0.25, 1, 4, 20].map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setSimulationSpeed(speed)}
                        className={
                          simulationSpeed === speed
                            ? 'cursor-pointer rounded-md bg-emerald-400 px-2 py-1 text-xs font-semibold text-black'
                            : 'cursor-pointer rounded-md bg-white/10 px-2 py-1 text-xs transition-colors hover:bg-white/20'
                        }
                      >
                        {speed === 0 ? 'Pause' : `${speed}x`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ToolModeIndicator />
      <SelectedBuildingPanel />

      {consoleOpen && (
        <div className="pointer-events-auto absolute right-3 bottom-20 w-96 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-white/20 bg-black/85 font-mono text-xs shadow-2xl backdrop-blur-sm">
          <div ref={scrollRef} className="h-48 space-y-0.5 overflow-y-auto p-2">
            {history.length === 0 && (
              <div className="text-white/30">Use engine.placeResource(x, y, type), engine.removeResource(x, y), ...</div>
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
          <div className="flex border-t border-white/20">
            <span className="px-2 py-1.5 text-white/50">&gt;</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent py-1.5 pr-2 text-white outline-none"
              placeholder="engine.placeResource(10, 10, 1)"
              autoFocus
            />
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
        <div className="pointer-events-auto grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-2xl border border-white/15 bg-black/70 px-3 py-2 text-white/85 shadow-2xl backdrop-blur-md">
          <div className="min-w-0 justify-self-start">
            {hoverTile && (
              <div className="inline-flex rounded-md bg-black/40 px-2 py-1 font-mono text-xs text-white/80">
                {hoverTile.x}, {hoverTile.y}
              </div>
            )}
          </div>

          <div className="flex items-center justify-self-center gap-2">
            <BuildingPicker />
          </div>

          <div className="flex items-center justify-self-end gap-2">
            {energyLinkSelected && (
              <div className="rounded-md bg-black/40 px-2 py-1 font-mono text-xs text-white/70">
                Source: {pendingEnergyLinkSourceName ?? '-'}
              </div>
            )}
            <div className="relative" ref={settingsRef}>
              <button
                type="button"
                onClick={() => setSettingsOpen((o) => !o)}
                aria-expanded={settingsOpen}
                aria-label="Paramètres"
                title="Paramètres"
                className={`cursor-pointer rounded-xl px-2.5 py-2 transition-colors ${settingsOpen ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'}`}
              >
                <Settings className="h-4 w-4" />
              </button>

              {settingsOpen && (
                <div className="absolute bottom-full right-0 mb-2 min-w-48 rounded-xl border border-white/15 bg-black/85 p-2 shadow-2xl backdrop-blur-md">
                  <p className="mb-1.5 px-2 text-[10px] font-medium uppercase tracking-wider text-white/40">
                    Paramètres
                  </p>

                  {/* Lier après pose */}
                  <button
                    type="button"
                    onClick={() => setLinkSolarOnPlacement(!linkSolarOnPlacement)}
                    aria-pressed={linkSolarOnPlacement}
                    title="Après pose d'un panneau solaire, passe en mode lien"
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
                  >
                    <span>Lier après pose</span>
                    <span
                      className={`ml-3 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${linkSolarOnPlacement ? 'bg-emerald-400/20 text-emerald-400' : 'bg-white/10 text-white/40'}`}
                    >
                      {linkSolarOnPlacement ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  {/* Console */}
                  <button
                    type="button"
                    onClick={() => setConsoleOpen((o) => !o)}
                    aria-pressed={consoleOpen}
                    className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
                  >
                    <span>Console</span>
                    <span className="ml-3 font-mono text-[10px] text-white/40">&gt;_</span>
                  </button>

                  <div className="my-1.5 border-t border-white/10" />

                  {/* Reset */}
                  <button
                    type="button"
                    onClick={() => {
                      setSettingsOpen(false);
                      handleResetSession();
                    }}
                    className="flex w-full items-center rounded-lg px-2 py-1.5 text-xs text-red-400/80 transition-colors hover:bg-red-400/10 hover:text-red-400"
                  >
                    Reset session
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatSimulationTime(simulationTime: number): string {
  const wrapped = ((simulationTime % 1) + 1) % 1;
  const totalMinutes = Math.floor(wrapped * 24 * 60);
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minutes = (totalMinutes % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
