import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Settings, Zap } from 'lucide-react';
import { getBuildingType } from '@/game/data/buildingCatalog';
import { useGameStore } from '@/store/useGameStore';
import { SelectedBuildingPanel } from './hud/SelectedBuildingPanel';
import { BuildingPicker } from './hud/BuildingPicker';
import { ToolModeIndicator } from './hud/ToolModeIndicator';
import { Icon, Chip, Panel, PanelHeading } from './ui';

export function GameHUD() {
  const hoverTile = useGameStore((s) => s.hoverTile);
  const engine = useGameStore((s) => s.engine);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const simulationTime = useGameStore((s) => s.simulationTime);
  const simulationSpeed = useGameStore((s) => s.simulationSpeed);
  const musicVolume = useGameStore((s) => s.musicVolume);
  const sfxVolume = useGameStore((s) => s.sfxVolume);
  const pendingEnergyLinkSource = useGameStore((s) => s.pendingEnergyLinkSource);
  const energyVersion = useGameStore((s) => s.engine?.energyNetwork.version ?? 0);
  const linkSolarOnPlacement = useGameStore((s) => s.linkSolarOnPlacement);
  const idleSummary = useGameStore((s) => s.idleSummary);
  const setSimulationTime = useGameStore((s) => s.setSimulationTime);
  const setSimulationSpeed = useGameStore((s) => s.setSimulationSpeed);
  const setMusicVolume = useGameStore((s) => s.setMusicVolume);
  const setSfxVolume = useGameStore((s) => s.setSfxVolume);
  const resetSession = useGameStore((s) => s.resetSession);
  const setLinkSolarOnPlacement = useGameStore((s) => s.setLinkSolarOnPlacement);
  const setIdleSummary = useGameStore((s) => s.setIdleSummary);

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

  useEffect(() => {
    if (!idleSummary || idleSummary.appliedSeconds <= 0) return;
    const timeoutId = window.setTimeout(() => {
      setIdleSummary(null);
    }, 7000);
    return () => window.clearTimeout(timeoutId);
  }, [idleSummary, setIdleSummary]);

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
  const idleSummaryText = useMemo(() => {
    if (!idleSummary || idleSummary.appliedSeconds <= 0) return null;
    const totalSeconds = Math.floor(idleSummary.appliedSeconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const durationLabel = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    const delta = idleSummary.resourceDelta;
    return {
      durationLabel,
      coal: delta.coal,
      ironOre: delta.ironOre,
      copperOre: delta.copperOre,
      capped: idleSummary.capped,
    };
  }, [idleSummary]);

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
      engine?.emitSfx({ type: 'ui_back', context: 'reset_session' });
      return;
    }
    engine?.emitSfx({ type: 'ui_confirm', context: 'reset_session' });
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
      {idleSummaryText && (
        <div className="pointer-events-auto absolute top-3 right-3">
          <div className="rounded-xl border border-emerald-300/25 bg-black/75 px-3 py-2 text-xs text-white/90 shadow-xl backdrop-blur-md">
            <div className="font-semibold text-emerald-300">Progression hors ligne: {idleSummaryText.durationLabel}</div>
            <div className="mt-1 text-white/75">
              +{idleSummaryText.coal} charbon, +{idleSummaryText.ironOre} fer, +{idleSummaryText.copperOre} cuivre
            </div>
            {idleSummaryText.capped && <div className="mt-0.5 text-[11px] text-amber-300/90">Cap offline appliqué (8h).</div>}
          </div>
        </div>
      )}

      {engine && (
        <div className="pointer-events-auto absolute top-3 left-3">
          <Panel className="min-w-[180px] px-3 py-2.5 text-sm text-ink">
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
                <div className="flex items-center gap-1">
                  <span className="label text-ink-muted">{globalEnergy.surplusPower >= 0 ? 'Surplus' : 'Déficit'}</span>
                  <div className="flex items-center gap-1">
                    <Icon
                      icon={Zap}
                      size={13}
                      className={globalEnergy.surplusPower >= 0 ? 'text-ok' : 'text-error'}
                    />
                    <span
                      className={`font-bold tabular-nums ${globalEnergy.surplusPower >= 0 ? 'text-ok' : 'text-error'}`}
                    >
                      {globalEnergy.surplusPower >= 0 ? '+' : ''}
                      {Math.round(globalEnergy.surplusPower * 10) / 10} kW
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-xs tabular-nums text-ink-muted">
                  <span>Prod. {Math.round(globalEnergy.production * 10) / 10} kW</span>
                  <span className="mx-2">|</span>
                  <span>Utilisée {Math.round(globalEnergy.servedConsumption * 10) / 10} kW</span>
                  <span className="mx-2">|</span>
                  <span>Demande {Math.round(globalEnergy.demandedConsumption * 10) / 10} kW</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-ink-muted">
                  {globalEnergy.unservedLoad > 0 && (
                    <span className="text-accent-warm">
                      Non servie {Math.round(globalEnergy.unservedLoad * 10) / 10} kW
                    </span>
                  )}
                  {energyStorage && energyStorage.capacity > 0 && (
                    <span>
                      Stockage {Math.round(energyStorage.stored * 10) / 10} /{' '}
                      {Math.round(energyStorage.capacity * 10) / 10} kWh
                    </span>
                  )}
                </div>
              </>
            )}

            <div className="mt-2 border-t border-border pt-1.5 text-xs text-ink-muted">
              <span className="tabular-nums">{simulationClockLabel}</span> ({isDaylight ? 'Jour' : 'Nuit'})
              <button
                type="button"
                onClick={() =>
                  setDebugOpen((value) => {
                    if (value) {
                      engine?.emitSfx({ type: 'ui_back', context: 'debug_close' });
                    }
                    return !value;
                  })
                }
                aria-expanded={debugOpen}
                className="ml-2 cursor-pointer rounded-sm bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-muted transition-colors hover:bg-border"
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

                <div className="space-y-1">
                  <div className="text-xs text-white/70">Volume musique</div>
                  <input
                    aria-label="Music volume"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(Number(e.target.value))}
                    className="w-full accent-emerald-400"
                  />
                  <div className="flex items-center justify-between text-[11px] text-white/60">
                    <span>0%</span>
                    <span>{Math.round(musicVolume * 100)}%</span>
                    <span>100%</span>
                  </div>
                </div>

              </div>
            )}
          </Panel>
        </div>
      )}

      <SelectedBuildingPanel />

      {consoleOpen && (
        <Panel elevated className="pointer-events-auto absolute right-3 bottom-20 w-96 max-w-[calc(100vw-1.5rem)] overflow-hidden tabular-nums text-xs">
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
        </Panel>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-end gap-3">
          <div className="flex min-w-0 items-end justify-self-start">
            <div className="pointer-events-auto flex flex-col items-start gap-2">
              <ToolModeIndicator />
              {hoverTile && (
                <div className="inline-flex rounded-sm border border-border bg-surface/90 px-2 py-1 tabular-nums text-xs text-ink-muted backdrop-blur-md">
                  {hoverTile.x}, {hoverTile.y}
                </div>
              )}
            </div>
          </div>

          <div className="pointer-events-auto justify-self-center">
            <Panel className="flex flex-col items-center gap-2 px-3 py-2.5 text-ink">
              <PanelHeading className="text-xs text-ink-muted">Construction</PanelHeading>
              <BuildingPicker />
            </Panel>
          </div>

          <div className="flex min-w-0 items-end justify-self-end">
            <Panel className="pointer-events-auto flex items-center gap-2 px-2 py-2 text-ink">
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
                  <Panel elevated className="absolute bottom-full right-0 mb-2 min-w-48 p-2">
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

                    <div className="space-y-1 px-2 py-1.5">
                      <div className="label text-ink-muted">Volume effets</div>
                      <input
                        aria-label="SFX volume"
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={sfxVolume}
                        onChange={(e) => setSfxVolume(Number(e.target.value))}
                        className="w-full accent-accent"
                      />
                      <div className="flex items-center justify-between text-[11px] text-ink-muted">
                        <span>0%</span>
                        <span>{Math.round(sfxVolume * 100)}%</span>
                        <span>100%</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setConsoleOpen((open) => {
                          if (open) {
                            engine?.emitSfx({ type: 'ui_back', context: 'console_close' });
                          }
                          return !open;
                        })
                      }
                      aria-pressed={consoleOpen}
                      className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs text-ink transition-colors hover:bg-surface-2"
                    >
                      <span>Console</span>
                      <span className="ml-3 tabular-nums text-[11px] text-ink-muted">&gt;_</span>
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
                  </Panel>
                )}
              </div>
            </Panel>
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
