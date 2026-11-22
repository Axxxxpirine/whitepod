import { REVEALED_FLAG } from '@/game/constants';
import { toIndex, isInBounds } from '@/game/data/coords';
import {
  BATTERY_BASIC_BUILDING_TYPE_ID,
  CONVERTER_BUILDING_TYPE_ID,
  EXTRACTOR_BUILDING_TYPE_ID,
  HUB_BUILDING_TYPE_ID,
  MERGER_BASIC_BUILDING_TYPE_ID,
  SOLAR_PANEL_BUILDING_TYPE_ID,
  STORAGE_BUILDING_TYPE_ID,
  SYNTHESIZER_BUILDING_TYPE_ID,
  getBuildingType,
} from '@/game/data/buildingCatalog';
import { GameMode } from '@/game/data/gameMode';
import type { MilestoneId } from '@/game/data/milestoneCatalog';
import type { RecipeId } from '@/game/data/recipeCatalog';
import { GameEngine } from '@/game/engine/GameEngine';
import {
  Direction,
  ResourceType,
  TileType,
  type BuildingId,
  type BuildingTypeId,
  type PortId,
  type ResourceCost,
  type TileCoord,
} from '@/game/types';

/**
 * A scripted player for balance checks: it plays a campaign through the real
 * engine (placement rules, costs, power, belts, recipes, milestones) and
 * records when each milestone is completed. It knows the plan and never
 * hesitates, but every placement costs it some seconds of game time, so its
 * timings are a lower bound of what a fluent human would get.
 */

/** Simulation step, small enough for 2-second extraction ticks. */
const STEP_SECONDS = 0.25;
/** Game time a fluent player spends per placement (choose, aim, click). */
const PLAYER_SECONDS_PER_ACTION = 4;
/** Workshops (converters, mergers, synthesizers) keep this much free ground around them for belts. */
const WORKSHOP_MARGIN = 2;
/** How far the player looks for a free deposit around a workshop. */
const DEPOSIT_SEARCH_RADIUS = 30;
/** Distance from the hub centre to each workshop site. */
const SITE_DISTANCE = 18;
/** Workshop sites around the hub; south-west is the energy farm. */
const SITE_DIRECTIONS: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [1, -1],
  [-1, -1],
  [1, 1],
];
/** Extra distance of each further ring of workshop sites. */
const RING_SPACING = 16;
/** Converters feeding a synthesizer sit this far behind it, this far apart on either side. */
const FEEDER_DISTANCE = 9;
const FEEDER_SPREAD = 6;
/** Distance from the hub centre to the collector merger. */
const COLLECTOR_DISTANCE = 6;
/** Spots a player tries for a workshop before giving up on a site. */
const SPOTS_TRIED = 12;
const MERGER_INPUTS: readonly PortId[] = ['in_west', 'in_north', 'in_south'];
const STORAGE_INPUTS: readonly PortId[] = ['in_west', 'in_north', 'in_east', 'in_south'];
/** A wait longer than this means the campaign is stuck (soft lock). */
const MAX_WAIT_SECONDS = 20 * 60;

/** Mean solar output over a day-night cycle, as a share of the panel rating (√cos daylight curve). */
const SOLAR_MEAN_FACTOR = 0.38;
/** Margin on top of the mean, for battery rate limits and twilight. */
const POWER_MARGIN = 1.25;
/** Without batteries, panels are sized to run while daylight is above this. */
const DAYTIME_ONLY_DAYLIGHT = 0.5;
/** Share of a cycle the batteries must carry (night plus twilight deficits). */
const NIGHT_SHARE = 0.6;

export interface MilestoneTiming {
  readonly id: MilestoneId;
  readonly chapter: number;
  readonly seconds: number;
}

/** A synthesizer input: a converter on `recipe` fed by regolith extractors, or `resource` extractors belted straight in. */
export type FeederSpec =
  | { readonly recipe: RecipeId; readonly extractors: number }
  | { readonly resource: ResourceType; readonly extractors: number };

interface Endpoint {
  readonly building: BuildingId;
  readonly port: PortId;
}

const HUB_PORTS: readonly PortId[] = getBuildingType(HUB_BUILDING_TYPE_ID)!.ports.map((port) => port.id);

