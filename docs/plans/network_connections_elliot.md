# Plan — Réseau / connexions entre bâtiments (v1 topologie pure)

## Philosophie

v1 = **graphe topologique pur**. On pose la structure sur laquelle Julien branchera
ses ressources plus tard. Aucun flux, aucun débit, aucun tick. Juste: "ce bâtiment
est connecté à celui-là, par ce port, dans ce sens".

C'est le squelette. Les ressources sont le sang. Julien ajoute le sang quand le
squelette tient debout.

## Décisions verrouillées

1. **Connexion = arête dirigée** entre deux `BuildingId`, via deux `PortId`
   (output d'un, input de l'autre). Le sens compte dès v1 — un convoyeur n'est
   pas symétrique et on ne veut pas re-migrer plus tard.
2. **Ports déclarés sur `BuildingType`**, pas sur `Building`. Un type a N ports
   input et M ports output, chacun positionné relativement à l'origin + côté
   (`Direction`). La rotation du bâtiment fait tourner les ports (signature prête,
   logique no-op tant que rotation est no-op partout ailleurs — cohérence).
3. **Pas de pathfinding, pas de tuiles de convoyeur en v1.** Une connexion est
   une arête logique entre deux ports adjacents. Le "convoyeur" visuel viendra
   avec le rendu, pas avec le modèle. Si les deux ports ne sont pas adjacents
   (tuile à tuile, côtés face-à-face), la connexion est refusée.
4. **Stockage: `ConnectionRegistry` dédié** (miroir de `BuildingRegistry`).
   `Map<ConnectionId, Connection>` + index `Map<BuildingId, Set<ConnectionId>>`
   pour lookup en O(1) à la suppression d'un bâtiment.
5. **Suppression en cascade**: supprimer un bâtiment supprime automatiquement
   toutes ses connexions. Atomique — si la suppression du bâtiment échoue, les
   connexions restent.

## Fichiers à créer/modifier

```
NEW  src/game/data/ConnectionRegistry.ts
NEW  tests/data/ConnectionRegistry.test.ts
NEW  tests/engine/GameEngine.connection.test.ts
MOD  src/game/types.ts                    # +Port, +PortId, +Connection, +ConnectionId,
                                          # +ConnectionFailure, +ConnectionResult
MOD  src/game/data/buildingCatalog.ts     # ajouter ports aux placeholders
MOD  src/game/engine/GameEngine.ts        # +connect, +disconnect, +canConnect,
                                          # +getConnectionsOf, +getConnections
                                          # MOD removeBuilding → cascade
```

## Types ajoutés

```ts
export type PortId = number;              // index local au BuildingType, 0-based
export type ConnectionId = number;

export const PortKind = {
  Input: 0,
  Output: 1,
} as const;
export type PortKind = (typeof PortKind)[keyof typeof PortKind];

export interface Port {
  readonly id: PortId;                    // unique dans le BuildingType
  readonly kind: PortKind;
  readonly offset: TileCoord;             // relatif à origin (pré-rotation)
  readonly side: Direction;               // côté de la tuile où sort le port
}

export interface BuildingType {
  // ...existant
  readonly ports: readonly Port[];        // peut être vide
}

export interface Connection {
  readonly id: ConnectionId;
  readonly from: { building: BuildingId; port: PortId };  // output
  readonly to:   { building: BuildingId; port: PortId };  // input
}

export type ConnectionFailure =
  | 'unknown_building'
  | 'unknown_port'
  | 'port_kind_mismatch'      // from doit être Output, to doit être Input
  | 'port_already_connected'  // un port = une connexion max en v1
  | 'ports_not_adjacent'      // tuiles non-adjacentes ou côtés non-face-à-face
  | 'self_connection'         // from.building === to.building
  | 'id_overflow';

export type ConnectionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ConnectionFailure };
```

## API finale `GameEngine`

```ts
canConnect(
  from: { building: BuildingId; port: PortId },
  to:   { building: BuildingId; port: PortId },
): ConnectionResult

connect(
  from: { building: BuildingId; port: PortId },
  to:   { building: BuildingId; port: PortId },
): ConnectionId | null

disconnect(id: ConnectionId): boolean

getConnectionsOf(buildingId: BuildingId): readonly Connection[]
getConnections(): ReadonlyMap<ConnectionId, Connection>
```

## Invariants critiques à tester

1. **Un port = une connexion max.** Tenter de reconnecter un port déjà utilisé
   retourne `port_already_connected`, aucun état modifié.
