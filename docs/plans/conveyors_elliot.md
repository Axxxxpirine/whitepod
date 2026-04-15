# Plan d'implémentation — Convoyeurs v1

## Objectif

Livrer des convoyeurs **physiques** sous forme de segments `Building` 1x1,
placés par drag entre un port `Output` source et un port `Input` cible.

Le convoyeur reste un **graphe de bâtiments** dans `ConnectionRegistry` :

`source -> belt_0 -> belt_1 -> ... -> belt_n -> cible`

Pas de tick, pas de flux, pas de vitesse en v1. On livre la topologie
physique, le placement, la suppression et le preview.

## État actuel du repo

### Déjà fait et exploitable

1. **Base connexions stable**
   - `ConnectionRegistry` existe.
   - `worldSideOf`, `worldTileOf`, `oppositeSide`, `unitVector` existent.
   - Les tests de connexion sont présents et passent.

2. **Types convoyeurs introduits**
   - `SelectedTool` supporte déjà `{ kind: 'belt' }`.
   - `BeltSegment`, `PendingEndpoint`, `PendingConnection`, `BeltPlan`,
     `BeltFailure`, `BeltResult` existent dans `src/game/types.ts`.

3. **Catalog convoyeurs partiellement verrouillé**
   - `belt_straight`
   - `belt_corner_cw`
   - `belt_corner_ccw`
   - `isBeltTypeId()`

4. **Routeur déjà démarré**
   - `src/game/engine/BeltRouter.ts` existe.
   - Il route déjà entre **tuiles extérieures** aux ports.
   - Il gère déjà les deux coins miroir.
   - Les tests `tests/engine/BeltRouter.test.ts` existent et passent.

5. **Intégration UI encore incomplète**
   - `InputHandler` connaît l'outil belt mais ne l'utilise pas encore.
   - `PlacementPreviewRenderer` ne sait rendre qu'un preview rectangle
     mono-footprint.
   - `GameHUD` n'a pas encore de bouton convoyeur.
   - `GameCanvas` ne branche encore aucun contrôleur dédié convoyeurs.

### Vérification actuelle

Au moment de cette note :

- `tests/engine/BeltRouter.test.ts` : vert
- `tests/engine/GameEngine.connection.test.ts` : vert

Donc la fondation data + géométrie + routing est déjà assez avancée.

## Décisions verrouillées

1. **Un segment de convoyeur est un `Building` 1x1.**
   Pas de `BeltRegistry`, pas de `BeltId`.

2. **Il faut 3 types de segments en v1.**
   - `belt_straight`
   - `belt_corner_cw`
   - `belt_corner_ccw`

   Un seul type de coin ne suffit pas dans un graphe dirigé.

3. **Le routeur travaille entre tuiles extérieures aux ports.**
   - `enterTile = worldTileOf(fromPort) + unitVector(fromSide)`
   - `exitTile = worldTileOf(toPort) + unitVector(toSide)`

   La BFS ne doit jamais viser une tuile déjà occupée par le bâtiment cible.

4. **Le preview et le commit n'ont pas exactement le même contrat.**
   - Le preview a besoin d'un résultat riche, éventuellement partiel.
   - Le commit a besoin d'un résultat typé et atomique.

5. **`placeBelt` doit retourner un résultat typé.**
   Un simple `null` ne suffit pas pour exposer `tiles_blocked` et les autres
   causes d'échec au release.

6. **La suppression reste par composante connexe belt.**
   `removeBelt(segmentId)` supprime toute la composante composée de belts,
   en s'arrêtant aux non-belts.

7. **`removeBuilding(non-belt)` laisse les belts orphelins en v1.**
   On garde ce choix produit.

## Contrat cible

### 1. Routeur pur

Conserver `planBelt(view, from, to)` comme primitive pure pour le cas
**port -> port**.

Contrat recommandé :

```ts
planBelt(
  view: BeltRouterView,
  from: { building: BuildingId; port: PortId },
  to: { building: BuildingId; port: PortId },
): BeltResult
```

Ce contrat est déjà proche de ce qui existe et il est bon pour :

- les tests purs
- la revalidation au commit
- la génération des segments + connexions pending

### 2. Commit engine

Ajouter un résultat dédié au commit :

```ts
export type PlaceBeltResult =
  | {
      readonly ok: true;
      readonly segmentIds: readonly BuildingId[];
      readonly plan: BeltPlan;
    }
  | {
      readonly ok: false;
      readonly reason: BeltFailure;
    };
```

API cible :

```ts
canPlaceBelt(
  from: { building: BuildingId; port: PortId },
  to: { building: BuildingId; port: PortId },
): BeltResult

placeBelt(
  from: { building: BuildingId; port: PortId },
  to: { building: BuildingId; port: PortId },
): PlaceBeltResult

removeBelt(segmentId: BuildingId): boolean
```