export class ScriptedCampaignPlayer {
  readonly engine: GameEngine;
  readonly timings: MilestoneTiming[] = [];
  seconds = 0;
  private energyRoot: BuildingId | null = null;
  private readonly usedHubPorts = new Set<PortId>();
  private readonly collectorInputs: Endpoint[] = [];
  /** Extractors belted straight to the hub (`deliveryLine`), with the input each one took. */
  private readonly deliveries: Endpoint[] = [];
  private sitesUsed = 0;
  private readonly hubId: BuildingId;
  private readonly hubCenter: TileCoord;

  constructor(seed: number) {
    this.engine = new GameEngine(1280, 720, { gameMode: GameMode.Campaign });
    this.engine.generateMap(seed);
    // The player explores as the lines grow (watchtower from milestone 2):
    // modelled as a revealed map, the watchtower cost left out.
    this.engine.grid.revealAll();
    this.hubId = this.engine.getHubId()!;
    const hub = this.engine.getBuildings().get(this.hubId)!;
    this.hubCenter = { x: hub.origin.x + 2, y: hub.origin.y + 2 };
  }

  // --- Time ---------------------------------------------------------------

  /** Runs the simulation; completes the active milestone as soon as it is ready, like a player watching the panel. */
  advance(seconds: number): void {
    for (let t = 0; t < seconds; t += STEP_SECONDS) {
      this.engine.update(STEP_SECONDS);
      this.seconds += STEP_SECONDS;
      const progress = this.engine.getMilestoneProgress();
      if (progress?.ready && this.engine.completeActiveMilestone()) {
        this.timings.push({ id: progress.milestone.id, chapter: progress.milestone.chapter, seconds: this.seconds });
      }
    }
  }

  /** Error with where the campaign stood, to tell a balance problem from a layout one. */
  private fail(message: string): Error {
    const done = this.timings.map((timing) => timing.id).join(', ') || 'none';
    const map = process.env.BALANCE_DEBUG ? `\n${this.renderMap()}` : '';
    return new Error(`${message} (at ${Math.round(this.seconds)}s, milestones done: ${done})${map}`);
  }

  /** ASCII map around the hub, for debugging layouts (BALANCE_DEBUG=1). */
  renderMap(radius = 24): string {
    const glyph: Record<string, string> = {
      hub_lander: 'H', extractor_basic: 'x', storage_basic: 'S', solar_panel: 'p', battery_basic: 'b',
      merger_basic: 'm', converter_basic: 'C', synthesizer_basic: 'Y', watchtower: 'T',
      belt_straight: '-', belt_corner_cw: '+', belt_corner_ccw: '+',
    };
    const rows: string[] = [];
    for (let y = this.hubCenter.y - radius; y <= this.hubCenter.y + radius; y++) {
      let row = `${String(y).padStart(4)} `;
      for (let x = this.hubCenter.x - radius; x <= this.hubCenter.x + radius; x++) {
        const building = this.engine.getBuildingAt(x, y);
        if (building) row += glyph[building.typeId] ?? '?';
        else row += this.engine.getResourceAt(x, y) === ResourceType.None ? '.' : 'o';
      }
      rows.push(row);
    }
    return `     x from ${this.hubCenter.x - radius}\n${rows.join('\n')}`;
  }

  waitFor(condition: () => boolean, label: string): void {
    const deadline = this.seconds + MAX_WAIT_SECONDS;
    while (!condition()) {
      if (this.seconds >= deadline) {
        throw this.fail(`Stuck at ${Math.round(this.seconds)}s waiting for ${label}; hub holds ${JSON.stringify(this.engine.getHubInventory())}`);
      }
      this.advance(STEP_SECONDS);
    }
  }

  waitForMilestone(id: MilestoneId): void {
    this.waitFor(() => this.engine.getCompletedMilestoneIds().includes(id), `milestone ${id}`);
  }

  private pay(cost: readonly ResourceCost[], label: string): void {
    this.waitFor(() => this.engine.canAfford(cost), `resources for ${label}`);
  }

  // --- Building -------------------------------------------------------------

