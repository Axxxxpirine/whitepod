import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Zap } from 'lucide-react';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
} from '@/game/data/buildingCatalog';
import { Direction } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';
import { SelectedBuildingPanel } from './hud/SelectedBuildingPanel';

export function GameHUD() {
  const hoverTile = useGameStore((s) => s.hoverTile);
  const engine = useGameStore((s) => s.engine);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const currentBuildingRotation = useGameStore((s) => s.currentBuildingRotation);
  const pendingEnergyLinkSource = useGameStore((s) => s.pendingEnergyLinkSource);
  const energyVersion = useGameStore((s) => s.engine?.energyNetwork.version ?? 0);
  const linkSolarOnPlacement = useGameStore((s) => s.linkSolarOnPlacement);
  const setSelectedTool = useGameStore((s) => s.setSelectedTool);
  const setSelectedBuilding = useGameStore((s) => s.setSelectedBuilding);
  const setSelectedBuildingAnchor = useGameStore((s) => s.setSelectedBuildingAnchor);
  const rotateBuildingRotation = useGameStore((s) => s.rotateBuildingRotation);
  const resetSession = useGameStore((s) => s.resetSession);
  const setPendingEnergyLinkSource = useGameStore((s) => s.setPendingEnergyLinkSource);
  const setLinkSolarOnPlacement = useGameStore((s) => s.setLinkSolarOnPlacement);

  const [worldTick, setWorldTick] = useState(0);
  useEffect(() => {
    if (!engine) return;
    return engine.subscribe((kind) => {
      if (kind === 'world') setWorldTick((t) => t + 1);
    });
  }, [engine]);

  const [consoleOpen, setConsoleOpen] = useState(false);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<{ text: string; type: 'input' | 'output' | 'error' }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const extractorSelected =
    selectedTool.kind === 'building' && selectedTool.buildingType === EXTRACTOR_BUILDING_TYPE_ID;
  const storageSelected =
    selectedTool.kind === 'building' && selectedTool.buildingType === STORAGE_BUILDING_TYPE_ID;
  const beltSelected = selectedTool.kind === 'belt';
  const solarSelected =
    selectedTool.kind === 'building' && selectedTool.buildingType === SOLAR_PANEL_BUILDING_TYPE_ID;
  const energyLinkSelected = selectedTool.kind === 'energy_link';

  const pendingEnergyLinkSourceName = useMemo(() => {
    if (!engine || pendingEnergyLinkSource === null) return null;
    const source = engine.getBuildings().get(pendingEnergyLinkSource);
    if (!source) return null;
    return getBuildingType(source.typeId)?.name ?? null;
  }, [engine, pendingEnergyLinkSource]);
  const buildingRotationLabel = directionLabel(currentBuildingRotation);
  const globalEnergy = useMemo(() => {
    void energyVersion;
    return engine ? engine.getEnergyGlobalStats() : null;
  }, [engine, energyVersion]);

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

  const clearSelectedBuilding = useCallback(() => {
    setSelectedBuilding(null);
    setSelectedBuildingAnchor(null);
  }, [setSelectedBuilding, setSelectedBuildingAnchor]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && input.trim()) {
      executeCommand(input.trim());
      setInput('');
    }
  };

  const toggleTool = useCallback(
    (
      buildingType:
        | typeof EXTRACTOR_BUILDING_TYPE_ID
        | typeof STORAGE_BUILDING_TYPE_ID
        | typeof SOLAR_PANEL_BUILDING_TYPE_ID,
    ) => {
      clearSelectedBuilding();
      setPendingEnergyLinkSource(null);
      setSelectedTool(
        selectedTool.kind === 'building' && selectedTool.buildingType === buildingType
          ? { kind: 'select' }
          : { kind: 'building', buildingType },
      );
    },
    [clearSelectedBuilding, selectedTool, setPendingEnergyLinkSource, setSelectedTool],
  );

  const toggleEnergyLinkTool = () => {
    clearSelectedBuilding();
    setPendingEnergyLinkSource(null);
    setSelectedTool(energyLinkSelected ? { kind: 'select' } : { kind: 'energy_link' });
  };

  const toggleBeltTool = () => {
    clearSelectedBuilding();
    setSelectedTool(beltSelected ? { kind: 'select' } : { kind: 'belt' });
  };

  const rotatePlacement = () => {
    rotateBuildingRotation();
  };

  const handleResetSession = () => {
    if (!window.confirm('Reset the current session and start a new game?')) {
      return;
    }
    resetSession();
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-50 select-none">
      {(resourceCounts || globalEnergy) && (
        <div className="absolute top-3 left-3">
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
                      {globalEnergy.remaining} kWh
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-white/50">
                    <span className="text-emerald-400/70">↑</span>
                    {globalEnergy.production} kWh
                  </div>
                  <div className="flex items-center gap-1 text-xs text-white/50">
                    <span className="text-orange-400/70">↓</span>
                    {globalEnergy.consumption} kWh
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
            <button
              type="button"
              onClick={() => toggleTool(EXTRACTOR_BUILDING_TYPE_ID)}
              aria-pressed={extractorSelected}
              className={
                extractorSelected
                  ? 'cursor-pointer rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-black shadow-lg transition-colors'
                  : 'cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/20'
              }
            >
              Extracteur
            </button>
            <button
              type="button"
              onClick={() => toggleTool(STORAGE_BUILDING_TYPE_ID)}
              aria-pressed={storageSelected}
              className={
                storageSelected
                  ? 'cursor-pointer rounded-xl bg-sky-400 px-4 py-2 text-sm font-semibold text-black shadow-lg transition-colors'
                  : 'cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/20'
              }
            >
              Stockage
            </button>
            <button
              type="button"
              onClick={toggleBeltTool}
              aria-pressed={beltSelected}
              className={
                beltSelected
                  ? 'cursor-pointer rounded-xl bg-lime-300 px-4 py-2 text-sm font-semibold text-black shadow-lg transition-colors'
                  : 'cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/20'
              }
            >
              Convoyeur
            </button>
            <button
              type="button"
              onClick={() => toggleTool(SOLAR_PANEL_BUILDING_TYPE_ID)}
              aria-pressed={solarSelected}
              className={
                solarSelected
                  ? 'cursor-pointer rounded-xl bg-lime-400 px-4 py-2 text-sm font-semibold text-black shadow-lg transition-colors'
                  : 'cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/20'
              }
            >
              Panneau solaire
            </button>
            <button
              type="button"
              onClick={toggleEnergyLinkTool}
              aria-pressed={energyLinkSelected}
              className={
                energyLinkSelected
                  ? 'cursor-pointer rounded-xl bg-violet-300 px-4 py-2 text-sm font-semibold text-black shadow-lg transition-colors'
                  : 'cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/20'
              }
            >
              Lien énergie
            </button>
            {selectedTool.kind === 'building' && (
              <button
                type="button"
                onClick={rotatePlacement}
                className="cursor-pointer rounded-xl bg-white/10 px-4 py-2 text-sm text-white/90 transition-colors hover:bg-white/20"
                title="Rotation (R)"
              >
                Rotation: {buildingRotationLabel}
              </button>
            )}
          </div>

          <div className="flex items-center justify-self-end gap-2">
            <button
              type="button"
              onClick={handleResetSession}
              className="cursor-pointer rounded-xl bg-white/10 px-3 py-2 text-xs text-white/90 transition-colors hover:bg-white/20"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={() => setLinkSolarOnPlacement(!linkSolarOnPlacement)}
              aria-pressed={linkSolarOnPlacement}
              className={
                linkSolarOnPlacement
                  ? 'cursor-pointer rounded-xl bg-emerald-400/90 px-3 py-2 text-xs font-semibold text-black transition-colors'
                  : 'cursor-pointer rounded-xl bg-white/10 px-3 py-2 text-xs text-white/80 transition-colors hover:bg-white/20'
              }
              title="Après pose d'un panneau solaire, passe en mode lien"
            >
              Lier après pose: {linkSolarOnPlacement ? 'ON' : 'OFF'}
            </button>
            {energyLinkSelected && (
              <div className="rounded-md bg-black/40 px-2 py-1 font-mono text-xs text-white/70">
                Source: {pendingEnergyLinkSourceName ?? '-'}
              </div>
            )}
            <button
              type="button"
              onClick={() => setConsoleOpen((o) => !o)}
              aria-expanded={consoleOpen}
              className="cursor-pointer rounded-xl bg-white/10 px-3 py-2 font-mono text-xs text-white/90 transition-colors hover:bg-white/20"
              title="Toggle console"
            >
              {consoleOpen ? 'Close' : '>_'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function directionLabel(direction: Direction): string {
  switch (direction) {
    case Direction.North:
      return 'N';
    case Direction.East:
      return 'E';
    case Direction.South:
      return 'S';
    case Direction.West:
      return 'W';
  }
}
