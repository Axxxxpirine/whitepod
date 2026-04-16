import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Settings, Zap } from 'lucide-react';
import { getBuildingType } from '@/game/data/buildingCatalog';
import { useGameStore } from '@/store/useGameStore';
import { SelectedBuildingPanel } from './hud/SelectedBuildingPanel';
import { BuildingPicker } from './hud/BuildingPicker';
import { ToolModeIndicator } from './hud/ToolModeIndicator';
import { Icon, Chip, PanelHeading } from './ui';

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
          <div className="min-w-[180px] rounded-md border border-border bg-surface/90 px-3 py-2.5 text-sm text-ink backdrop-blur-md">
            {resourceCounts && (
              <>
                <div className="label mb-1.5 text-ink-muted">Ressources</div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <img src="sprites/coal.png" className="h-4 w-4 object-contain" alt="Charbon" />
                    <span className="font-bold tabular-nums">{resourceCounts.coal}</span>
                    <span className="text-xs tabular-nums text-ink-muted">{resourceRates?.coal ?? 0}/min</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <img src="sprites/iron-ore.png" className="h-4 w-4 object-contain" alt="Minerai de fer" />
                    <span className="font-bold tabular-nums">{resourceCounts.ironOre}</span>
                    <span className="text-xs tabular-nums text-ink-muted">{resourceRates?.ironOre ?? 0}/min</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <img src="sprites/copper-ore.png" className="h-4 w-4 object-contain" alt="Cuivre" />
                    <span className="font-bold tabular-nums">{resourceCounts.copperOre}</span>
                    <span className="text-xs tabular-nums text-ink-muted">{resourceRates?.copperOre ?? 0}/min</span>
                  </div>
                </div>
              </>
            )}

            {resourceCounts && globalEnergy && <div className="my-2 border-t border-border" />}

            {globalEnergy && (
              <>
                <div className="label mb-1.5 text-ink-muted">Énergie</div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1.5">
                  <div className="flex items-center gap-1">
                    <Icon
                      icon={Zap}
                      size={13}
                      className={globalEnergy.remaining >= 0 ? 'text-ok' : 'text-error'}
                    />
                    <span
                      className={`font-bold tabular-nums ${globalEnergy.remaining >= 0 ? 'text-ok' : 'text-error'}`}
                    >
                      {globalEnergy.remaining >= 0 ? '+' : ''}
                      {Math.round(globalEnergy.remaining * 10) / 10} kW
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs tabular-nums text-ink-muted">
                    <span className="text-ok">↑</span>
                    {Math.round(globalEnergy.production * 10) / 10} kW
                  </div>
                  <div className="flex items-center gap-1 text-xs tabular-nums text-ink-muted">
                    <span className="text-accent-warm">↓</span>
                    {Math.round(globalEnergy.consumption * 10) / 10} kW
                  </div>
                </div>
                {energyStorage && energyStorage.capacity > 0 && (
                  <div className="mt-1.5 flex items-center gap-1 text-xs tabular-nums text-ink-muted">
                    <span className="text-accent-warm">⬢</span>
                    Stockage {Math.round(energyStorage.stored * 10) / 10} /{' '}
                    {Math.round(energyStorage.capacity * 10) / 10} kWh
                  </div>
                )}
              </>
            )}

            <div className="mt-2 border-t border-border pt-1.5 text-xs text-ink-muted">
              <span className="tabular-nums">{simulationClockLabel}</span> ({isDaylight ? 'Jour' : 'Nuit'})
              <button
                type="button"
                onClick={() => setDebugOpen((value) => !value)}
                aria-expanded={debugOpen}
                className="ml-2 cursor-pointer rounded-sm bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-muted transition-colors hover:bg-border"
              >
                {debugOpen ? '▲' : '▼'}
              </button>
            </div>

            {debugOpen && (
              <div className="mt-2 space-y-2 border-t border-border pt-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-sm bg-surface-2 px-2 py-1">
                    <div className="label text-ink-muted">Phase</div>
                    <div className="font-medium text-ink">{simulationPhase}</div>
                  </div>
                  <div className="rounded-sm bg-surface-2 px-2 py-1">
                    <div className="label text-ink-muted">Consommateurs</div>
                    <div className="font-medium tabular-nums text-ink">
                      {globalEnergy?.onlineConsumers ?? 0} ON / {globalEnergy?.offlineConsumers ?? 0} OFF
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="label text-ink-muted">Temps (0h-24h)</div>
                  <input
                    aria-label="Simulation time"
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={simulationTime}
                    onChange={(e) => applySimulationTime(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                  <div className="flex items-center justify-between gap-1">
                    {[
                      { label: 'Nuit', value: 0 },
                      { label: 'Aube', value: 0.25 },
                      { label: 'Midi', value: 0.5 },
                      { label: 'Crépuscule', value: 0.75 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => applySimulationTime(preset.value)}
                        className="cursor-pointer rounded-sm bg-surface-2 px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-border hover:text-ink"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="label text-ink-muted">Vitesse simulation</div>
                  <div className="flex flex-wrap items-center gap-1">
                    {[0, 0.25, 1, 4, 20].map((speed) => (
                      <button
                        key={speed}
                        type="button"
                        onClick={() => setSimulationSpeed(speed)}
                        className={
                          simulationSpeed === speed
                            ? 'cursor-pointer rounded-sm bg-accent px-2 py-1 text-xs font-semibold tabular-nums text-bg'
                            : 'cursor-pointer rounded-sm bg-surface-2 px-2 py-1 text-xs tabular-nums text-ink-muted transition-colors hover:bg-border hover:text-ink'
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

      <SelectedBuildingPanel />

      {consoleOpen && (
        <div className="pointer-events-auto absolute right-3 bottom-20 w-96 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md border border-border bg-surface/95 tabular-nums text-xs backdrop-blur-sm">
          <div ref={scrollRef} className="h-48 space-y-0.5 overflow-y-auto p-2">
            {history.length === 0 && (
              <div className="text-ink-muted">Use engine.placeResource(x, y, type), engine.removeResource(x, y), ...</div>
            )}
            {history.map((entry, i) => (
              <div
                key={i}
                className={
                  entry.type === 'input'
                    ? 'text-ink'
                    : entry.type === 'error'
                      ? 'text-error'
                      : 'text-ok'
                }
              >
                {entry.text}
              </div>
            ))}
          </div>
          <div className="flex border-t border-border">
            <span className="px-2 py-1.5 text-ink-muted">&gt;</span>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent py-1.5 pr-2 text-ink outline-none"
              placeholder="engine.placeResource(10, 10, 1)"
              autoFocus
            />
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
          <div className="flex min-w-0 items-end justify-self-start">
            <div className="pointer-events-auto flex flex-col items-start gap-2">
              <ToolModeIndicator />
              {hoverTile && (
                <div className="inline-flex rounded-sm border border-border bg-surface/92 px-2 py-1 tabular-nums text-xs text-ink-muted backdrop-blur-md">
                  {hoverTile.x}, {hoverTile.y}
                </div>
              )}
            </div>
          </div>

          <div className="pointer-events-auto justify-self-center">
            <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface/94 px-3 py-2.5 text-ink backdrop-blur-md">
              <PanelHeading className="text-xs text-ink-muted">Construction</PanelHeading>
              <BuildingPicker />
            </div>
          </div>

          <div className="flex min-w-0 items-end justify-self-end">
            <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-border bg-surface/92 px-2 py-2 text-ink backdrop-blur-md">
              {energyLinkSelected && (
                <div className="flex items-center gap-2 rounded-sm border border-border bg-surface-2 px-2 py-1 text-xs text-ink-muted">
                  <span className="label">Source</span>
                  <span className="tabular-nums text-ink">{pendingEnergyLinkSourceName ?? '-'}</span>
                </div>
              )}
              <div className="relative" ref={settingsRef}>
                <button
                  type="button"
                  onClick={() => setSettingsOpen((o) => !o)}
                  aria-expanded={settingsOpen}
                  aria-label="Paramètres"
                  title="Paramètres"
                  className={`cursor-pointer rounded-md px-2.5 py-2 transition-colors ${settingsOpen ? 'bg-surface-2 text-ink' : 'bg-surface text-ink-muted hover:bg-surface-2 hover:text-ink'}`}
                >
                  <Icon icon={Settings} className="h-4 w-4" />
                </button>

                {settingsOpen && (
                  <div className="absolute bottom-full right-0 mb-2 min-w-48 rounded-md border border-border bg-surface/95 p-2 backdrop-blur-md">
                    <p className="label mb-1.5 px-2 text-ink-muted">Paramètres</p>

                    <button
                      type="button"
                      onClick={() => setLinkSolarOnPlacement(!linkSolarOnPlacement)}
                      aria-pressed={linkSolarOnPlacement}
                      title="Après pose d'un panneau solaire, passe en mode lien"
                      className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs text-ink transition-colors hover:bg-surface-2"
                    >
                      <span>Lier après pose</span>
                      <Chip tone={linkSolarOnPlacement ? 'accent' : 'muted'} className="ml-3">
                        {linkSolarOnPlacement ? 'ON' : 'OFF'}
                      </Chip>
                    </button>

                    <button
                      type="button"
                      onClick={() => setConsoleOpen((o) => !o)}
                      aria-pressed={consoleOpen}
                      className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs text-ink transition-colors hover:bg-surface-2"
                    >
                      <span>Console</span>
                      <span className="ml-3 tabular-nums text-[10px] text-ink-muted">&gt;_</span>
                    </button>

                    <div className="my-1.5 border-t border-border" />

                    <button
                      type="button"
                      onClick={() => {
                        setSettingsOpen(false);
                        handleResetSession();
                      }}
                      className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs text-error transition-colors hover:bg-error/10"
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