  place(typeId: BuildingTypeId, origin: TileCoord, rotation: Direction = Direction.North): BuildingId {
    this.ensurePowerFor(typeId);
    this.pay(this.engine.getBuildingCost(typeId), typeId);
    const id = this.engine.placeBuilding(typeId, origin, rotation, { emitSfx: false });
    if (id === null) {
      throw this.fail(`Cannot place ${typeId} at ${origin.x},${origin.y}: ${JSON.stringify(this.engine.canPlaceBuilding(typeId, origin, rotation))}`);
    }
    this.linkPower(id);
    this.advance(PLAYER_SECONDS_PER_ACTION);
    return id;
  }

  belt(from: Endpoint, to: Endpoint): void {
    const quote = this.engine.quoteBelt(from, to);
    if (!quote.ok) throw this.fail(`No belt route from ${JSON.stringify(from)} to ${JSON.stringify(to)}: ${quote.reason}`);
    this.pay(quote.cost, 'belt');
    const placed = this.engine.placeBelt(from, to);
    if (!placed.ok) throw this.fail(`Belt from ${JSON.stringify(from)} to ${JSON.stringify(to)} refused: ${placed.reason}`);
    this.advance(PLAYER_SECONDS_PER_ACTION);
  }

  setRecipe(processor: BuildingId, recipe: RecipeId): void {
    if (!this.engine.setProcessorRecipe(processor, recipe)) throw this.fail(`Recipe ${recipe} refused`);
  }

  /** Free hub inputs; each delivery line takes the one its belt reaches most cheaply. */
  private freeHubInputs(): Endpoint[] {
    return HUB_PORTS.filter((port) => !this.usedHubPorts.has(port)).map((port) => ({ building: this.hubId, port }));
  }

  private routeCost(from: Endpoint, to: Endpoint): number | null {
    const quote = this.engine.quoteBelt(from, to);
    return quote.ok ? quote.plan.segments.length : null;
  }

  /**
   * Places `typeId` at `origin`, turned so the belt from `outPort` to one of
   * `targets` is the shortest: the player tries the four rotations, as one
   * does with R. Returns the building output and the target it should reach.
   */
  private placeFacing(
    typeId: BuildingTypeId,
    origin: TileCoord,
    outPort: PortId,
    targets: readonly Endpoint[],
  ): { from: Endpoint; to: Endpoint } | null {
    this.ensurePowerFor(typeId);
    this.pay(this.engine.getBuildingCost(typeId), typeId);
    let best: { rotation: Direction; to: Endpoint; cost: number } | null = null;
    for (const rotation of [Direction.North, Direction.East, Direction.South, Direction.West]) {
      const probe = this.engine.placeBuilding(typeId, origin, rotation, { emitSfx: false });
      if (probe === null) continue;
      for (const to of targets) {
        const cost = this.routeCost({ building: probe, port: outPort }, to);
        if (cost !== null && (best === null || cost < best.cost)) best = { rotation, to, cost };
      }
      // Removal refunds the cost: probing is free, like hovering with the preview.
      this.engine.removeBuilding(probe, { emitSfx: false });
    }
    if (!best) return null;
    const id = this.place(typeId, origin, best.rotation);
    return { from: { building: id, port: outPort }, to: best.to };
  }

  /** `placeFacing` on the free spots nearest to `near`, trying the next one when no belt fits. */
  private placeFacingNear(
    typeId: BuildingTypeId,
    near: TileCoord,
    margin: number,
    outPort: PortId,
    targets: readonly Endpoint[],
  ): { from: Endpoint; to: Endpoint } | null {
    let tried = 0;
    for (const origin of this.freeSpots(typeId, near, margin)) {
      const placed = this.placeFacing(typeId, origin, outPort, targets);
      if (placed) return placed;
      if (++tried >= SPOTS_TRIED) break;
    }
    return null;
  }

  /** Extractor on the free deposit nearest to `near`, turned toward one of `targets`. */
  private extractorToward(resourceType: ResourceType, targets: readonly Endpoint[], near: TileCoord): { from: Endpoint; to: Endpoint } {
    for (const deposit of this.depositsNear(resourceType, near).slice(0, SPOTS_TRIED)) {
      const placed = this.placeFacing(EXTRACTOR_BUILDING_TYPE_ID, deposit, 'out_east', targets);
      if (placed) return placed;
    }
    throw this.fail(`No belt route from a ${resourceType} deposit near ${near.x},${near.y}`);
  }

