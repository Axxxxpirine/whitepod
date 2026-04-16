# Plan : Bâtiments Atelier & Manufacture + système de recettes

## Contexte

Le jeu ne dispose que de 3 ressources brutes (Charbon, Minerai de fer, Minerai de cuivre) et aucun système de transformation. L'objectif est d'ajouter :
- Un **Atelier** (3×3, 1 entrée → 1 sortie) pour le raffinage simple
- Une **Manufacture** (4×4, 2 entrées → 1 sortie) pour la combinaison de ressources

Avec une chaîne de production complète : Extracteur → Atelier → Manufacture.

---

## 1. Nouvelles ressources raffinées

**Fichier : `src/game/types.ts`**

Ajouter des ressources raffinées (gap à 10 pour headroom) :

```typescript
export const ResourceType = {
  None: 0,
  Coal: 1,
  IronOre: 2,
  CopperOre: 3,
  // --- Raffinées (Atelier) ---
  IronIngot: 10,      // 2× Minerai de fer → Lingot de fer
  CopperIngot: 11,    // 2× Minerai de cuivre → Lingot de cuivre
  IronPlate: 12,      // 4× Minerai de fer → Plaque de fer
  Screw: 13,          // 6× Minerai de fer → 12 Vis
  // --- Combinées (Manufacture) ---
  SteelIngot: 20,     // Lingot de fer + Charbon → Lingot d'acier
  ReinforcedPlate: 21,// Plaque de fer + Vis → Plaque renforcée
  AlloyIngot: 22,     // Lingot de fer + Lingot de cuivre → Lingot d'alliage
  Cable: 23,          // Lingot de cuivre + Charbon → Câble
  Rotor: 24,          // Lingot de fer + Vis → Rotor
  Circuit: 25,        // Lingot de cuivre + Vis → Circuit
} as const;
```

**Fichier : `src/game/data/buildingCatalog.ts`** — étendre `resourceTypeLabel()` :
- IronIngot → `"Lingot de fer"`
- CopperIngot → `"Lingot de cuivre"`
- IronPlate → `"Plaque de fer"`
- Screw → `"Vis"`
- SteelIngot → `"Lingot d'acier"`
- ReinforcedPlate → `"Plaque renforcée"`
- AlloyIngot → `"Lingot d'alliage"`
- Cable → `"Câble"`
- Rotor → `"Rotor"`
- Circuit → `"Circuit"`

---

## 2. Système de recettes

**Nouveau fichier : `src/game/data/recipeCatalog.ts`**

```typescript
export type RecipeId = string;

export interface RecipeIngredient {
  readonly resourceType: ResourceTypeValue;
  readonly amount: number; // consommé/produit par cycle
}

export interface Recipe {
  readonly id: RecipeId;
  readonly name: string;
  readonly inputs: readonly RecipeIngredient[];
  readonly output: RecipeIngredient;
  readonly cycleSeconds: number;
  readonly building: 'workshop' | 'manufacture'; // quel bâtiment peut l'utiliser
}
```

### Recettes Atelier (1 entrée → 1 sortie)

| ID | Nom | Entrée | Sortie | Cycle |
|---|---|---|---|---|
| `iron_ingot` | Lingot de fer | 2× Minerai de fer | 1× Lingot de fer | 3s |
| `copper_ingot` | Lingot de cuivre | 2× Minerai de cuivre | 1× Lingot de cuivre | 3s |
| `iron_plate` | Plaque de fer | 4× Minerai de fer | 1× Plaque de fer | 5s |
| `screw` | Vis | 6× Minerai de fer | 12× Vis | 4s |

### Recettes Manufacture (2 entrées de types DIFFÉRENTS → 1 sortie)

| ID | Nom | Entrées | Sortie | Cycle |
|---|---|---|---|---|
| `steel_ingot` | Lingot d'acier | 1× Lingot de fer + 1× Charbon | 1× Lingot d'acier | 5s |
| `reinforced_plate` | Plaque renforcée | 1× Plaque de fer + 4× Vis | 1× Plaque renforcée | 6s |
| `alloy_ingot` | Lingot d'alliage | 1× Lingot de fer + 1× Lingot de cuivre | 2× Lingot d'alliage | 6s |
| `cable` | Câble | 1× Lingot de cuivre + 1× Charbon | 2× Câble | 4s |
| `rotor` | Rotor | 1× Lingot de fer + 4× Vis | 1× Rotor | 5s |
| `circuit` | Circuit | 1× Lingot de cuivre + 4× Vis | 1× Circuit | 5s |

