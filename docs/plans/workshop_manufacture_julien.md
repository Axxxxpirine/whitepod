# Plan : Bâtiments Convertisseur & Synthétiseur + système de recettes

## Contexte

Le jeu ne dispose que de 3 ressources brutes (Régolithe, Hydrogène, Oxygène) et aucun système de transformation. L'objectif est d'ajouter :
- Un **Convertisseur** (3×3, 1 entrée → 1 sortie) pour le raffinage simple
- Un **Synthétiseur** (4×4, 2 entrées → 1 sortie) pour la combinaison de ressources

Avec une chaîne de production complète : Extracteur → Convertisseur → Synthétiseur.

Univers : colonie lunaire exploitant les ressources in situ du sol lunaire (ISRU — In-Situ Resource Utilization). Chimie lunaire inspirée du Petri net `lunar-chemistry-petrinet`.

---

## 1. Renommage des ressources de base

**Fichier : `src/game/types.ts`**

Renommer les 3 ressources brutes extraites par les Extracteurs :

| Actuel | Nouveau | Clé interne |
|---|---|---|
| Charbon (Coal: 1) | Régolithe | Regolith: 1 |
| Minerai de fer (IronOre: 2) | Hydrogène | Hydrogen: 2 |
| Minerai de cuivre (CopperOre: 3) | Oxygène | Oxygen: 3 |

**Fichier : `src/game/data/buildingCatalog.ts`** — mettre à jour `resourceTypeLabel()` :
- Regolith → `"Régolithe"`
- Hydrogen → `"Hydrogène"`
- Oxygen → `"Oxygène"`

---

## 2. Nouvelles ressources raffinées

**Fichier : `src/game/types.ts`**

Ajouter des ressources raffinées (gap à 10 pour headroom) :

```typescript
export const ResourceType = {
  None: 0,
  // --- Tier 0 : Brutes (Extracteurs) ---
  Regolith: 1,        // Régolithe
  Hydrogen: 2,        // Hydrogène
  Oxygen: 3,          // Oxygène
  // --- Tier 1 : Convertisseur (1→1) ---
  IronOxide: 10,      // Oxyde de fer
  AluminumOxide: 11,  // Oxyde d'aluminium
  SiliconDioxide: 12, // Dioxyde de silicium
  NitrogenGas: 13,    // Azote
  // --- Tier 1 : Synthétiseur (2→1, depuis tier 0) ---
  Water: 14,           // Eau
  Methane: 15,         // Méthane
  CarbonDioxide: 16,   // Dioxyde de carbone
  Ammonia: 17,         // Ammoniac
  // --- Tier 2 : Synthétiseur (depuis tier 1) ---
  CeramicPlates: 20,   // Plaques céramiques
} as const;
```

**Fichier : `src/game/data/buildingCatalog.ts`** — étendre `resourceTypeLabel()` :
- IronOxide → `"Oxyde de fer"`
- AluminumOxide → `"Oxyde d'aluminium"`
- SiliconDioxide → `"Dioxyde de silicium"`
- NitrogenGas → `"Azote"`
- Water → `"Eau"`
- Methane → `"Méthane"`
- CarbonDioxide → `"Dioxyde de carbone"`
- Ammonia → `"Ammoniac"`
- CeramicPlates → `"Plaques céramiques"`

---

## 3. Système de recettes

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
  readonly building: 'converter' | 'synthesizer'; // quel bâtiment peut l'utiliser
}
```

### Recettes Convertisseur (1 entrée → 1 sortie)

Chaque recette a une signature d'entrée unique (ressource × quantité) :

| ID | Nom | Entrée | Sortie | Cycle |
|---|---|---|---|---|
| `iron_oxide` | Oxydation (fer) | 1× Régolithe | 1× Oxyde de fer | 2s |
| `aluminum_oxide` | Oxydation (aluminium) | 2× Régolithe | 1× Oxyde d'aluminium | 3s |
| `silicon_dioxide` | Oxydation (silicium) | 4× Régolithe | 1× Dioxyde de silicium | 5s |
| `nitrogen_gas` | Synthèse d'azote | 3× Oxygène | 1× Azote | 4s |

> **Progression de coût** : Oxyde de fer est rapide et bon marché (1×, 2s), Dioxyde de silicium est lent et coûteux (4×, 5s).
> **Entrées toutes uniques** : (1×Rég), (2×Rég), (4×Rég), (3×Oxy).

### Recettes Synthétiseur (2 entrées de types DIFFÉRENTS → 1 sortie)

| ID | Nom | Entrées | Sortie | Cycle |
|---|---|---|---|---|
| `water` | Synthèse d'eau | 2× Hydrogène + 1× Oxygène | 1× Eau | 4s |
| `methane` | Synthèse de méthane | 4× Hydrogène + 1× Oxygène | 1× Méthane | 5s |
| `carbon_dioxide` | Synthèse de CO₂ | 1× Hydrogène + 1× Oxygène | 1× Dioxyde de carbone | 4s |
| `ammonia` | Synthèse d'ammoniac | 3× Hydrogène + 2× Oxygène | 1× Ammoniac | 6s |
| `ceramic_plates` | Céramique | 1× Oxyde d'aluminium + 1× Oxyde de fer | 1× Plaques céramiques | 6s |

> **Contrainte** : chaque recette de Synthétiseur exige toujours 2 types de ressources différents, un par port d'entrée.
> **Chaîne de production** : Extracteur → Convertisseur (raffinage) → Synthétiseur (combinaison).
> **Ratios variés** : chaque recette a un ratio d'entrées différent (2:1, 4:1, 1:1, 3:2, 1:1 raffinés), créant des puzzles de belts distincts.
> **Chaîne à 3 étages** : la recette Céramique est la première à chaîner Extracteur → Convertisseur → Synthétiseur.

Fonctions exposées : `getRecipe(id)`, `getRecipesForBuilding(building)`.

---

## 4. Entrées catalogue des bâtiments

**Fichier : `src/game/data/buildingCatalog.ts`**

### Convertisseur (3×3, 1 in / 1 out)

```typescript
export const CONVERTER_BUILDING_TYPE_ID = 'converter_basic' as const;

