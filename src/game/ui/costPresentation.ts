import { resourceTypeLabel } from '../data/buildingCatalog';
import type { BeltFailure, PlacementFailure, ResourceCost, ResourceType } from '../types';
import { getResourceSprite } from './resourcePresentation';

/** One resource line of a construction cost, ready to render. */
export interface CostLine {
  readonly resourceType: ResourceType;
  readonly label: string;
  readonly sprite: string | undefined;
  readonly amount: number;
  /** What the global stock lacks for this line; 0 when it is covered. */
  readonly missing: number;
}

/** Pairs a cost with what is missing to pay it (see GameEngine.getMissingResources). */
export function costLines(cost: readonly ResourceCost[], missing: readonly ResourceCost[]): CostLine[] {
  return cost.map(({ resourceType, amount }) => ({
    resourceType,
    label: resourceTypeLabel(resourceType),
    sprite: getResourceSprite(resourceType),
    amount,
    missing: missing.find((line) => line.resourceType === resourceType)?.amount ?? 0,
  }));
}

/** Accessible reading of a cost, e.g. "10 Régolithe, 5 Oxygène". */
export function costText(lines: readonly CostLine[]): string {
  return lines.map((line) => `${line.amount} ${line.label}`).join(', ');
}

const FAILURE_LABELS: Record<PlacementFailure | BeltFailure, string> = {
  out_of_bounds: 'Hors de la carte',
  tile_occupied: 'Emplacement occupé',
  tile_type_invalid: 'Terrain inadapté',
  resource_required: 'Doit être posé sur un gisement',
  resource_forbidden: 'Impossible sur un gisement',
  unknown_type: 'Bâtiment inconnu',
  id_overflow: 'Limite de constructions atteinte',
  tile_fogged: 'Zone inexplorée',
  system_placed: 'Non constructible',
  locked: 'Verrouillé',
  insufficient_resources: 'Ressources insuffisantes',
  no_path: 'Aucun tracé possible',
  source_port_taken: 'Sortie déjà reliée',
  target_port_taken: 'Entrée déjà reliée',
  port_kind_mismatch: 'Ports incompatibles',
  unknown_building: 'Bâtiment introuvable',
  unknown_port: 'Port introuvable',
  self_connection: 'Même bâtiment aux deux bouts',
  tiles_blocked: 'Tracé bloqué',
};

/** Short player-facing reason for a refused placement. */
export function placementFailureLabel(reason: PlacementFailure | BeltFailure): string {
  return FAILURE_LABELS[reason];
}