> **Contrainte** : chaque recette de Manufacture exige toujours 2 types de ressources différents, un par port d'entrée.
> **Chaîne de production** : Extracteur → Atelier (raffinage) → Manufacture (combinaison).
> Le Charbon a un double rôle : ressource brute directe en Manufacture (acier, câble) + matière première extractible.
> Inspiré de Satisfactory : lingots comme intermédiaires, plaques comme composants structurels.

Fonctions exposées : `getRecipe(id)`, `getRecipesForBuilding(building)`.

---

## 3. Entrées catalogue des bâtiments

**Fichier : `src/game/data/buildingCatalog.ts`**

### Atelier (3×3, 1 in / 1 out)

```typescript
export const WORKSHOP_BUILDING_TYPE_ID = 'workshop_basic' as const;

{
  id: WORKSHOP_BUILDING_TYPE_ID,
  name: 'Atelier',
  footprint: { w: 3, h: 3 },
  allowedTiles: [TileType.Ground],
  forbidsResourceDeposit: true,
  ports: [
    { id: 'in',  kind: PortKind.Input,  offset: { x: 0, y: 1 }, side: Direction.West },
    { id: 'out', kind: PortKind.Output, offset: { x: 2, y: 1 }, side: Direction.East },
  ],
  energy: { consumption: 6 },
}
```

### Manufacture (4×4, 2 in / 1 out)

```typescript
export const MANUFACTURE_BUILDING_TYPE_ID = 'manufacture_basic' as const;

{
  id: MANUFACTURE_BUILDING_TYPE_ID,
  name: 'Manufacture',
  footprint: { w: 4, h: 4 },
  allowedTiles: [TileType.Ground],
  forbidsResourceDeposit: true,
  ports: [
    { id: 'in_1', kind: PortKind.Input,  offset: { x: 0, y: 1 }, side: Direction.West },
    { id: 'in_2', kind: PortKind.Input,  offset: { x: 0, y: 2 }, side: Direction.West },
    { id: 'out',  kind: PortKind.Output, offset: { x: 3, y: 2 }, side: Direction.East },
  ],
  energy: { consumption: 10 },
}
```

Énergie : Extracteur 4kW < Atelier 6kW < Manufacture 10kW (progression logique).

---

## 4. État runtime par instance (partagé Atelier & Manufacture)

**Fichier : `src/game/engine/GameEngine.ts`**

```typescript
export interface ProcessorState {
  recipeId: RecipeId | null;
  inputBuffers: Map<ResourceTypeValue, number>;
  outputBuffer: number;
  cycleProgress: number; // secondes accumulées
}
```

- Nouveau champ : `readonly processorStates = new Map<BuildingId, ProcessorState>()`
- `placeBuilding()` : initialiser un `ProcessorState` si `typeId` est workshop ou manufacture
- `removeBuilding()` : supprimer l'entrée
- Nouvelle méthode : `setProcessorRecipe(buildingId, recipeId | null): boolean` — valide que la recette correspond au type de bâtiment, reset buffers/progress
- Helper : `isProcessorTypeId(typeId)` pour tester si un bâtiment est un processeur

---

## 5. Logique de traitement (tick)

**Fichier : `src/game/engine/GameEngine.ts`**

Ajouter `this.processProcessors(dt)` dans `update(dt)`, après `processExtraction()`.

Pour chaque processeur (atelier ou manufacture) :
1. **Skip** si pas de recette ou pas alimenté en énergie
2. **Résoudre le flow entrant** via `resolveBeltFlow` sur chaque port d'entrée → types et débits
3. **Accumuler** dans `inputBuffers` proportionnellement à `dt` et au débit entrant
4. **Vérifier** si les buffers contiennent assez pour un cycle
5. **Avancer** `cycleProgress += dt` si inputs suffisants
6. **Produire** quand `cycleProgress >= recipe.cycleSeconds` : consommer inputs, incrémenter `outputBuffer`, reporter l'excédent
7. **Drainer** `outputBuffer` vers `playerStock`

> Cohérent avec l'archi actuelle : `playerStock` = source de vérité, belts = visuels.

---

## 6. Mise à jour du flow system

**Fichier : `src/game/flow/resolveBeltFlow.ts`**

Ajouter une branche pour les processeurs (workshop + manufacture) :
- Si upstream est un processeur **alimenté** avec **recette active** → le traiter comme source
- Débit = `(output.amount / cycleSeconds) * 60` items/min
- Type de ressource = celui de la sortie de la recette
- Ne PAS traverser le processeur vers ses inputs (il est un terminus, pas un passthrough)

---

## 7. Sérialisation

**Fichier : `src/game/engine/GameEngine.ts`**