{
  id: CONVERTER_BUILDING_TYPE_ID,
  name: 'Convertisseur',
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

### Synthétiseur (4×4, 2 in / 1 out)

```typescript
export const SYNTHESIZER_BUILDING_TYPE_ID = 'synthesizer_basic' as const;

{
  id: SYNTHESIZER_BUILDING_TYPE_ID,
  name: 'Synthétiseur',
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

Énergie : Extracteur 4kW < Convertisseur 6kW < Synthétiseur 10kW (progression logique).

---

## 5. État runtime par instance (partagé Convertisseur & Synthétiseur)

**Fichier : `src/game/engine/GameEngine.ts`**

```typescript
export interface ProcessorState {
  recipeId: RecipeId | null;
  cycleProgress: number; // secondes accumulées
}
```

- Nouveau champ : `readonly processorStates = new Map<BuildingId, ProcessorState>()`
- `placeBuilding()` : initialiser un `ProcessorState` si `typeId` est converter ou synthesizer
- `removeBuilding()` : supprimer l'entrée
- Nouvelle méthode : `setProcessorRecipe(buildingId, recipeId | null): boolean` — valide que la recette correspond au type de bâtiment, reset progress
- Helper : `isProcessorTypeId(typeId)` pour tester si un bâtiment est un processeur

---

## 6. Logique de traitement (tick)

**Fichier : `src/game/engine/GameEngine.ts`**

Ajouter `this.processProcessors(dt)` dans `update(dt)`, après `processExtraction()`.

Pour chaque processeur (convertisseur ou synthétiseur) :
1. **Skip** si pas de recette ou pas alimenté en énergie
2. **Vérifier** si `playerStock` contient assez de chaque input pour un cycle complet
3. **Avancer** `cycleProgress += dt` si inputs suffisants dans `playerStock`
4. **Produire** quand `cycleProgress >= recipe.cycleSeconds` : déduire les inputs de `playerStock`, ajouter l'output dans `playerStock`, reporter l'excédent de temps

> **Modèle playerStock-centric** : le processeur consomme et produit directement dans `playerStock`, comme l'extracteur. Pas de buffers locaux. Les belts restent purement visuels (affichage de taux). `playerStock` = source de vérité unique.

---

## 7. Mise à jour du flow system

**Fichier : `src/game/flow/resolveBeltFlow.ts`**

Ajouter une branche pour les processeurs (converter + synthesizer) :
- Si upstream est un processeur **alimenté** avec **recette active** → le traiter comme source
- Débit = `(output.amount / cycleSeconds) * 60` items/min
- Type de ressource = celui de la sortie de la recette
- Ne PAS traverser le processeur vers ses inputs (il est un terminus, pas un passthrough)

---

## 8. Sérialisation

**Fichier : `src/game/engine/GameEngine.ts`**

- Bump `SERIALIZE_VERSION` de 2 à 3
- Étendre `SerializedGameWorld` avec `processorStates`
- Étendre `ResourceStock` : renommer `coal`→`regolith`, `ironOre`→`hydrogen`, `copperOre`→`oxygen` + ajouter les 9 nouvelles ressources (défaut à 0 pour anciens saves)
- `serializeWorld()` / `fromSnapshot()` : sérialiser/restaurer les `processorStates`

**Fichier : `src/game/persistence/sessionStorage.ts`**

- Bump `WORLD_STORAGE_VERSION` de 3 à 4 (nouvelle clé `whitepod:session:world:v4`)
- Ajouter un `LEGACY_WORLD_STORAGE_KEY_V3` pour le fallback
- Migration V3→V4 : renommer les clés `playerStock` (`coal`→`regolith`, `ironOre`→`hydrogen`, `copperOre`→`oxygen`), ajouter les nouvelles ressources à 0, ajouter `processorStates: []`
- Conserver la chaîne V2→V3→V4 pour les anciens saves

---

## 9. UI — Panel de stats / sélection de recette

**Fichier : `src/components/BuildingStatsPanel.tsx`**

Ajouter une branche commune pour converter et synthesizer :
- **Sélecteur de recette** : liste compacte filtrée par type de bâtiment (`getRecipesForBuilding()`), chaque entrée montre icônes entrées → icône sortie + nom. Recette active en surbrillance. Clic = `engine.setProcessorRecipe()`
- **Détails recette active** : inputs (type + quantité/cycle), output (type + débit/min)
- **État énergie** : réutiliser `StatRow` (icône Zap)

---

## 10. UI — Toolbar

**Fichier : `src/game/ui/buildingPresentation.ts`**

Ajouter 2 entrées :
```typescript
// Convertisseur — shortcut 9
{
  kind: 'building',
  typeId: CONVERTER_BUILDING_TYPE_ID,
  shortcut: '9',
  activeClass: 'bg-accent-warm',
  highlightFamily: [CONVERTER_BUILDING_TYPE_ID],
  highlightColor: PIXI.accentWarm,
}
// Synthétiseur — shortcut 0
{
  kind: 'building',
  typeId: SYNTHESIZER_BUILDING_TYPE_ID,
  shortcut: '0',
  activeClass: 'bg-accent-warm',
  highlightFamily: [SYNTHESIZER_BUILDING_TYPE_ID],
  highlightColor: PIXI.accentWarm,
}
```

Icônes : `Hammer` (Convertisseur) et `Factory` (Synthétiseur) de lucide-react.

---

## 11. Rendu

**Fichier : `src/game/renderer/BuildingRenderer.ts`**

- Ajouter les tints pour les 2 nouveaux bâtiments (famille warm)
- Le renderer gère déjà les footprints arbitraires → pas d'autre changement

---

## 12. Sprites ressources

Ajouter dans `public/sprites/` :
- `iron-oxide.png`
- `aluminum-oxide.png`
- `silicon-dioxide.png`
- `nitrogen-gas.png`
- `water.png`
- `methane.png`
- `carbon-dioxide.png`
- `ammonia.png`
- `ceramic-plates.png`

---

## 13. Downstream impacts

- **`ResourceStock`** : ajouter `ironOxide`, `aluminumOxide`, `siliconDioxide`, `nitrogenGas`, `water`, `methane`, `carbonDioxide`, `ammonia`, `ceramicPlates` (défaut 0)
- **`BuildingStatsPanel.tsx` (stockage)** : afficher les nouvelles ressources dans le panel stockage
- **`sessionStorage.ts`** : migration v3→v4 (renommage clés `playerStock`, nouvelles ressources, `processorStates`)
- **`IdleCatchup.ts`** : `processProcessors` sera appelé via `update(dt)`, pas de changement spécifique

---

## Ordre d'implémentation

1. `types.ts` — renommage ressources de base + nouvelles ressources
2. `GameEngine.ts` — renommer les champs `ResourceStock` (`coal`→`regolith`, `ironOre`→`hydrogen`, `copperOre`→`oxygen`) + propager dans `processExtraction()` et tout accès à `playerStock`
3. `recipeCatalog.ts` — nouveau fichier, recettes
4. `buildingCatalog.ts` — entrées convertisseur + synthétiseur + labels
5. `GameEngine.ts` — ProcessorState, lifecycle, `processProcessors()`, `setProcessorRecipe()`, sérialisation, ResourceStock étendu (9 nouvelles ressources)
6. `resolveBeltFlow.ts` — reconnaître processeurs comme sources
7. `buildingPresentation.ts` — toolbar entries
8. `BuildingStatsPanel.tsx` — UI recette + stockage étendu (clés renommées + nouvelles ressources)
9. `BuildingRenderer.ts` — tints
10. `sessionStorage.ts` — migration v3→v4 (renommage clés playerStock, nouvelles ressources, processorStates)
11. Sprites
12. Tests

---

## Vérification

1. `npm run lint` + `npm run build` + `npm test -- --run`
2. **Test chaîne complète** : Extracteur régolithe → belt → Convertisseur (recette oxydation fer) → belt → Synthétiseur (recette céramique, 2e entrée : oxyde d'aluminium) → vérifier stock plaques céramiques augmente
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
