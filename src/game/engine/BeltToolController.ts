import { getBuildingType } from '../data/buildingCatalog';
import { worldTileOf } from '../data/ConnectionRegistry';
import type { GameEngine } from './GameEngine';
import { PortKind, type Building, type BuildingId, type Port, type PortId, type SelectedTool, type TileCoord } from '../types';
import type { BeltPlacementPreviewModel } from '../renderer/placementPreviewModel';

interface PortEndpoint {
  readonly building: BuildingId;
  readonly port: PortId;
}

interface PendingFrom {
  readonly from: PortEndpoint;
}

const BELT_PREVIEW_TINT = 0x22c55e;

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

    if (!this.pendingFrom) {
      // First click: select the source output port
      const from = this.getEndpointAtScreen(tile, PortKind.Output);
      if (!from) return;
      this.pendingFrom = { from };
      this.setPreview(null);
    } else {
      // Second click: place the belt to the target input port
      const from = this.pendingFrom.from;
      const target = this.getEndpointAtScreen(tile, PortKind.Input);
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

    const target = this.getEndpointAtScreen(this.engine.screenToTile(screenX, screenY), PortKind.Input);
    if (!target || target.building === this.pendingFrom.from.building) {
      this.setPreview(null);
      return;
    }

    const result = this.engine.canPlaceBelt(this.pendingFrom.from, target);
    if (!result.ok) {
      this.setPreview(null);
      return;
    }

    this.setPreview({
      kind: 'belt',
      isValid: true,
      tiles: result.plan.segments.map((segment) => ({
        coord: segment.coord,
        tint: BELT_PREVIEW_TINT,
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
  ): PortEndpoint | null {
    const building = this.engine.getBuildingAt(tile.x, tile.y);
    if (!building) return null;
    return this.findAvailablePort(building, tile, kind);
  }

  private findAvailablePort(
    building: Building,
    clickedTile: TileCoord,
    kind: typeof PortKind.Input | typeof PortKind.Output,
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

    const exactPort = availablePorts.find((candidate) =>
      this.portOwnsTile(candidate, building, clickedTile),
    );
    if (!exactPort) return null;

    return { building: building.id, port: exactPort.id };
  }

  private portOwnsTile(port: Port, building: Building, clickedTile: TileCoord): boolean {
    const type = getBuildingType(building.typeId);
    if (!type) return false;
    const worldTile = worldTileOf(port, building.origin, building.rotation, type.footprint);
    return worldTile.x === clickedTile.x && worldTile.y === clickedTile.y;
  }
}