- Bump `SERIALIZE_VERSION` de 2 à 3
- Étendre `SerializedGameWorld` avec `processorStates`
- Étendre `ResourceStock` avec les 10 nouvelles ressources (défaut à 0 pour anciens saves)
- `serializeWorld()` / `fromSnapshot()` : sérialiser/restaurer les `processorStates`

---

## 8. UI — Panel de stats / sélection de recette

**Fichier : `src/components/BuildingStatsPanel.tsx`**

Ajouter une branche commune pour workshop et manufacture :
- **Sélecteur de recette** : liste compacte filtrée par type de bâtiment (`getRecipesForBuilding()`), chaque entrée montre icônes entrées → icône sortie + nom. Recette active en surbrillance. Clic = `engine.setProcessorRecipe()`
- **Détails recette active** : inputs (type + quantité/cycle), output (type + débit/min)
- **État énergie** : réutiliser `StatRow` (icône Zap)

---

## 9. UI — Toolbar

**Fichier : `src/game/ui/buildingPresentation.ts`**

Ajouter 2 entrées :
```typescript
// Atelier — shortcut 9
{
  kind: 'building',
  typeId: WORKSHOP_BUILDING_TYPE_ID,
  shortcut: '9',
  activeClass: 'bg-accent-warm',
  highlightFamily: [WORKSHOP_BUILDING_TYPE_ID],
  highlightColor: PIXI.accentWarm,
}
// Manufacture — shortcut 0
{
  kind: 'building',
  typeId: MANUFACTURE_BUILDING_TYPE_ID,
  shortcut: '0',
  activeClass: 'bg-accent-warm',
  highlightFamily: [MANUFACTURE_BUILDING_TYPE_ID],
  highlightColor: PIXI.accentWarm,
}
```

Icônes : `Hammer` (Atelier) et `Factory` (Manufacture) de lucide-react.

---

## 10. Rendu

**Fichier : `src/game/renderer/BuildingRenderer.ts`**

- Ajouter les tints pour les 2 nouveaux bâtiments (famille warm)
- Le renderer gère déjà les footprints arbitraires → pas d'autre changement

---

## 11. Sprites ressources

Ajouter dans `public/sprites/` :
- `iron-ingot.png`
- `copper-ingot.png`
- `iron-plate.png`
- `screw.png`
- `steel-ingot.png`
- `reinforced-plate.png`
- `alloy-ingot.png`
- `cable.png`
- `rotor.png`
- `circuit.png`

---

## 12. Downstream impacts

- **`ResourceStock`** : ajouter `ironIngot`, `copperIngot`, `ironPlate`, `screw`, `steelIngot`, `reinforcedPlate`, `alloyIngot`, `cable`, `rotor`, `circuit` (défaut 0)
- **`BuildingStatsPanel.tsx` (stockage)** : afficher les nouvelles ressources dans le panel stockage
- **`sessionStorage.ts`** : migration v2→v3
- **`IdleCatchup.ts`** : `processProcessors` sera appelé via `update(dt)`, pas de changement spécifique

---

## Ordre d'implémentation

1. `types.ts` — nouvelles ressources
2. `recipeCatalog.ts` — nouveau fichier, recettes
3. `buildingCatalog.ts` — entrées atelier + manufacture + labels
4. `GameEngine.ts` — ProcessorState, lifecycle, `processProcessors()`, `setProcessorRecipe()`, sérialisation, ResourceStock étendu
5. `resolveBeltFlow.ts` — reconnaître processeurs comme sources
6. `buildingPresentation.ts` — toolbar entries
7. `BuildingStatsPanel.tsx` — UI recette + stockage étendu
8. `BuildingRenderer.ts` — tints
9. `sessionStorage.ts` — migration sérialisation
10. Sprites
11. Tests

---

## Vérification

1. `npm run lint` + `npm run build` + `npm test -- --run`
2. **Test chaîne complète** : Extracteur fer → belt → Atelier (recette lingot) → belt → Manufacture (recette alliage, 2e entrée : lingot cuivre) → vérifier stock alliage augmente
3. **Test sérialisation** : save/reload avec processeurs actifs
4. **Test sans énergie** : processeurs ne produisent pas sans power

---

## Fichiers à modifier/créer

- `src/game/types.ts`
- `src/game/data/recipeCatalog.ts` *(nouveau)*
- `src/game/data/buildingCatalog.ts`
- `src/game/engine/GameEngine.ts`
- `src/game/flow/resolveBeltFlow.ts`
- `src/components/BuildingStatsPanel.tsx`
- `src/game/ui/buildingPresentation.ts`
- `src/game/renderer/BuildingRenderer.ts`
- `src/game/persistence/sessionStorage.ts`
