import { useCallback, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  EXTRACTOR_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  getBuildingType,
  isBeltTypeId,
} from '@/game/data/buildingCatalog';
import { Direction } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

export function GameHUD() {
  const hoverTile = useGameStore((s) => s.hoverTile);
  const engine = useGameStore((s) => s.engine);
  const selectedTool = useGameStore((s) => s.selectedTool);
  const selectedBuildingId = useGameStore((s) => s.selectedBuildingId);
  const selectedBuildingAnchor = useGameStore((s) => s.selectedBuildingAnchor);
  const currentBuildingRotation = useGameStore((s) => s.currentBuildingRotation);
  const pendingEnergyLinkSource = useGameStore((s) => s.pendingEnergyLinkSource);
  const linkSolarOnPlacement = useGameStore((s) => s.linkSolarOnPlacement);
  const setSelectedTool = useGameStore((s) => s.setSelectedTool);
  const setSelectedBuilding = useGameStore((s) => s.setSelectedBuilding);
  const setSelectedBuildingAnchor = useGameStore((s) => s.setSelectedBuildingAnchor);
  const rotateBuildingRotation = useGameStore((s) => s.rotateBuildingRotation);
  const resetSession = useGameStore((s) => s.resetSession);
  const setPendingEnergyLinkSource = useGameStore((s) => s.setPendingEnergyLinkSource);
  const setLinkSolarOnPlacement = useGameStore((s) => s.setLinkSolarOnPlacement);

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

  const selectedBuilding =
    engine && selectedBuildingId !== null ? engine.getBuildings().get(selectedBuildingId) ?? null : null;
  const selectedBuildingName = selectedBuilding ? getBuildingType(selectedBuilding.typeId)?.name ?? null : null;
  const anchorVisible =
    engine &&
    selectedBuildingAnchor &&
    selectedBuildingAnchor.x >= 0 &&
    selectedBuildingAnchor.x <= engine.viewport.screenWidth &&
    selectedBuildingAnchor.y >= 0 &&
    selectedBuildingAnchor.y <= engine.viewport.screenHeight;
  const showSelectedBuildingPanel = Boolean(
    engine && selectedBuilding && selectedBuildingName && selectedBuildingAnchor && anchorVisible,
  );
  const buildingRotationLabel = directionLabel(currentBuildingRotation);

  const selectedNetwork =
    engine && selectedBuildingId !== null ? engine.getEnergyNetworkForBuilding(selectedBuildingId) : null;

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

  const handleDeleteSelectedBuilding = () => {
    if (!engine || selectedBuildingId === null) return;

    const building = engine.getBuildings().get(selectedBuildingId);
    if (!building) return;

    const removed = isBeltTypeId(building.typeId)
      ? engine.removeBelt(selectedBuildingId)
      : engine.removeBuilding(selectedBuildingId);
    if (removed) {
      clearSelectedBuilding();
    }
  };

  const handleResetSession = () => {
    if (!window.confirm('Reset the current session and start a new game?')) {
      return;
    }
    resetSession();
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-50 select-none">
      {showSelectedBuildingPanel && selectedBuildingAnchor && (
        <div
          className="pointer-events-auto absolute"
          style={{ left: selectedBuildingAnchor.x, top: selectedBuildingAnchor.y + 12, transform: 'translateX(-50%)' }}
        >
          <div className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/80 px-3 py-2 text-white shadow-2xl backdrop-blur-md">
            <span className="whitespace-nowrap text-sm font-medium">{selectedBuildingName}</span>
            <button
              type="button"
              onClick={handleDeleteSelectedBuilding}
              className="cursor-pointer rounded-lg bg-red-500/15 p-1.5 text-red-300 transition-colors hover:bg-red-500/25 hover:text-red-200"
              aria-label="Supprimer le bâtiment"
              title="Supprimer le bâtiment"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      )}

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
                Source: {pendingEnergyLinkSource ?? '-'}
              </div>
            )}
            {selectedBuildingId !== null && selectedNetwork && (
              <div className="rounded-md bg-black/40 px-2 py-1 font-mono text-xs text-white/70">
                P:{selectedNetwork.production} C:{selectedNetwork.consumption} R:{selectedNetwork.remaining}
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
