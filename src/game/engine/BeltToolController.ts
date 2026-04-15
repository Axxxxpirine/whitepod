import { getBuildingType } from '../data/buildingCatalog';
import { worldTileOf } from '../data/ConnectionRegistry';
import type { GameEngine } from './GameEngine';
import { PortKind, type Building, type BuildingId, type Port, type PortId, type SelectedTool, type TileCoord } from '../types';
import type { BeltPlacementPreviewModel } from '../renderer/placementPreviewModel';

interface PortEndpoint {
  readonly building: BuildingId;
  readonly port: PortId;
}

interface DragState {
  readonly from: PortEndpoint;
}

const BELT_PREVIEW_TINT = 0x22c55e;

export class BeltToolController {
  private readonly engine: GameEngine;
  private readonly getSelectedTool: () => SelectedTool;
  private readonly setPreview: (preview: BeltPlacementPreviewModel | null) => void;
  private dragState: DragState | null = null;

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
    const from = this.getEndpointAtScreen(tile, PortKind.Output);
    if (!from) {
      this.cancel();
      return;
    }

    this.dragState = { from };
    this.setPreview(null);
  }

  onPointerMove(screenX: number, screenY: number): void {
    if (this.getSelectedTool().kind !== 'belt') {
      this.cancel();
      return;
    }
    if (!this.dragState) return;

    const target = this.getEndpointAtScreen(this.engine.screenToTile(screenX, screenY), PortKind.Input);
    if (!target || target.building === this.dragState.from.building) {
      this.setPreview(null);
      return;
    }

    const result = this.engine.canPlaceBelt(this.dragState.from, target);
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

  onPointerUp(screenX: number, screenY: number, button: number): void {
    if (button !== 0 || !this.dragState) {
      this.cancel();
      return;
    }

    const from = this.dragState.from;
    const target = this.getEndpointAtScreen(this.engine.screenToTile(screenX, screenY), PortKind.Input);
    this.cancel();

    if (!target || target.building === from.building) return;
    this.engine.placeBelt(from, target);
  }

  onPointerLeave(): void {
    this.cancel();
  }

  onKeyDown(key: string): void {
    if (key === 'Escape') {
      this.cancel();
    }
  }

  private cancel(): void {
    this.dragState = null;
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