2. **Sens obligatoire.** `connect(output, input)` OK. `connect(input, output)`,
   `connect(output, output)`, `connect(input, input)` → `port_kind_mismatch`.
3. **Pas de self-loop.** Connecter un bâtiment à lui-même → `self_connection`.
4. **Adjacence stricte.** Deux ports doivent être sur des tuiles adjacentes
   (Manhattan = 1) ET leurs `side` doivent être opposés (North face South, etc.).
   Sinon → `ports_not_adjacent`.
5. **Cascade à la suppression.** `removeBuilding(id)` supprime toutes les
   connexions référençant `id` (en from ou to). Index `buildingId → Set<ConnectionId>`
   laissé vide et cohérent.
6. **IDs stables et monotones.** Supprimer puis re-connecter n'a pas à réutiliser
   un `ConnectionId`.
7. **Lookup O(1).** `getConnectionsOf(buildingId)` ne scanne pas toutes les
   connexions — vérifier que l'index est maintenu (test via grand nombre de
   bâtiments + profiling ou au minimum assertion sur l'usage du Set).
8. **Atomicité du connect.** Si `canConnect` passe mais une invariante interne
   casse après (ex: overflow), aucun index n'est pollué.

## Plan de tests (13 cases)

```
ConnectionRegistry.test.ts
  1.  register → get retourne la même connexion
  2.  register incrémente l'id de façon monotone
  3.  unregister retire de la map ET de l'index
  4.  getConnectionsOf retourne les connexions d'un bâtiment (from et to)
  5.  getConnectionsOf retourne [] pour un bâtiment inconnu
  6.  id overflow retourne null

GameEngine.connection.test.ts
  7.  connect OK entre output et input adjacents face-à-face
  8.  connect refuse kind mismatch
  9.  connect refuse self-connection
  10. connect refuse port déjà connecté (des deux côtés)
  11. connect refuse ports non-adjacents
  12. connect refuse ports adjacents mais sides non-opposés
  13. removeBuilding supprime les connexions en cascade (from ET to)
```

## NOT in scope

- Flux de ressources, débit, latence, backpressure — Julien
- Tuiles de convoyeur multi-cases (connexions longue distance, pathfinding)
- Ports multi-ressources / typage des ressources
- Validation "ce port n'accepte que du minerai X"
- Rendu des connexions (lignes, flèches, animations)
- UI de connexion (click port source → click port cible)
- Rotation effective des ports (signature prête, logique no-op comme pour buildings)
- Persistence localStorage
- Undo/redo
- Connexions 1-N ou N-1 (splitters, mergers) — v1 = 1-1 strict

## Handoff Julien (ressources)

Ce que cette branche lui livre, prêt à consommer:
- `engine.getConnectionsOf(buildingId)` pour itérer sur les voisins logiques
- `engine.getConnections()` pour un parcours global du graphe
- `Connection.from` / `Connection.to` avec sens déjà correct (output → input)
- Les ports sont déjà typés par `PortKind`, il ajoute juste un champ
  `resourceType?: ResourceTypeId` sur `Port` quand il en aura besoin —
  non-breaking

Je ne touche pas: GridRenderer, TileSprite, GameCanvas.tsx, composants React,
buildingCatalog au-delà d'ajouter les ports aux placeholders existants.

## Risques identifiés

1. **L'adjacence face-à-face dépend de la rotation du bâtiment.** En v1 rotation
   est no-op, donc on calcule avec `Direction.North` comme si aucune rotation
   n'était appliquée. À documenter clairement — sinon trappe à bug quand la
   rotation deviendra effective.
2. **Les placeholders actuels (1x1, 3x3) n'ont pas de ports.** Ajouter au moins
   un placeholder avec 1 input + 1 output pour que les tests soient crédibles.
   Garder les placeholders "nus" pour tester le cas "bâtiment sans ports".
3. **Pas de tick ≠ pas de simulation.** Bien rappeler dans les commentaires que
   `Connection` est une structure, pas un canal. Rien ne "circule" tant que
   Julien ne branche pas son système de ressources avec un tick.

## Effort estimé

Humain: ~4-6h (modèle, tests, intégration, cascade propre).
CC + gstack: ~30-45 min.

## Prochaines étapes

1. `git checkout -b feat/building-connections`
2. Implémenter selon le plan
3. `/plan-eng-review` recommandé — l'invariant d'adjacence rotation-aware mérite
   une passe archi avant code
4. Tests verts → PR vers `main`
5. Puis: tick de simulation, puis Julien branche les ressources sur le graphe
