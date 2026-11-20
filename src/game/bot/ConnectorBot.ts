import { getBuildingType, isProcessorTypeId, isStorageTypeId } from '@/game/data/buildingCatalog';
import { type BuildingId } from '@/game/types';
import type { GameEngine } from '@/game/engine/GameEngine';
import type { BotLifecycle, BotStatus } from './botTypes';
import { routeExtractorToStorage, routeProcessorOutputToStorage, routeExtractorToMerger, routeToProcessorInput } from './util/beltRouting';

const MAX_ACTIONS_PER_TICK = 20;

export class ConnectorBot implements BotLifecycle {
  private readonly engine: GameEngine;
  private readonly onStatusChange: (status: BotStatus) => void;
  private timerId: number | null = null;
  private active = false;
  private running = false;
  private status: BotStatus = { active: false, phase: 'booting', target: 'scan' };
  private processedExtractors = new Set<BuildingId>();
  private processedProcessors = new Set<BuildingId>();
  private connectedBuildings = new Set<BuildingId>();

  constructor(engine: GameEngine, onStatusChange: (status: BotStatus) => void) {
    this.engine = engine;
    this.onStatusChange = onStatusChange;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.setStatus({ active: true, phase: 'booting', target: 'scan' });
    this.tick();
    this.timerId = window.setInterval(() => this.tick(), 300);
  }

  stop(): void {
    this.active = false;
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    this.processedExtractors.clear();
    this.processedProcessors.clear();
    this.connectedBuildings.clear();
    this.setStatus({ active: false, phase: 'online', target: null });
  }

  private tick(): void {
    if (!this.active || this.running) return;
    this.running = true;

    try {
      const result = this.engine.runWithoutNotifications(() => this.runCycle());
      if (!result.didAct) {
        this.setStatus({ active: true, phase: 'online', target: this.describeTarget() });
      }
    } finally {
      this.running = false;
    }
  }

  private runCycle(): { didAct: boolean } {
    let didAct = false;

    for (let actions = 0; actions < MAX_ACTIONS_PER_TICK; actions++) {
      if (this.routeExtractorToNearestStorage()) {
        didAct = true;
        continue;
      }

      if (this.routeExtractorToMerger()) {
        didAct = true;
        continue;
      }

      if (this.routeProcessorToStorage()) {
        didAct = true;
        continue;
      }

      if (this.routeToProcessor()) {
        didAct = true;
        continue;
      }

      if (this.connectEnergyNetwork()) {
        didAct = true;
        continue;
      }

      break;
    }

    return { didAct };
  }

  private routeExtractorToNearestStorage(): boolean {
    const extractors = this.getBuildingsByType('extractor_basic');
    if (extractors.length === 0) return false;

    for (const extractorId of extractors) {
      if (this.processedExtractors.has(extractorId)) continue;

      const extractor = this.engine.getBuildings().get(extractorId);
      if (!extractor) continue;

      const storageId = this.findNearestStorage(extractor.origin);
      if (!storageId) continue;

      const result = routeExtractorToStorage(this.engine, extractorId, storageId);
      if (result.success) {
        this.processedExtractors.add(extractorId);
        this.setStatus({ active: true, phase: 'routing', target: `belt: extractor → storage` });
        return true;
      }
    }

    this.processedExtractors.clear();
    return false;
  }

  private routeExtractorToMerger(): boolean {
    const extractors = this.getBuildingsByType('extractor_basic');
    if (extractors.length === 0) return false;

    const mergers = this.getBuildingsByType('merger_basic');
    if (mergers.length === 0) return false;

    for (const extractorId of extractors) {
      if (this.processedExtractors.has(extractorId)) continue;

      const extractor = this.engine.getBuildings().get(extractorId);
      if (!extractor) continue;

      const mergerId = this.findNearestMerger(extractor.origin);
      if (!mergerId) continue;

      const result = routeExtractorToMerger(this.engine, extractorId, mergerId);
      if (result.success) {
        this.processedExtractors.add(extractorId);
        this.setStatus({ active: true, phase: 'routing', target: `belt: extractor → merger` });
        return true;
      }
    }

    this.processedExtractors.clear();
    return false;
  }

  private routeProcessorToStorage(): boolean {
    for (const [id, building] of this.engine.getBuildings()) {
      if (!isProcessorTypeId(building.typeId)) continue;
      if (this.processedProcessors.has(id)) continue;

      const storageId = this.findNearestStorage(building.origin);
      if (!storageId) continue;

      const result = routeProcessorOutputToStorage(this.engine, id, storageId);
      if (result.success) {
        this.processedProcessors.add(id);
        this.setStatus({ active: true, phase: 'routing', target: `belt: processor → storage` });
        return true;
      }
    }

    this.processedProcessors.clear();
    return false;
  }