  /** Places a workshop on `site`, turned toward the hub inputs on its side; its belt comes later (`deliver`). */
  private placeTowardHub(typeId: BuildingTypeId, site: TileCoord, outPort: PortId): Endpoint {
    const placed =
      this.placeFacingNear(typeId, site, WORKSHOP_MARGIN, outPort, this.hubTargets(site)) ??
      this.placeFacingNear(typeId, site, WORKSHOP_MARGIN, outPort, this.freeHubInputs());
    if (!placed) throw this.fail(`No belt route from a ${typeId} near ${site.x},${site.y} to the hub`);
    return placed.from;
  }

  /**
   * Belts `from` to the hub, once its inputs are fed. When the belts already
   * around the hub wall the last inputs off, the player sets a collector
   * merger in front of the hub (once mergers are unlocked) and delivers into it.
   */
  private deliver(from: Endpoint): void {
    const source = this.origin(from.building);
    const cheapest = (targets: readonly Endpoint[]) => {
      let best: { to: Endpoint; cost: number } | null = null;
      for (const to of targets) {
        const cost = this.routeCost(from, to);
        if (cost !== null && (best === null || cost < best.cost)) best = { to, cost };
      }
      return best?.to ?? null;
    };
    let target = cheapest(this.hubTargets(source)) ?? cheapest(this.freeHubInputs());
    if (!target && this.addCollector()) target = cheapest(this.collectorInputs);
    if (!target) throw this.fail(`No belt route from ${JSON.stringify(from)} to the hub`);
    this.take(target);
    this.belt(from, target);
  }

