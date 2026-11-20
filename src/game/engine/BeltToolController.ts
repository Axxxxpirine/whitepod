import { getBuildingType } from '../data/buildingCatalog';
import { worldSideOf, worldTileOf } from '../data/ConnectionRegistry';
import { screenToWorld } from './CoordinateTransform';
import type { GameEngine } from './GameEngine';
import { PortKind, type Building, type BuildingId, type Port, type PortId, type SelectedTool, type TileCoord } from '../types';
import type { BeltPlacementPreviewModel } from '../renderer/placementPreviewModel';
import { TILE_SIZE } from '../constants';
import { PIXI } from '@/design/tokens';

interface PortEndpoint {
  readonly building: BuildingId;
  readonly port: PortId;
}

interface PendingFrom {
  readonly from: PortEndpoint;
}

const BELT_PREVIEW_TINT = PIXI.ok;
const BELT_PREVIEW_INVALID_TINT = PIXI.error;

export class BeltToolController {
  private readonly engine: GameEngine;
  private readonly getSelectedTool: () => SelectedTool;
  private readonly setPreview: (preview: BeltPlacementPreviewModel | null) => void;
  private pendingFrom: PendingFrom | null = null;

  constructor(
    engine: GameEngine,
    getSelectedTool: () => SelectedTool,
    setPreview: (preview: BeltPlacementPreviewModel | null) => void,
  ) {
    this.engine = engine;
    this.getSelectedTool = getSelectedTool;
    this.setPreview = setPreview;
  }

  onPointerDown(screenX: number, screenY: number, button: number): void {
    if (button !== 0 || this.getSelectedTool().kind !== 'belt') return;

    const tile = this.engine.screenToTile(screenX, screenY);
    const clickWorld = screenToWorld(this.engine.viewport, screenX, screenY);

    if (!this.pendingFrom) {
      // First click: select the source output port
      const from = this.getEndpointAtScreen(tile, PortKind.Output, clickWorld);
      if (!from) return;
      this.pendingFrom = { from };
      this.setPreview(null);
    } else {
      // Second click: place the belt to the target input port
      const from = this.pendingFrom.from;
      const target = this.getEndpointAtScreen(tile, PortKind.Input, clickWorld, from);
      this.cancel();
      if (!target || target.building === from.building) return;
      this.engine.placeBelt(from, target);
    }
  }

  onPointerMove(screenX: number, screenY: number): void {
    if (this.getSelectedTool().kind !== 'belt') {
      this.cancel();
      return;
    }
    if (!this.pendingFrom) return;

    const clickWorld = screenToWorld(this.engine.viewport, screenX, screenY);
    const target = this.getEndpointAtScreen(
      this.engine.screenToTile(screenX, screenY),
      PortKind.Input,
      clickWorld,
      this.pendingFrom.from,
    );
    if (!target || target.building === this.pendingFrom.from.building) {
      this.setPreview(null);
      return;
    }

    const quote = this.engine.quoteBelt(this.pendingFrom.from, target);
    if (!quote.ok) {
      this.setPreview(null);
      return;
    }

    // An unaffordable route stays visible, tinted invalid, so the player sees
    // its cost and what is missing instead of a preview that vanishes.
    const affordable = quote.missing.length === 0;
    this.setPreview({
      kind: 'belt',
      isValid: affordable,
      ...(affordable ? {} : { reason: 'insufficient_resources' as const }),
      cost: quote.cost,
      missing: quote.missing,
      tiles: quote.plan.segments.map((segment) => ({
        coord: segment.coord,
        tint: affordable ? BELT_PREVIEW_TINT : BELT_PREVIEW_INVALID_TINT,
      })),
    });
  }

  onPointerUp(_screenX: number, _screenY: number, _button: number): void {
    // No-op: placement is handled by the two-click flow in onPointerDown
  }

  onPointerLeave(): void {
    // Clear the preview but keep the pending source so the user can come back
    this.setPreview(null);
  }

  hasPending(): boolean {
    return this.pendingFrom !== null;
  }