  private routeToProcessor(): boolean {
    const extractors = this.getBuildingsByType('extractor_basic');
    if (extractors.length === 0) return false;

    const processors = this.getBuildingsByType('converter_basic');
    if (processors.length === 0) return false;

    for (const extractorId of extractors) {
      if (this.processedExtractors.has(extractorId)) continue;

      const extractor = this.engine.getBuildings().get(extractorId);
      if (!extractor) continue;

      const processorId = this.findNearestProcessor(extractor.origin);
      if (!processorId) continue;

      const result = routeToProcessorInput(this.engine, extractorId, processorId);
      if (result.success) {
        this.processedExtractors.add(extractorId);
        this.setStatus({ active: true, phase: 'routing', target: `belt: extractor → converter` });
        return true;
      }
    }

    this.processedExtractors.clear();
    return false;
  }

  private connectEnergyNetwork(): boolean {
    const energyBuildings = this.getEnergyCapableBuildings();
    if (energyBuildings.length < 2) return false;

    const batteries = this.getBuildingsByType('battery_basic');
    const solarPanels = this.getBuildingsByType('solar_panel');
    const extractors = this.getBuildingsByType('extractor_basic');

    let hubId: BuildingId | null = null;

    if (batteries.length > 0) {
      hubId = batteries[0]!;
    } else if (solarPanels.length > 0) {
      hubId = solarPanels[0]!;
    } else {
      hubId = extractors[0]!;
    }

    if (!hubId || this.connectedBuildings.has(hubId)) return false;

    for (const buildingId of energyBuildings) {
      if (buildingId === hubId) continue;
      if (this.connectedBuildings.has(buildingId)) continue;
      if (this.engine.areBuildingsEnergyLinked(hubId, buildingId)) continue;

      if (this.engine.connectBuildings(hubId, buildingId)) {
        this.connectedBuildings.add(buildingId);
        this.setStatus({ active: true, phase: 'powering', target: `energy: connected building` });
        return true;
      }
    }

    this.connectedBuildings.clear();
    return false;
  }

  private getBuildingsByType(typeId: string): BuildingId[] {
    const ids: BuildingId[] = [];
    for (const [id, building] of this.engine.getBuildings()) {
      if (building.typeId === typeId) ids.push(id);
    }
    return ids;
  }

  private getEnergyCapableBuildings(): BuildingId[] {
    const buildings: BuildingId[] = [];
    for (const [id, building] of this.engine.getBuildings()) {
      const type = getBuildingType(building.typeId);
      if (type?.energy) {
        buildings.push(id);
      }
    }
    return buildings;
  }

  private findNearestStorage(origin: { x: number; y: number }): BuildingId | null {
    const storage: Array<{ id: BuildingId; distance: number }> = [];

    for (const [id, building] of this.engine.getBuildings()) {
      if (!isStorageTypeId(building.typeId)) continue;

      const distance = Math.abs(building.origin.x - origin.x) + Math.abs(building.origin.y - origin.y);
      storage.push({ id, distance });
    }

    if (storage.length === 0) return null;

    storage.sort((a, b) => a.distance - b.distance || a.id - b.id);
    return storage[0]!.id;
  }

  private findNearestMerger(origin: { x: number; y: number }): BuildingId | null {
    const mergers: Array<{ id: BuildingId; distance: number }> = [];

    for (const [id, building] of this.engine.getBuildings()) {
      const type = getBuildingType(building.typeId);
      if (type?.id !== 'merger_basic') continue;

      const distance = Math.abs(building.origin.x - origin.x) + Math.abs(building.origin.y - origin.y);
      mergers.push({ id, distance });
    }

    if (mergers.length === 0) return null;

    mergers.sort((a, b) => a.distance - b.distance || a.id - b.id);
    return mergers[0]!.id;
  }

  private findNearestProcessor(origin: { x: number; y: number }): BuildingId | null {
    const processors: Array<{ id: BuildingId; distance: number }> = [];

    for (const [id, building] of this.engine.getBuildings()) {
      if (!isProcessorTypeId(building.typeId)) continue;

      const distance = Math.abs(building.origin.x - origin.x) + Math.abs(building.origin.y - origin.y);
      processors.push({ id, distance });
    }

    if (processors.length === 0) return null;

    processors.sort((a, b) => a.distance - b.distance || a.id - b.id);
    return processors[0]!.id;
  }

  private describeTarget(): string {
    const extractors = this.getBuildingsByType('extractor_basic');
    const processors = this.getBuildingsByType('converter_basic');
    return `e${extractors.length} p${processors.length}`;
  }

  private setStatus(status: BotStatus): void {
    if (
      this.status.active === status.active &&
      this.status.phase === status.phase &&
      this.status.target === status.target
    ) {
      return;
    }

    this.status = status;
    this.onStatusChange(status);
  }
}