  /**
   * Where a line coming from `source` should enter: the free hub inputs on
   * the side facing it (lines that wrap around the hub wall it off), then the
   * collector inputs; any free input when that side is full.
   */
  private hubTargets(source: TileCoord): Endpoint[] {
    const dx = source.x - this.hubCenter.x;
    const dy = source.y - this.hubCenter.y;
    const side = Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'east' : 'west') : dy >= 0 ? 'south' : 'north';
    const facing = this.freeHubInputs().filter((input) => input.port.includes(side));
    const preferred = [...facing, ...this.collectorInputs];
    return preferred.length > 0 ? preferred : this.freeHubInputs();
  }

  private take(target: Endpoint): void {
    if (target.building === this.hubId) this.usedHubPorts.add(target.port);
    const index = this.collectorInputs.findIndex((input) => input.building === target.building && input.port === target.port);
    if (index >= 0) this.collectorInputs.splice(index, 1);
  }

  /** A merger in front of the hub gathering several deliveries into one hub input. */
  addCollector(): boolean {
    if (!this.engine.isBuildingUnlocked(MERGER_BASIC_BUILDING_TYPE_ID)) return false;
    // Out in front of the side with the most free inputs, with room around it for the lines it gathers.
    const sides = ['north', 'east', 'south', 'west'] as const;
    const offsets = { north: [0, -1], east: [1, 0], south: [0, 1], west: [-1, 0] } as const;
    const free = this.freeHubInputs();
    const side = [...sides].sort((a, b) => free.filter((i) => i.port.includes(b)).length - free.filter((i) => i.port.includes(a)).length)[0]!;
    const [dx, dy] = offsets[side];
    const near = { x: this.hubCenter.x + dx * COLLECTOR_DISTANCE, y: this.hubCenter.y + dy * COLLECTOR_DISTANCE };
    const placed = this.placeFacingNear(MERGER_BASIC_BUILDING_TYPE_ID, near, WORKSHOP_MARGIN, 'out_east', free);
    if (!placed) return false;
    this.take(placed.to);
    this.belt(placed.from, placed.to);
    this.collectorInputs.push(...MERGER_INPUTS.map((port) => ({ building: placed.from.building, port })));
    return true;
  }

  /**
   * Regolith income for construction: a storage on a new site fed by
   * `count` extractors. Storages count in the wallet but not for milestones,
   * so this leaves the hub inputs to deliveries.
   */
  incomeLine(count: number): void {
    const site = this.nextSite();
    const storage = this.place(STORAGE_BUILDING_TYPE_ID, this.freeSpot(STORAGE_BUILDING_TYPE_ID, site, WORKSHOP_MARGIN));
    const free = STORAGE_INPUTS.map((port) => ({ building: storage, port }));
    for (let i = 0; i < count; i++) {
      const { from, to } = this.extractorToward(ResourceType.Regolith, free, site);
      free.splice(free.indexOf(to), 1);
      this.belt(from, to);
    }
  }

  /** Extractor belted straight to the hub. */
  deliveryLine(resourceType: ResourceType): void {
    for (const deposit of this.depositsNear(resourceType, this.hubCenter).slice(0, SPOTS_TRIED)) {
      const placed = this.placeFacing(EXTRACTOR_BUILDING_TYPE_ID, deposit, 'out_east', this.hubTargets(deposit));
      if (!placed) continue;
      this.take(placed.to);
      this.belt(placed.from, placed.to);
      this.deliveries.push({ building: placed.from.building, port: placed.to.port });
      return;
    }
    throw this.fail(`No belt route from a ${resourceType} deposit to the hub`);
  }

  /**
   * Removes the raw delivery lines once no milestone asks for raw resources
   * any more, freeing their hub inputs for products: removing an extractor
   * takes its belt with it and refunds both.
   */
  retireDeliveryLines(): void {
    for (const { building, port } of this.deliveries.splice(0)) {
      if (!this.engine.removeBuilding(building, { emitSfx: false })) throw this.fail(`Cannot remove delivery extractor ${building}`);
      this.usedHubPorts.delete(port);
      this.advance(PLAYER_SECONDS_PER_ACTION);
    }
  }

  /** Moves the next workshops out to a wider ring, where earlier lines have not spread their belts yet. */
  nextRing(): void {
    this.sitesUsed = Math.ceil(this.sitesUsed / SITE_DIRECTIONS.length) * SITE_DIRECTIONS.length;
  }

  /** Workshops get their own site around the hub, so lines do not wall each other off; a wider ring once the first is full. */
  private nextSite(): TileCoord {
    const ring = Math.floor(this.sitesUsed / SITE_DIRECTIONS.length);
    const [dx, dy] = SITE_DIRECTIONS[this.sitesUsed++ % SITE_DIRECTIONS.length]!;
    const distance = SITE_DISTANCE + ring * RING_SPACING;
    return { x: this.hubCenter.x + dx * distance, y: this.hubCenter.y + dy * distance };
  }

  /**
   * A converter set to `recipe` on a new site, delivering to one of `targets`
   * (the hub inputs by default), fed by `count` regolith extractors through
   * mergers. Output first, then the feed, so the delivery belt is never cut off.
   */
  converterLine(recipe: RecipeId, count: number): void {
    const from = this.placeTowardHub(CONVERTER_BUILDING_TYPE_ID, this.nextSite(), 'out');
    this.setRecipe(from.building, recipe);
    // Output first, so the feed never cuts the delivery belt off.
    this.deliver(from);
    this.feed({ building: from.building, port: 'in' }, count, this.origin(from.building));
  }

  private origin(id: BuildingId): TileCoord {
    return this.engine.getBuildings().get(id)!.origin;
  }

  /** Feeds `count` extractors of `resourceType` into `input`, chaining 3-input mergers. */
  private feed(input: Endpoint, count: number, near: TileCoord, resourceType: ResourceType = ResourceType.Regolith): void {
    if (count === 1) {
      this.belt(this.extractorToward(resourceType, [input], near).from, input);
      return;
    }
    const placed = this.placeFacingNear(MERGER_BASIC_BUILDING_TYPE_ID, near, WORKSHOP_MARGIN, 'out_east', [input]);
    if (!placed) throw this.fail(`No belt route from a merger near ${near.x},${near.y}`);
    const merger = placed.from.building;
    const origin = this.origin(merger);
    this.belt(placed.from, input);
    const free = MERGER_INPUTS.map((port) => ({ building: merger, port }));
    // Keep one merger input for the chain when more than three extractors are needed.
    const direct = count > MERGER_INPUTS.length ? MERGER_INPUTS.length - 1 : count;
    for (let i = 0; i < direct; i++) {
      const { from, to } = this.extractorToward(resourceType, free, origin);
      free.splice(free.indexOf(to), 1);
      this.belt(from, to);
    }
    if (count > direct) this.feed(free[0]!, count - direct, origin, resourceType);
  }

  /**
   * A synthesizer set to `recipe` on a new site, delivering to the hub, fed
   * by two inputs set behind it: converter lines, or extractors through a
   * merger. Every belt between workshops is laid before the extractors,
   * which would otherwise box the synthesizer inputs in.
   */
  synthesizerLine(recipe: RecipeId, feeders: readonly [FeederSpec, FeederSpec]): void {
    const synth = this.placeTowardHub(SYNTHESIZER_BUILDING_TYPE_ID, this.nextSite(), 'out');
    this.setRecipe(synth.building, recipe);
    this.deliver(synth);
    // Belts cannot cross: the feeders go behind the synthesizer, on the far side from the hub.
    const origin = this.origin(synth.building);
    const out = { x: Math.sign(origin.x - this.hubCenter.x), y: Math.sign(origin.y - this.hubCenter.y) };
    const across = { x: -out.y || 1, y: out.x || 1 };
    const inputs = feeders.map((spec, index) => {
      const into = { building: synth.building, port: index === 0 ? 'in_1' : 'in_2' };
      const offset = index === 0 ? FEEDER_SPREAD : -FEEDER_SPREAD;
      const site = {
        x: origin.x + out.x * FEEDER_DISTANCE + across.x * offset,
        y: origin.y + out.y * FEEDER_DISTANCE + across.y * offset,
      };
      if ('resource' in spec) {
        // Extractors straight in: a single one is belted later, several gather in a merger set now.
        if (spec.extractors === 1) return { input: into, near: site, spec };
        const merger = this.placeFacingNear(MERGER_BASIC_BUILDING_TYPE_ID, site, WORKSHOP_MARGIN, 'out_east', [into]);
        if (!merger) throw this.fail(`No belt route from a merger near ${site.x},${site.y} to the synthesizer`);
        this.belt(merger.from, into);
        return { input: null, merger: merger.from.building, near: this.origin(merger.from.building), spec };
      }
      const converter = this.placeFacingNear(CONVERTER_BUILDING_TYPE_ID, site, WORKSHOP_MARGIN, 'out', [into]);
      if (!converter) throw this.fail(`No belt route from a converter near ${site.x},${site.y} to the synthesizer`);
      this.setRecipe(converter.from.building, spec.recipe);
      this.belt(converter.from, into);
      return { input: { building: converter.from.building, port: 'in' }, near: this.origin(converter.from.building), spec };
    });
    for (const placed of inputs) {
      const resource = 'resource' in placed.spec ? placed.spec.resource : ResourceType.Regolith;
      if (placed.input) {
        this.feed(placed.input, placed.spec.extractors, placed.near, resource);
        continue;
      }
      // Merger already belted to the synthesizer: fill its inputs (up to three extractors).
      const free = MERGER_INPUTS.map((port) => ({ building: placed.merger!, port }));
      if (placed.spec.extractors > free.length) throw this.fail(`More than ${free.length} extractors on one merger`);
      for (let i = 0; i < placed.spec.extractors; i++) {
        const { from, to } = this.extractorToward(resource, free, placed.near);
        free.splice(free.indexOf(to), 1);
        this.belt(from, to);
      }
    }
  }

  // --- Power ----------------------------------------------------------------

  private totalConsumption(extra = 0): number {
    let total = extra;
    for (const building of this.engine.getBuildings().values()) {
      total += getBuildingType(building.typeId)?.energy?.consumption ?? 0;
    }
    return total;
  }

  private count(typeId: BuildingTypeId): number {
    let total = 0;
    for (const building of this.engine.getBuildings().values()) if (building.typeId === typeId) total++;
    return total;
  }

  /** Adds panels (and batteries once unlocked) so the network keeps up with the new consumer. */
  private ensurePowerFor(typeId: BuildingTypeId): void {
    const consumption = getBuildingType(typeId)?.energy?.consumption ?? 0;
    if (consumption <= 0) return;
    const demand = this.totalConsumption(consumption);
    const panelRating = getBuildingType(SOLAR_PANEL_BUILDING_TYPE_ID)!.energy!.production!;
    const battery = getBuildingType(BATTERY_BASIC_BUILDING_TYPE_ID)!.energy!.battery!;
    const withBatteries = this.engine.isBuildingUnlocked(BATTERY_BASIC_BUILDING_TYPE_ID);

    const panels = withBatteries
      ? Math.ceil((demand * POWER_MARGIN) / (panelRating * SOLAR_MEAN_FACTOR))
      : Math.ceil(demand / (panelRating * DAYTIME_ONLY_DAYLIGHT));
    while (this.count(SOLAR_PANEL_BUILDING_TYPE_ID) < panels) {
      this.place(SOLAR_PANEL_BUILDING_TYPE_ID, this.freeSpot(SOLAR_PANEL_BUILDING_TYPE_ID, this.energyFarm()));
    }
    if (!withBatteries) return;
    const batteries = Math.ceil((demand * NIGHT_SHARE) / battery.capacity);
    while (this.count(BATTERY_BASIC_BUILDING_TYPE_ID) < batteries) {
      this.place(BATTERY_BASIC_BUILDING_TYPE_ID, this.freeSpot(BATTERY_BASIC_BUILDING_TYPE_ID, this.energyFarm()));
    }
  }

  private linkPower(id: BuildingId): void {
    const energy = getBuildingType(this.engine.getBuildings().get(id)!.typeId)?.energy;
    if (!energy) return;
    if (this.energyRoot === null) {
      this.energyRoot = id;
      return;
    }
    this.engine.connectBuildings(this.energyRoot, id);
  }

  /** Panels and batteries grow south-west of the hub, away from the delivery lines. */
  private energyFarm(): TileCoord {
    return { x: this.hubCenter.x - 9, y: this.hubCenter.y + 9 };
  }

  // --- Map queries ----------------------------------------------------------

  /** Free revealed deposits of `resourceType` around `near`, nearest first. */
  private depositsNear(resourceType: ResourceType, near: TileCoord): TileCoord[] {
    const deposits: { tile: TileCoord; distance: number }[] = [];
    for (let y = near.y - DEPOSIT_SEARCH_RADIUS; y <= near.y + DEPOSIT_SEARCH_RADIUS; y++) {
      for (let x = near.x - DEPOSIT_SEARCH_RADIUS; x <= near.x + DEPOSIT_SEARCH_RADIUS; x++) {
        if (!isInBounds(x, y)) continue;
        const index = toIndex(x, y);
        if (!(this.engine.grid.flags[index] & REVEALED_FLAG)) continue;
        if (this.engine.grid.resourceType[index] !== resourceType) continue;
        if (this.engine.getBuildingAt(x, y)) continue;
        deposits.push({ tile: { x, y }, distance: Math.abs(x - near.x) + Math.abs(y - near.y) });
      }
    }
    if (deposits.length === 0) throw this.fail(`No free ${resourceType} deposit in sight`);
    return deposits.sort((a, b) => a.distance - b.distance).map((deposit) => deposit.tile);
  }

  /** Origins around `near`, nearest first, where the footprint and a margin are free ground without deposits. */
  private *freeSpots(typeId: BuildingTypeId, near: TileCoord, margin = 1): Generator<TileCoord> {
    const { w, h } = getBuildingType(typeId)!.footprint;
    for (let radius = 0; radius <= 30; radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
          const origin = { x: near.x + dx, y: near.y + dy };
          if (this.isFreeArea(origin.x - margin, origin.y - margin, w + 2 * margin, h + 2 * margin)) yield origin;
        }
      }
    }
  }

  private freeSpot(typeId: BuildingTypeId, near: TileCoord, margin = 1): TileCoord {
    for (const origin of this.freeSpots(typeId, near, margin)) return origin;
    throw this.fail(`No room for ${typeId} near ${near.x},${near.y}`);
  }

  private isFreeArea(x0: number, y0: number, w: number, h: number): boolean {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (!isInBounds(x, y)) return false;
        const index = toIndex(x, y);
        if (!(this.engine.grid.flags[index] & REVEALED_FLAG)) return false;
        if (this.engine.grid.tileType[index] !== TileType.Ground) return false;
        if (this.engine.grid.resourceType[index] !== ResourceType.None) return false;
        if (this.engine.getBuildingAt(x, y)) return false;
      }
    }
    return true;
  }
}