Pourquoi :

- `canPlaceBelt` reste le dry-run pur
- `placeBelt` expose l'erreur réelle côté UI
- `removeBelt` peut confirmer si l'id donné était bien un belt

### 3. Preview UI

Ne pas surcharger `BeltResult` avec de la donnée UI.

Ajouter plutôt un modèle de preview dédié, par exemple :

```ts
export interface BeltPreviewTile {
  readonly coord: TileCoord;
  readonly tint: number;
}

export interface BeltPreviewState {
  readonly tiles: readonly BeltPreviewTile[];
  readonly isValid: boolean;
  readonly reason?: BeltFailure;
}
```

Le preview peut être construit à partir de :

- `BeltResult.ok === true` -> preview vert sur `plan.segments`
- `BeltResult.ok === false` -> pas de faux chemin inventé dans un premier temps

Décision importante : **en v1, ne pas promettre de chemin partiel rouge** si le
routeur ne l'expose pas déjà proprement. C'est un polish, pas un prérequis.

## Stratégie d'implémentation

### Phase 1 — Stabiliser le socle moteur

Objectif : figer le contrat de données avant l'intégration UI.

Travail :

1. Mettre à jour `src/game/types.ts`
   - ajouter `PlaceBeltResult`
   - garder `BeltResult` pour le routeur
   - corriger les commentaires qui parlent encore de `belt_corner` unique

2. Finaliser `src/game/data/buildingCatalog.ts`
   - conserver `belt_straight`
   - conserver `belt_corner_cw`
   - conserver `belt_corner_ccw`
   - vérifier que `isBeltTypeId` couvre bien les 3 types

3. Stabiliser `src/game/engine/BeltRouter.ts`
   - ne plus changer le contrat sauf nécessité forte
   - garder BFS déterministe ordre `N, E, S, W`
   - garder la cible sur `exitTile`
   - documenter clairement la segmentation CW / CCW

Critère de sortie :

- Tous les tests `BeltRouter` sont verts
- Les types n'ont plus de contradiction avec le plan

### Phase 2 — Ajouter le commit atomique dans `GameEngine`

Objectif : pouvoir poser et supprimer un convoyeur complet sans résidus.

Travail :

1. Ajouter `canPlaceBelt()`
   - simple délégation à `planBelt(this, from, to)`

2. Ajouter `placeBelt()`
   - re-exécute `planBelt()` au commit
   - si échec routeur -> retourne `{ ok: false, reason }`
   - revalide chaque segment avec `canPlaceBuilding()`
   - si une tuile n'est plus libre -> `tiles_blocked`
   - crée les segments dans l'ordre source -> cible
   - résout les `PendingConnection` vers de vrais `BuildingId`
   - connecte chaque arête
   - rollback total si un placement ou une connexion échoue

3. Ajouter `removeBelt(segmentId)`
   - vérifier que `segmentId` existe et est un belt
   - BFS/DFS sur le graphe `ConnectionRegistry`
   - ne traverser que les bâtiments dont `typeId` est un belt
   - supprimer d'abord les connexions, puis les bâtiments

4. Ajouter helpers privés si utile
   - `resolvePendingEndpoint()`
   - `rollbackPlacedBelts()`
   - `collectConnectedBeltComponent()`

Critère de sortie :

- `GameEngine` sait poser une ligne de belts complète
- `placeBelt` est atomique
- `removeBelt` supprime la composante entière

### Phase 3 — Couvrir le moteur par tests d'intégration

Créer `tests/engine/GameEngine.belt.test.ts`.

Cas minimum à couvrir :

1. `placeBelt` pose `n` segments et `n + 1` connexions
2. `placeBelt` retourne `source_port_taken`
3. `placeBelt` retourne `target_port_taken`
4. `placeBelt` retourne `tiles_blocked` si une case est occupée entre dry-run et commit
5. rollback total si un placement de segment échoue en cours
6. rollback total si une connexion échoue en cours
7. `removeBelt` supprime toute la composante belt
8. `removeBelt` ne supprime pas les bâtiments non-belt voisins
9. `removeBuilding(source)` laisse les belts orphelins
10. id inconnu / non-belt sur `removeBelt` -> `false`

Critère de sortie :

- Le moteur convoyeurs tient sans UI

### Phase 4 — Introduire le state d'interaction belt

Objectif : ajouter l'outil convoyeur sans casser les outils existants.

Décision de design :

**ne pas surcharger `InputHandler` avec tout l'état belt**.

Vu l'état actuel du code, le plus propre est d'ajouter un petit contrôleur
dédié, par exemple `BeltToolController`, branché depuis `GameCanvas`.

Rôle du contrôleur :

- détecter le clic initial sur un port `Output`
- suivre le drag
- détecter le release sur un port `Input`
- produire un preview
- appeler `engine.placeBelt()` au release
- resetter son état après succès/échec/cancel