  clearPendingPlacement(): void {
    this.cancel();
  }

  private cancel(): void {
    this.pendingFrom = null;
    this.setPreview(null);
  }

  private getEndpointAtScreen(
    tile: TileCoord,
    kind: typeof PortKind.Input | typeof PortKind.Output,
    clickWorld: { wx: number; wy: number },
    source?: PortEndpoint,
  ): PortEndpoint | null {
    const building = this.engine.getBuildingAt(tile.x, tile.y);
    if (!building) return null;
    return this.findAvailablePort(building, tile, kind, clickWorld, source);
  }

  private findAvailablePort(
    building: Building,
    clickedTile: TileCoord,
    kind: typeof PortKind.Input | typeof PortKind.Output,
    clickWorld: { wx: number; wy: number },
    source?: PortEndpoint,
  ): PortEndpoint | null {
    const type = getBuildingType(building.typeId);
    if (!type) return null;

    const availablePorts = type.ports.filter(
      (candidate) =>
        candidate.kind === kind &&
        !this.engine.connections.isPortConnected(building.id, candidate.id),
    );

    if (availablePorts.length === 0) return null;
    if (availablePorts.length === 1) {
      return { building: building.id, port: availablePorts[0].id };
    }

    const exactPorts = availablePorts.filter((candidate) =>
      this.portOwnsTile(candidate, building, clickedTile),
    );
    if (exactPorts.length === 0) return null;
    if (exactPorts.length === 1) {
      return { building: building.id, port: exactPorts[0].id };
    }

    const nearestPort = this.findNearestPort(building, exactPorts, clickWorld);
    if (!source || kind !== PortKind.Input) {
      return { building: building.id, port: nearestPort.id };
    }

    const rankedPorts = [
      nearestPort,
      ...exactPorts.filter((candidate) => candidate.id !== nearestPort.id),
    ];

    let bestPort: PortEndpoint | null = null;
    let bestSegmentCount = Number.POSITIVE_INFINITY;

    for (const candidate of rankedPorts) {
      const endpoint = { building: building.id, port: candidate.id };
      const result = this.engine.canPlaceBelt(source, endpoint);
      if (!result.ok) continue;
      if (result.plan.segments.length < bestSegmentCount) {
        bestPort = endpoint;
        bestSegmentCount = result.plan.segments.length;
      }
    }

    return bestPort ?? { building: building.id, port: nearestPort.id };
  }

  private portOwnsTile(port: Port, building: Building, clickedTile: TileCoord): boolean {
    const type = getBuildingType(building.typeId);
    if (!type) return false;
    const worldTile = worldTileOf(port, building.origin, building.rotation, type.footprint);
    return worldTile.x === clickedTile.x && worldTile.y === clickedTile.y;
  }

  private findNearestPort(
    building: Building,
    ports: readonly Port[],
    clickWorld: { wx: number; wy: number },
  ): Port {
    let best = ports[0]!;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const candidate of ports) {
      const anchor = this.getPortAnchor(candidate, building);
      const dx = anchor.wx - clickWorld.wx;
      const dy = anchor.wy - clickWorld.wy;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }

    return best;
  }

  private getPortAnchor(port: Port, building: Building): { wx: number; wy: number } {
    const type = getBuildingType(building.typeId)!;
    const tile = worldTileOf(port, building.origin, building.rotation, type.footprint);
    const side = worldSideOf(port, building.rotation);
    const baseX = tile.x * TILE_SIZE;
    const baseY = tile.y * TILE_SIZE;
    const centerX = baseX + TILE_SIZE / 2;
    const centerY = baseY + TILE_SIZE / 2;

    switch (side) {
      case 0:
        return { wx: centerX, wy: baseY };
      case 1:
        return { wx: baseX + TILE_SIZE, wy: centerY };
      case 2:
        return { wx: centerX, wy: baseY + TILE_SIZE };
      case 3:
        return { wx: baseX, wy: centerY };
      default:
        return { wx: centerX, wy: centerY };
    }
  }
}
