import { Trash2, Zap, Plug } from 'lucide-react';
import { getBuildingType, isBeltTypeId } from '@/game/data/buildingCatalog';
import { worldSideOf } from '@/game/data/ConnectionRegistry';
import { Direction, PortKind } from '@/game/types';
import { useGameStore } from '@/store/useGameStore';

const DIRECTION_LABEL: Record<Direction, string> = {
  [Direction.North]: 'N',
  [Direction.East]: 'E',
  [Direction.South]: 'S',
  [Direction.West]: 'W',
};

export function SelectedBuildingPanel() {
  const engine = useGameStore((s) => s.engine);
  const selectedBuildingId = useGameStore((s) => s.selectedBuildingId);
  const selectedBuildingAnchor = useGameStore((s) => s.selectedBuildingAnchor);
  // Subscribing to energy version keeps the panel reactive to sim changes; store
  // also re-renders frequently via hover/anchor updates which picks up the rest.
  useGameStore((s) => s.engine?.energyNetwork.version ?? 0);
  const pendingEnergyLinkSource = useGameStore((s) => s.pendingEnergyLinkSource);
  const setSelectedBuilding = useGameStore((s) => s.setSelectedBuilding);
  const setSelectedBuildingAnchor = useGameStore((s) => s.setSelectedBuildingAnchor);
  const setPendingEnergyLinkSource = useGameStore((s) => s.setPendingEnergyLinkSource);

  if (!engine || selectedBuildingId === null || !selectedBuildingAnchor) return null;
  const building = engine.getBuildings().get(selectedBuildingId);
  if (!building) return null;
  const type = getBuildingType(building.typeId);
  if (!type) return null;

  const energyBalance = type.energy
    ? engine.getEnergyNetworkForBuilding(selectedBuildingId)
    : null;
  const powerState = engine.getBuildingPowerState(selectedBuildingId);
  const connectedCount = engine.getConnectionsOf(selectedBuildingId).length;

  const { x: anchorX, y: anchorY } = selectedBuildingAnchor;
  const onScreen =
    anchorX >= 0 &&
    anchorX <= engine.viewport.screenWidth &&
    anchorY >= 0 &&
    anchorY <= engine.viewport.screenHeight;
  if (!onScreen) return null;

  const totalPorts = type.ports.length;
  const production = type.energy?.production ?? 0;
  const consumption = type.energy?.consumption ?? 0;
  const hasEnergy = production > 0 || consumption > 0;

  // Direction chip: prefer the output-port direction when the building has
  // exactly one output (extractor, belts) — that's the visually meaningful
  // "facing". Otherwise fall back to building rotation, and hide entirely when
  // rotation is unobservable (no ports, or rotationally symmetric like a
  // 4-sided storage — rotating it yields the same world layout).
  const outputPorts = type.ports.filter((p) => p.kind === PortKind.Output);
  const isSquare = type.footprint.w === type.footprint.h;
  const sidesCovered = new Set(type.ports.map((p) => p.side));
  const isRotationallySymmetric = isSquare && sidesCovered.size === 4;
  const displayDirection =
    outputPorts.length === 1
      ? worldSideOf(outputPorts[0], building.rotation)
      : building.rotation;
  const hasRotation =
    !isRotationallySymmetric && (type.footprint.w !== type.footprint.h || totalPorts > 0);

  const powerColor =
    powerState === 'powered'
      ? 'text-emerald-300'
      : powerState === 'unpowered'
        ? 'text-red-300'
        : 'text-white/50';

  const handleDelete = () => {
    const removed = isBeltTypeId(building.typeId)
      ? engine.removeBelt(selectedBuildingId)
      : engine.removeBuilding(selectedBuildingId);
    if (!removed) return;
    if (pendingEnergyLinkSource === selectedBuildingId) {
      setPendingEnergyLinkSource(null);
    }
    setSelectedBuilding(null);
    setSelectedBuildingAnchor(null);
  };

  return (
    <div
      className="pointer-events-auto absolute"
      style={{ left: anchorX, top: anchorY + 12, transform: 'translateX(-50%)' }}
    >
      <div className="flex flex-col gap-1.5 rounded-xl border border-white/15 bg-black/80 px-3 py-2 text-white shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap text-sm font-medium">{type.name}</span>
          {hasRotation && (
            <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white/70">
              {DIRECTION_LABEL[displayDirection]}
            </span>
          )}
          <button
            type="button"
            onClick={handleDelete}
            className="ml-1 cursor-pointer rounded-lg bg-red-500/15 p-1.5 text-red-300 transition-colors hover:bg-red-500/25 hover:text-red-200"
            aria-label="Supprimer le bâtiment"
            title="Supprimer le bâtiment"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {(hasEnergy || totalPorts > 0) && (
          <div className="flex items-center gap-3 text-[11px] text-white/80">
            {hasEnergy && (
              <div className={`flex items-center gap-1 ${powerColor}`}>
                <Zap size={12} />
                <span className="font-mono">
                  {production > 0 ? `+${production}` : ''}
                  {production > 0 && consumption > 0 ? ' / ' : ''}
                  {consumption > 0 ? `−${consumption}` : ''}
                  {' kWh'}
                </span>
                {energyBalance && consumption > 0 && (
                  <span className="ml-1 font-mono text-white/50">
                    (net {energyBalance.remaining >= 0 ? '+' : ''}
                    {energyBalance.remaining})
                  </span>
                )}
              </div>
            )}
            {totalPorts > 0 && (
              <div className="flex items-center gap-1 text-white/70">
                <Plug size={12} />
                <span className="font-mono">
                  {connectedCount}/{totalPorts}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