État minimal :

```ts
type BeltDragState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'dragging';
      readonly from: { building: BuildingId; port: PortId };
      readonly hoveredPort: { building: BuildingId; port: PortId } | null;
      readonly preview: BeltPreviewState | null;
    };
```

Pourquoi un contrôleur dédié :

- `InputHandler` reste simple pour tile/building/pan
- la logique ports + preview + release devient testable séparément
- on évite de transformer `InputHandler` en classe à états multiples difficile
  à maintenir

### Phase 5 — Support du preview multi-tuile

Objectif : montrer le tracé en drag.

Travail :

1. Étendre le store Zustand
   - ajouter un état de preview belt ou un getter accessible depuis `GameCanvas`

2. Étendre `PlacementPreviewRenderer`
   - supporter soit le preview actuel mono-footprint
   - soit une liste de tuiles preview

Approche recommandée :

- garder `PlacementPreviewRenderer` comme renderer unique
- lui faire lire un modèle discriminé :

```ts
type PlacementPreview =
  | { kind: 'footprint'; ... }
  | { kind: 'belt'; tiles: readonly BeltPreviewTile[]; isValid: boolean };
```

3. V1 UX
   - vert si `canPlaceBelt` retourne `ok`
   - aucune promesse de path partiel rouge tant qu'il n'y a pas un contrat data
     propre pour ça

Critère de sortie :

- en drag entre deux ports valides, le tracé s'affiche
- si la cible est invalide, le joueur comprend au moins que le commit n'est pas possible

### Phase 6 — Rendu des belts

Objectif : rendre visibles les segments réellement placés.

Travail :

1. Créer `src/game/renderer/BeltRenderer.ts`
   - lire les bâtiments du monde
   - filtrer avec `isBeltTypeId`
   - dessiner un placeholder lisible par type et rotation

2. Placeholder recommandé
   - fond jaune/orange pour straight
   - fond légèrement différent pour corners
   - flèche ou trait directionnel

3. Brancher le renderer dans `GameCanvas`
   - ordre recommandé : grid -> resources -> buildings -> belts -> preview

Note :

Si `BuildingRenderer` dessine déjà tous les buildings, deux options propres :

- soit exclure les belts de `BuildingRenderer` et les rendre dans `BeltRenderer`
- soit enrichir `BuildingRenderer` pour rendre les belts différemment

Je recommande **un `BeltRenderer` dédié** pour garder la logique visuelle belt
isolée.

### Phase 7 — HUD et ergonomie minimale

Travail :

1. Ajouter un bouton `Convoyeur` dans `GameHUD`
2. sélectionner `{ kind: 'belt' }`
3. garder le reset vers l'outil sol ou outil précédent après placement réussi
4. supporter `Escape` côté contrôleur pour annuler le drag

Option v1 simple :

- clic bouton convoyeur -> outil belt actif
- placement réussi -> on reste sur l'outil belt pour chaîner les poses

C'est souvent plus agréable que le retour automatique au sol.

### Phase 8 — Validation finale

Avant merge :

1. `npm test -- --run`
2. `npm run build`
3. `npm run lint`
4. test manuel navigateur
   - poser un convoyeur droit
   - poser un convoyeur avec coin
   - contourner un obstacle
   - supprimer un segment au milieu -> toute la ligne part
   - supprimer le bâtiment source -> belts orphelins conservés

## Ordre concret recommandé

Ordre exact pour minimiser le rework :

1. Finaliser types et doc de contrat
2. Finaliser `BeltRouter` si besoin
3. Implémenter `GameEngine.canPlaceBelt/placeBelt/removeBelt`
4. Écrire `GameEngine.belt.test.ts`
5. Ajouter `BeltToolController`
6. Étendre `PlacementPreviewRenderer`
7. Ajouter `BeltRenderer`
8. Ajouter le bouton HUD
9. Faire le test manuel

## Ce qu'il ne faut pas faire maintenant

1. Ne pas ajouter de chemin partiel rouge tant que le modèle ne le porte pas
   proprement
2. Ne pas fusionner preview et commit dans un seul contrat bancal
3. Ne pas introduire un registre dédié belts
4. Ne pas enfouir toute la logique belt dans `InputHandler`
5. Ne pas traiter les belts comme une simple connexion logique sans bâtiment

## Résumé exécutable

Le repo a déjà une bonne moitié du travail moteur :

- géométrie rotation-aware
- types convoyeurs
- catalog belt
- routeur pur
- tests routeur verts

Le vrai reste à faire est surtout :

- **commit atomique dans `GameEngine`**
- **suppression par composante**
- **contrôleur d'interaction belt**
- **preview multi-tuile**
- **rendu visuel des belts**

Si on suit cet ordre, on évite de refaire le routeur une troisième fois et on
isole bien les risques entre moteur, input et rendu.
