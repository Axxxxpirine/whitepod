# Whitepod - Plan d'Implémentation Exhaustif

## Contexte du Projet

**Whitepod** est un jeu de gestion et d'optimisation industrielle sur grille lunaire. Le joueur incarne l'architecte d'un système automatisé vivant : il observe un territoire, organise l'implantation de son infrastructure, anticipe les contraintes de circulation et d'énergie, puis affine en continu la structure de son réseau pour transformer un espace brut en machine cohérente, stable et évolutive.

**Objectif actuel** : consolider une boucle de jeu jouable avec rendu PixiJS, HUD React tuilé, persistance locale, et base de debug/inspection pour les itérations suivantes.

**Stack Technique** :
- TypeScript, React 19, Zustand (state management)
- PixiJS 8 (rendu 2D)
- Vite 8, Tailwind CSS 4, ESLint
- Vitest (tests), localStorage (persistance)
- Debug PetriNet UI: Dagre (layout), Marked (Markdown)

---

## 0. État Actuel (implémenté)

### 0.1 Résumé

✅ Un socle fonctionnel existe déjà pour la boucle runtime actuelle :

- **DSL canonique** : `docs/lunar-chemistry-petrinet.dsl`
  - `run` gating explicite pour les transitions *station*
  - dépôts de ressources configurés via `@resource` (`depositCount`, `depositCapacity`)
- **Compilateur DSL** : `scripts/dsl/*` + script `npm run generate:lunar-chemistry`
  - sorties générées : `public/data/lunar-chemistry.*.json`
- **Moteur PetriNet (station-driven)** : `src/core/petri-net/engine.ts`
  - `init`, `launch`, `terminate` en **manual activation**
- **Grille + dépôts** : `src/core/grid/manager.ts`
  - dépôts à capacité (`remaining`)
  - réservation 1 unité / dépôt / tick (`reservedTick`)
  - extraction possible uniquement si dépôt adjacent (player mode)
- **Store Zustand + persistance** : `src/store/game-store.ts`
  - persistance via `zustand/middleware/persist` (clé localStorage: `whitepod-save`)
  - snapshots sérialisables engine + grid
  - auto-save cadence 30 ticks + flush sur actions majeures
- **GameLoop + export** : `src/engine/game-loop.ts`
  - tick 1s + dispatch `window.__whitepodOnPixiUpdate` + event `whitepod-pixi-update`
- **HUD joueur tuilé** : `src/App.tsx`, `src/App.css`
  - header, résumé, sidebars, viewport central, footer
  - plus d'overlay absolu pour les panneaux HUD
  - panneaux à scroll interne pour éviter les collisions de layout
  - le rendu Pixi est désormais dans un panneau dédié au centre
- **Renderer Pixi** : `src/components/PixiCanvas.tsx`, `src/render/pixi-renderer.ts`
  - grille 128x128, dépôts/stations, overlays de tokens
  - zoom UI côté React avec viewport scrollable
- **Debug PetriNet Simulator** (code conservé, hors surface joueur pour l'instant) :
  - `src/components/debug/PetriNetDebugger.tsx` (controls, stats, filters)
  - `src/components/debug/petri/PetriNetDiagram.tsx` (SVG + minimap + ROI)
  - Le simulateur est **interactif** et modifie l'état réel (fire/step/auto-sim)
  - le code existe toujours mais n'est plus exposé dans le HUD joueur courant
- **Validation actuelle** :
  - `npm run build` ✅
  - `npm test` ✅
  - `npm run lint` ✅
- **Tests** : Vitest (DSL compiler, engine, grid, snapshots, store hydration)

### 0.2 Commandes (reprise de session)

Environnement recommandé (Nix) :

- `nix develop`
- `npm install` (ou `npm ci` si lockfile stable)
- `npm run generate:lunar-chemistry` (à faire après toute modification du DSL)
- `npm test`
- `npm run lint`
- `npm run build`
- `npm run dev`

Astuce: si `node/npm` ne sont pas disponibles hors shell, utiliser `nix develop -c <commande>`.

Pour repartir de zéro côté sauvegarde :

- UI : bouton "Reset save"
- ou supprimer la clé localStorage `whitepod-save`

### 0.3 Prochaines étapes prioritaires

- **Comparer avec la future base `main` rafraîchie** : réévaluer les écarts une fois la branche cible disponible localement.
- **Affiner le HUD tuilé** : proportions desktop/mobile, hiérarchie visuelle, ergonomie des sidebars.
- **Ajuster le viewport central** : zoom par défaut, occupation de l'espace, comportement de scroll, confort sur laptop.
- **Vérifier précisément le mapping pointeur → cellule** dans le nouveau layout tuilé (clic/hover/placement) avec QA manuelle.
- **Stabiliser le contrat PixiExport/renderer** : diffing strategy, cleanup, resize behavior, update policy.
- **Compléter l'intégration PixiJS** : tests d'intégration, performances, animation playback.
- **Décider du sort du debug UI** : réintégration contrôlée, séparation sur route dédiée, ou nettoyage des dépendances (`dagre`, `marked`) si non retenu.
- **Finaliser la pipeline d'assets** : mapping asset-ID ↔ resource, versioning, fallback behavior.

### 0.4 Notes Debug PetriNet (important)

- En mode `debug`, le `GameLoop` **ne tick pas** automatiquement par défaut.
  - Le simulateur (`PetriNetDebugger`) appelle `setAutoTickEnabled(false)`.
  - Le tick est alors piloté par le simulateur (step/auto-sim) et modifie le store réel.
- Pour réactiver le tick auto en debug (rare), mettre `autoTickEnabled=true` dans le store.
- Les stats debug (history, produced/consumed) sont calculées côté store :
  - `debugFiringHistory`, `debugTotalFires`, `debugTokenStats`, `debugStatsStartTick`.

### 0.5 Reprise de session (checklist)

- Démarrer le devshell: `nix develop`
- Installer deps: `npm install`
- Vérifier l'état: `npm test && npm run lint && npm run build`
- Lancer: `npm run dev`
- Vérifier en priorité le layout HUD tuilé sur desktop + mobile
- Vérifier les interactions grille: hover, clic, placement, zoom
- Debugger si besoin via les composants debug existants, mais ils ne sont plus branchés au HUD joueur courant

### 0.6 Handoff de cette session

- Le HUD overlay a été remplacé par un **layout tuilé** en flux normal.
- La grille Pixi n'est plus un fond plein écran, mais un **viewport central dédié**.
- Les panneaux `Build Library`, `Stations` et `Tokens` ont un **scroll interne** pour éviter les chevauchements.
- Le sélecteur de mode a été retiré de la surface joueur; le HUD affiche simplement `player`.
- `src/App.css` est désormais bien importé par `src/App.tsx`.
- Le zoom par défaut du viewport a été réduit pour mieux rentrer dans le panneau central (`0.625`).
- Les vérifications de base sont vertes: build, tests, lint.

---

## 1. Architecture Globale

### 1.1 Flux de Données

```
┌─────────────────┐
│  User Input     │ (placement stations, clics)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Zustand Store  │ (state management + persistence)
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌─────────┐ ┌──────────────┐
│ Grid    │ │ PetriNet     │
│Manager  │ │ Engine       │
└────┬────┘ └──────┬───────┘
     │             │
     └──────┬──────┘
            │
            ▼
    ┌─────────────────┐
    │   PixiExport    │ (JSON toutes les 1s)
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  PixiJS Renderer│ (via callback window.__whitepodOnPixiUpdate)
    └─────────────────┘
```

### 1.2 Cycle de Jeu

```
Init (seed) → Load transitions → Grid generation → 
PetriNet start → Game loop (1s tick) → Pixi export → 
Auto-save (30s) → Launch rocket → Done → Terminate
```

### 1.3 Modèle Réseau de Pétri

**Places** (180+ places avec couches surface/bus/stock) :
- **Control** : `start`, `run`, `done`
- **Surface** : Production locale (tile)
- **Bus** : Transport intermédiaire
- **Stock** : Stockage pour consommation

**Transitions** (ordre de grandeur) :
- Artefact runtime `public/data/lunar-chemistry.game-system.transitions.json` : ~369 transitions
- Places runtime : ~186 places
- **Extraction** : tier0 ressources (lunar_helium3, lunar_hydrogen, lunar_oxygen, lunar_regolith)
- **Convey** : surface → bus
- **Store** : bus → stock
- **Recipe** : stock → surface
- **Drain** : purge post-launch

---

## 2. Spécifications Détaillées

### 2.1 Types Core (`src/core/types.ts`)

Note: l'implémentation réelle de `src/core/types.ts` expose déjà un `PixiExport` complet pour le renderer: `timestamp`, `phase`, `tokens`, `grid.cells`, `grid.deposits`, `grid.stations` et `layerTokens`.

```typescript
// Transition simplifiée pour moteur interne
export interface Transition {
  id: string;
  consumes: Array<{ place: string; qty: number }>;
  produces: Array<{ place: string; qty: number }>;
}

// Place avec métadonnées
export interface PlaceMeta {
  id: string;
  name_fr: string;
  tier?: number;              // 0-3
  kind?: 'control';
  layer?: 'surface' | 'bus' | 'stock';
}

// Ressources tier0 sur grille
export interface ResourceDeposit {
  id: string;
  x: number;
  y: number;
  resourceType: 'lunar_helium3' | 'lunar_hydrogen' | 'lunar_oxygen' | 'lunar_regolith';
  producedAt: number;
  consumedAt: number | null;
}

// Station de production
export interface ProductionStation {
  id: string;
  x: number;
  y: number;
  transitionId: string;
  state: 'idle' | 'processing' | 'complete';
  progress: number;           // 0-1 pour animation
}

// Cellule de grille export Pixi
export interface GridCellExport {
  x: number;
  y: number;
  resource?: {
    type: string;
    producedAt: number;
  };
  station?: {
    transitionId: string;
    state: string;
    progress: number;
  };
}

// Export complet pour PixiJS
export interface PixiExport {
  timestamp: number;
  phase: string;              // 'initializing' | 'running' | 'done' | 'terminated'
  grid: {
    width: 128;
    height: 128;
    cells: GridCellExport[];
  };
  tokens: Record<string, number>;
  animations: TileAnimation[];
}

// Animation tile
export interface TileAnimation {
  resourceId: string;
  layer: 'surface' | 'bus' | 'stock';
  action: 'consume' | 'produce' | 'convey' | 'store';
  frameIndex: number;         // 0-15
  progress: number;           // 0-1 dans la frame actuelle
}
```

### 2.2 Moteur PetriNet (`src/core/petri-net/engine.ts`)

Note: l'implémentation réelle est **station-driven** (seules les transitions actives/placées tirent). Les transitions `init`, `launch`, `terminate` sont **manual activation** (tirées uniquement sur requête).

```typescript
/**
 * Moteur de réseau de Pétri pour Whitepod.
 * 
 * Gère l'état des tokens, l'exécution des transitions,
 * et la synchronisation avec le renderer PixiJS.
 */
export class PetriNetEngine {
  private transitions: Transition[];
  private tokens: Map<string, number>;  // placeId → count
  private phase: 'initializing' | 'running' | 'done' | 'terminated';

  constructor(transitions: Transition[]) {
    this.transitions = transitions;
    this.tokens = new Map();
    this.phase = 'initializing';
  }

  initialize(): void {
    this.tokens.set('start', 1);
    this.phase = 'initializing';
  }

  tick(): void {
    if (this.phase === 'initializing') {
      this.fireTransition('init');
    } else if (this.phase === 'running') {
      for (const transition of this.transitions) {
        if (transition.id.startsWith('drain__')) continue;
        if (this.canFire(transition.id)) {
          this.fireTransition(transition.id);
        }
      }
    } else if (this.phase === 'done') {
      for (const transition of this.transitions) {
        if (transition.id.startsWith('drain__') && this.canFire(transition.id)) {
          this.fireTransition(transition.id);
        }
      }
      if (this.canFire('terminate')) {
        this.fireTransition('terminate');
        this.phase = 'terminated';
      }
    }
  }

  canFire(transitionId: string): boolean {
    const transition = this.transitions.find(t => t.id === transitionId);
    if (!transition) return false;

    for (const input of transition.consumes) {
      const current = this.tokens.get(input.place) || 0;
      if (current < input.qty) return false;
    }
    return true;
  }

  fireTransition(transitionId: string): void {
    const transition = this.transitions.find(t => t.id === transitionId);
    if (!transition || !this.canFire(transitionId)) {
      throw new Error(`Transition ${transitionId} cannot fire`);
    }

    for (const input of transition.consumes) {
      const current = this.tokens.get(input.place)!;
      this.tokens.set(input.place, current - input.qty);
    }

    for (const output of transition.produces) {
      const current = this.tokens.get(output.place) || 0;
      this.tokens.set(output.place, current + output.qty);
    }

    if (transitionId === 'init') this.phase = 'running';
    if (transitionId === 'launch') this.phase = 'done';
  }

  getTokens(): Map<string, number> {
    return new Map(this.tokens);
  }

  getPhase(): string {
    return this.phase;
  }

  export(): { phase: string; tokens: Record<string, number> } {
    const tokensObj: Record<string, number> = {};
    for (const [place, count] of this.tokens) {
      tokensObj[place] = count;
    }
    return { phase: this.phase, tokens: tokensObj };
  }
}
```

### 2.3 Gestionnaire de Grille (`src/core/grid/manager.ts`)

Note: l'implémentation réelle gère des dépôts à capacité (`remaining`) avec **réservation 1 unité / dépôt / tick** et snapshots sérialisables.

```typescript
/**
 * Gestionnaire de grille 128x128 pour Whitepod.
 * 
 * Gère les gisements de ressources tier0, les stations de production,
 * et la génération déterministe par seed.
 */
export class GridManager {
  private width = 128;
  private height = 128;
  private grid: Map<string, GridCell> = new Map(); // key: `${x},${y}`
  private deposits: ResourceDeposit[] = [];
  private stations: Map<string, ProductionStation> = new Map();
  
  private seed: number;

  initialize(seed: number): void {
    this.seed = seed;
    this.generateInitialDeposits();
  }

  private generateInitialDeposits(): void {
    const rng = this.seededRandom(this.seed);
    
    const counts = {
      lunar_helium3: 10,
      lunar_hydrogen: 20,
      lunar_oxygen: 15,
      lunar_regolith: 30
    };

    for (const [type, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) {
        const x = Math.floor(rng() * this.width);
        const y = Math.floor(rng() * this.height);
        
        const deposit: ResourceDeposit = {
          id: `deposit_${type}_${i}`,
          x, y,
          resourceType: type as any,
          producedAt: Date.now(),
          consumedAt: null
        };
        
        this.deposits.push(deposit);
        this.grid.set(`${x},${y}`, { x, y, resource: deposit });
      }
    }
  }

  tickResourceProduction(): void {
    const now = Date.now();
    
    for (const deposit of this.deposits) {
      if (deposit.consumedAt) continue;
      if (now - deposit.producedAt < 1000) continue;
      
      const adjacentStation = this.findAdjacentStation(deposit.x, deposit.y);
      
      if (adjacentStation) {
        deposit.consumedAt = now;
        this.removeResource(deposit.x, deposit.y);
        // TODO: Produire dans place réseau de Pétri (surface layer)
      }
    }
  }

  placeStation(x: number, y: number, transitionId: string): boolean {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    
    const key = `${x},${y}`;
    const existing = this.grid.get(key);
    if (existing?.resource || existing?.station) return false;
    
    const station: ProductionStation = {
      id: `station_${transitionId}_${x}_${y}`,
      x, y, transitionId,
      state: 'idle',
      progress: 0
    };
    
    this.stations.set(station.id, station);
    this.grid.set(key, { x, y, station });
    
    return true;
  }

  removeStation(x: number, y: number): void {
    const key = `${x},${y}`;
    const cell = this.grid.get(key);
    if (cell?.station) {
      this.stations.delete(cell.station.id);
      this.grid.set(key, { x, y });
    }
  }

  export(): GridCellExport[] {
    const cells: GridCellExport[] = [];
    
    for (const cell of this.grid.values()) {
      const exportCell: GridCellExport = {
        x: cell.x,
        y: cell.y
      };

      if (cell.resource) {
        exportCell.resource = {
          type: cell.resource.resourceType,
          producedAt: cell.resource.producedAt
        };
      }

      if (cell.station) {
        exportCell.station = {
          transitionId: cell.station.transitionId,
          state: cell.station.state,
          progress: cell.station.progress
        };
      }

      cells.push(exportCell);
    }

    return cells;
  }

  private findAdjacentStation(x: number, y: number): ProductionStation | null {
    const neighbors = [
      [x-1, y], [x+1, y], [x, y-1], [x, y+1],
      [x-1, y-1], [x+1, y-1], [x-1, y+1], [x+1, y+1]
    ];

    for (const [nx, ny] of neighbors) {
      if (nx < 0 || nx >= this.width || ny < 0 || ny >= this.height) continue;
      const cell = this.grid.get(`${nx},${ny}`);
      if (cell?.station) return cell.station;
    }
    
    return null;
  }

  private seededRandom(seed: number): () => number {
    let s = seed;
    return () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }
}
```

### 2.4 Store Zustand (`src/store/game-store.ts`)

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { PetriNetEngine } from '../core/petri-net/engine';
import { GridManager } from '../core/grid/manager';
import { Transition, PixiExport } from '../core/types';

interface GameState {
  phase: 'init' | 'running' | 'done' | 'terminated';
  petriNet: PetriNetEngine | null;
  grid: GridManager;
  transitions: Transition[];
  placeMetas: PlaceMeta[];
  lastSaveTime: number;
  
  // Actions
  initializeGame: (seed: number) => void;
  loadTransitions: () => Promise<void>;
  placeStation: (x: number, y: number, transitionId: string) => boolean;
  removeStation: (x: number, y: number) => void;
  startEngine: () => void;
  pauseEngine: () => void;
  tick: () => PixiExport;
  getPixiExport: () => PixiExport;
}

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      phase: 'init',
      petriNet: null,
      grid: new GridManager(),
      transitions: [],
      placeMetas: [],
      lastSaveTime: Date.now(),
      
      initializeGame: (seed: number) => {
        get().grid.initialize(seed);
        set({ phase: 'init' });
      },
      
      loadTransitions: async () => {
        const response = await fetch('/docs/lunar-chemistry-game-system.transitions.json');
        const data = await response.json();
        
        const simpleTransitions = data.map((t: any) => ({
          id: t.id,
          consumes: t.consumes.map((c: any) => ({ 
            place: c.placeId, 
            qty: c.qty 
          })),
          produces: t.produces.map((p: any) => ({ 
            place: p.placeId, 
            qty: p.qty 
          }))
        }));
        
        set({ transitions: simpleTransitions });
        
        const engine = new PetriNetEngine(simpleTransitions);
        engine.initialize();
        set({ petriNet: engine });
      },
      
      placeStation: (x, y, transitionId) => {
        return get().grid.placeStation(x, y, transitionId);
      },
      
      removeStation: (x, y) => {
        get().grid.removeStation(x, y);
      },
      
      startEngine: () => {
        set({ phase: 'running' });
      },
      
      pauseEngine: () => {
        set({ phase: 'init' });
      },
      
      tick: () => {
        const { petriNet, grid } = get();
        
        if (!petriNet) throw new Error('PetriNet not initialized');
        
        grid.tickResourceProduction();
        petriNet.tick();
        
        const now = Date.now();
        if (now - get().lastSaveTime >= 30000) {
          set({ lastSaveTime: now });
        }
        
        return get().getPixiExport();
      },
      
      getPixiExport: () => {
        const { petriNet, grid, phase } = get();
        
        return {
          timestamp: Date.now(),
          phase: petriNet?.getPhase() || 'init',
          grid: {
            width: 128,
            height: 128,
            cells: grid.export()
          },
          tokens: petriNet?.export().tokens || {},
          animations: []
        };
      }
    }),
    {
      name: 'whitepod-save',
      partialize: (state) => ({
        gridCells: Array.from(state.grid['grid'].values()),
        stations: Array.from(state.grid['stations'].values()),
        tokenState: state.petriNet?.export().tokens,
        phase: state.phase
      })
    }
  )
);
```

### 2.5 Data Loaders

**`src/data/converter.ts`**:
```typescript
export interface TransitionInput {
  id: string;
  consumes: Array<{
    placeId: string;
    qty: number;
    place: {
      resource: string;
      layer: 'surface' | 'bus' | 'stock' | 'control';
    };
  }>;
  produces: Array<{
    placeId: string;
    qty: number;
    place: {
      resource: string;
      layer: 'surface' | 'bus' | 'stock' | 'control';
    };
  }>;
}

export interface Transition {
  id: string;
  consumes: Array<{ place: string; qty: number }>;
  produces: Array<{ place: string; qty: number }>;
}

export function convertTransitions(input: TransitionInput[]): Transition[] {
  return input.map(t => ({
    id: t.id,
    consumes: t.consumes.map(c => ({
      place: c.placeId,
      qty: c.qty
    })),
    produces: t.produces.map(p => ({
      place: p.placeId,
      qty: p.qty
    }))
  }));
}
```

**`src/data/transitions-loader.ts`**:
```typescript
import { Transition, convertTransitions } from './converter';

export async function loadTransitions(): Promise<Transition[]> {
  const response = await fetch('/docs/lunar-chemistry-game-system.transitions.json');
  if (!response.ok) throw new Error('Failed to load transitions');
  
  const data = await response.json();
  
  return convertTransitions(data);
}
```

### 2.6 Game Loop (`src/engine/game-loop.ts`)

```typescript
import { useGameStore } from '../store/game-store';
import { PixiExport } from '../core/types';

export class GameLoop {
  private running: boolean = false;
  private lastTick: number = 0;
  private animationFrameId: number | null = null;

  start(): void {
    this.running = true;
    
    const loop = (timestamp: number) => {
      if (!this.running) return;
      
       if (timestamp - this.lastTick >= 1000) {
         const state = useGameStore.getState();
         const shouldAutoTick = state.mode === 'player' || state.autoTickEnabled;
         if (shouldAutoTick) {
           const exportData = state.tick();
           this.dispatchToPixi(exportData);
         }
         this.lastTick = timestamp;
       }
      
      this.animationFrameId = requestAnimationFrame(loop);
    };
    
    this.animationFrameId = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  private dispatchToPixi(exportData: PixiExport): void {
    if (typeof window.__whitepodOnPixiUpdate === 'function') {
      window.__whitepodOnPixiUpdate(exportData);
    }
    
    window.dispatchEvent(
      new CustomEvent('whitepod-pixi-update', { 
        detail: exportData 
      })
    );
  }
}

declare global {
  interface Window {
    __whitepodOnPixiUpdate?: (exportData: PixiExport) => void;
  }
}
```

---

## 3. Pipeline de Génération Assets

### 3.1 Structure Assets

```
public/assets/
├── tiles/              # Sprite sheets 4x4 (256x256)
│   ├── lunar_hydrogen_tile.png
│   ├── aluminum_ingots_tile.png
│   └── ... (61 ressources)
├── icons/              # Icons 64x64 (256x256 animés)
└── cards/              # Cards illustrées (512x512 animées)
```

### 3.2 Scripts de Génération

**`scripts/extract-resources.ts`**:
```typescript
#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'fs';

const input = process.argv[2] || './docs/lunar-chemistry-game-system.transitions.json';
const output = process.argv[3] || './docs/resource-list.txt';

const data = JSON.parse(readFileSync(input, 'utf-8'));

const resources = new Set<string>();

for (const t of data) {
  for (const c of t.consumes) {
    resources.add(c.place.resource);
  }
  for (const p of t.produces) {
    resources.add(p.place.resource);
  }
}

const filtered = [...resources].filter(r => !['start', 'run', 'done'].includes(r));

writeFileSync(output, filtered.join('\n'));
console.log(`Extrayé ${filtered.length} ressources → ${output}`);
```

**`scripts/generate-asset-prompts.ts`**:
```typescript
#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'fs';

const input = process.argv[2] || './docs/resource-list.txt';
const output = process.argv[3] || './prompts/generated-asset-prompts.jsonl';

const resources = readFileSync(input, 'utf-8').trim().split('\n');

const prompts: any[] = [];

for (const resource of resources) {
  prompts.push({
    id: `${resource}_tile`,
    prompt: `Sprite sheet of animation frames, top-down 2D pixel art grid tile, lunar factory ${resource} production station, 4x4 animation frames, neon cyberpunk lighting, gritty industrial texture. Subtle blinking lights and moving conveyor belts, only a few pixels change between frames, perfect seamless animation loop where the last sprite exactly matches the first.`,
    parameters: { seed: 42, steps: 30, format: 'png', width: 256, height: 256 }
  });
  
  prompts.push({
    id: `${resource}_icon`,
    prompt: `Sprite sheet of animation frames, 64x64 pixel art ${resource} isometric UI icon, dark background, clean cyberpunk neon, gritty industrial texture. Subtle glowing idle animation, only a few pixels change between frames, perfect seamless animation loop where the last sprite exactly matches the first.`,
    parameters: { seed: 42, steps: 30, format: 'png', width: 256, height: 256 }
  });
  
  prompts.push({
    id: `${resource}_card`,
    prompt: `Sprite sheet animation sequence, pixel art card illustration showing lunar factory ${resource} production scene, clean cyberpunk neon combined with gritty industrial textures, limited color palette. Very slow subtle background movement or mechanical animation, only a few pixels change between frames, perfect seamless animation loop where the last sprite exactly matches the first.`,
    parameters: { seed: 42, steps: 30, format: 'png', width: 512, height: 512 }
  });
}

writeFileSync(output, prompts.map(p => JSON.stringify(p)).join('\n'));
console.log(`Généré ${prompts.length} prompts → ${output}`);
```

**`scripts/build-assets.sh`**:
```bash
#!/bin/bash
set -e

echo "=== Whitepod Asset Build ==="

mkdir -p public/assets/{tiles,icons,cards}
echo "# Whitepod Assets" > public/assets/README.md

echo "1. Extraction des ressources..."
npm run assets:extract

echo "2. Génération des prompts..."
npm run assets:prompts

RESOURCE_COUNT=$(wc -l < docs/resource-list.txt)
PROMPT_COUNT=$(wc -l < prompts/generated-asset-prompts.jsonl)

echo ""
echo "=== Résumé ==="
echo "Ressources: $RESOURCE_COUNT"
echo "Prompts: $PROMPT_COUNT"
echo "Directory: public/assets/"
```

---

## 4. Plan d'Implémentation

### Phase 1: Core Types & Engine (Priorité Haute)

**Fichiers**:
1. `src/core/types.ts` - Types core
2. `src/core/petri-net/engine.ts` - PetriNet station-driven + snapshots
3. `src/core/grid/manager.ts` - Grille + dépôts + réservations + snapshots

**Délivrables**:
- [x] Compilation TypeScript sans erreur
- [x] Tests unitaires PetriNet engine (incl. snapshots)
- [x] Tests unitaires Grid manager (incl. snapshots)
- [ ] Documentation JSDoc sur classes principales (à faire)

### Phase 2: Store & Data Pipeline (Priorité Haute)

**Fichiers**:
4. `src/store/game-store.ts` - Zustand store + persist + hydration
5. `src/data/lunar-chemistry-loader.ts` - Loader transitions + metadata depuis `public/data/`
6. `public/data/lunar-chemistry.game-system.transitions.json` - Artifacts (générés)
7. `public/data/lunar-chemistry.metadata.json` - Artifacts (générés)
8. `scripts/generate-lunar-chemistry.js` + `scripts/dsl/*` - Compilateur DSL → artifacts

**Délivrables**:
- [x] Store Zustand opérationnel
- [x] Persistence localStorage (snapshots engine + grid)
- [x] Loader transitions + metadata fonctionnels (`/data/...`)
- [x] Test d'hydratation store (mock fetch + localStorage)
- [x] Auto-save toutes les 30 secondes + flush sur actions majeures

### Phase 3: Game Loop & Integration (Priorité Haute)

**Fichiers**:
9. `src/engine/game-loop.ts` - Game loop (1s tick) + dispatch Pixi
10. `src/main.tsx` - Initialisation application
11. `src/App.tsx` - UI minimale (mode, seed, stations, tokens)

**Délivrables**:
- [x] Game loop fonctionnel (1s tick)
- [x] Callback PixiJS configuré (`window.__whitepodOnPixiUpdate`)
- [x] Application React mountée
- [x] Export JSON Pixi sparse complet (grid/cells, dépôts, stations, layerTokens)

### Phase 4: Asset Pipeline (Priorité Moyenne)

**Fichiers**:
11. `scripts/extract-resources.ts` - Extraction ressources
12. `scripts/generate-asset-prompts.ts` - Génération prompts
13. `scripts/generate-images.ts` - Génération images (placeholder)
14. `scripts/build-assets.sh` - Build script
15. `public/assets/README.md` - Documentation assets

**Délivrables**:
- [ ] Pipeline extraction fonctionnel
- [ ] Prompts générés (180+ ressources × 3 = 540+ prompts)
- [ ] Structure assets prête
- [ ] Documentation complète
- [ ] Mapping asset-ID ↔ ResourceId défini

### Phase 5: PixiJS Renderer (Priorité Moyenne - Partiellement implémenté)

**Fichiers**:
16. `src/render/pixi-renderer.ts` - Renderer PixiJS ✅
17. `src/components/PixiCanvas.tsx` - Composant React ✅
18. `src/assets/sprite-sheets.ts` - Loader sprite sheets
19. `src/render/pixi-renderer.test.ts` - Tests integration

**Délivrables**:
- [x] Renderer PixiJS de base fonctionnel
- [ ] Sprite sheets chargés (4x4 animation)
- [ ] Animations fluides (60 FPS)
- [x] Visualisation basique tokens/grid
- [ ] Integration tests (update, cleanup, resize)
- [ ] Diffing strategy optimisée (dirty-tracking au lieu de JSON.stringify)
- [ ] Resize behavior et viewport scaling
- [ ] Performance budget (update frequency, export diffing)

---

## 5. Structure Fichiers Finale

```
whitepod/
├── public/
│   └── assets/
│       ├── tiles/              # Sprite sheets 4x4 (256x256)
│       ├── icons/              # Icons 64x64
│       └── cards/              # Cards illustrées
│
├── src/
│   ├── core/
│   │   ├── types.ts
│   │   ├── petri-net/
│   │   │   └── engine.ts
│   │   └── grid/
│   │       └── manager.ts
│   │
│   ├── store/
│   │   └── game-store.ts
│   │
│   ├── data/
│   │   ├── converter.ts
│   │   ├── transitions-loader.ts
│   │   └── metadata-loader.ts
│   │
│   ├── engine/
│   │   └── game-loop.ts
│   │
│   ├── render/                 # Future (Phase 5)
│   │   └── pixi-renderer.ts
│   │
│   ├── components/
│   │   ├── debug/
│   │   │   ├── PetriNetDebugger.tsx
│   │   │   └── petri/
│   │   │       └── PetriNetDiagram.tsx
│   │   └── PixiCanvas.tsx      # Future (Phase 5)
│   │
│   ├── assets/
│   │   └── README.md
│   │
│   ├── test/
│   │   ├── petri-net.test.ts
│   │   ├── grid.test.ts
│   │   └── setup.ts
│   │
│   ├── lib/
│   │   └── utils.ts
│   │
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
│
├── docs/
│   ├── lunar-chemistry-game-system.dsl
│   ├── lunar-chemistry-petrinet.dsl
│   ├── lunar-chemistry-petrinet.fast.dsl
│   ├── lunar-chemistry-petrinet.transitions.full.json
│   ├── lunar-chemistry-game-system.transitions.json
│   ├── lunar-chemistry-petrinet.transitions.json
│   ├── project-relaunch-guide.md
│   └── resource-list.txt               # Généré (Phase 4)
│
├── prompts/
│   ├── Game_Asset_Generation_Assistance.md
│   └── generated-asset-prompts.jsonl   # Généré (Phase 4)
│
├── scripts/
│   ├── extract-resources.ts
│   ├── generate-asset-prompts.ts
│   ├── generate-images.ts
│   └── build-assets.sh
│
└── package.json
```

---

## 6. Scripts Package.json

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "generate:lunar-chemistry": "node scripts/generate-lunar-chemistry.js",
    "assets:extract": "tsx scripts/extract-resources.ts",
    "assets:prompts": "tsx scripts/generate-asset-prompts.ts",
    "assets:generate": "tsx scripts/generate-images.ts",
    "assets:build": "bash scripts/build-assets.sh"
  }
}
```

---

## 7. Points d'Attention & Risques

### 7.1 Performance
- Exporter uniquement cells actives (sparse array)
- Limiter animations actives
- Utiliser WeakMap pour références Pixi

### 7.2 Mémoire
- Nettoyage automatique tokens à 0
- Compression JSON si nécessaire
- Versioning save data

### 7.3 Synchronisation
- Timestamp synchronisé
- Callback directe (pas d'événement)
- Frame lock si nécessaire

### 7.4 Persistence
- Quota localStorage ~5-10MB
- Validation save data
- Fallback sur nouvelle session

---

## 8. Critères d'Acceptation

### Phase 1: Core Types & Engine
- [x] TypeScript compilation sans erreurs
- [x] Lint sans warnings
- [x] Tests unitaires PetriNet engine (incl. snapshots)
- [x] Tests unitaires Grid manager (incl. snapshots)
- [ ] Documentation JSDoc complète

### Phase 2: Store & Data Pipeline
- [x] Store Zustand initialisé
- [x] Persistence localStorage fonctionnelle (snapshots sérialisables)
- [x] Auto-save toutes les 30 secondes + flush sur actions majeures
- [x] Loader transitions: JSON servie via `public/data/*`
- [x] DSL → JSON: compilateur + validation

### Phase 3: Game Loop & Integration
- [x] Game loop démarré: 1s tick fonctionnel
- [x] Callback PixiJS configuré
- [x] Application React mountée
- [x] Export Pixi sparse: grid/cells, dépôts, stations, layerTokens

### Phase 4: Asset Pipeline
- [ ] Extraction ressources: 61 ressources extraites
- [ ] Prompts générés: 183+ prompts (61 × 3)
- [ ] Structure assets: répertoires créés
- [ ] Documentation: README.md complet

### Phase 5: PixiJS Renderer (Partiellement implémenté)
- [x] Renderer monté: canvas PixiJS actif
- [ ] Sprite sheets chargés: 61+ ressources
- [ ] Animations: 60 FPS stable
- [x] Visualisation: grid + tokens visibles
- [ ] Tests d'intégration: update, cleanup, resize
- [ ] Diffing strategy optimisée (éviter JSON.stringify)

---

## 9. Workflow de Développement

### Séance 1: Core Types & Engine (Phase 1)
**Durée**: 2-3 heures
1. Créer `src/core/types.ts` (30 min)
2. Implémenter `src/core/petri-net/engine.ts` (60 min)
3. Implémenter `src/core/grid/manager.ts` (60 min)
4. Écrire tests unitaires (30 min)
5. Refactoring & documentation (30 min)

### Séance 2: Store & Data (Phase 2)
**Durée**: 2-3 heures
1. Créer `src/store/game-store.ts` (45 min)
2. Implémenter `src/data/converter.ts` (30 min)
3. Implémenter `src/data/transitions-loader.ts` (30 min)
4. Configurer persistence (30 min)
5. Tests integration (45 min)

### Séance 3: Game Loop & Integration (Phase 3)
**Durée**: 2-3 heures
1. Créer `src/engine/game-loop.ts` (45 min)
2. Modifier `src/main.tsx` (30 min)
3. Modifier `src/App.tsx` (30 min)
4. Tester export JSON (30 min)
5. Debug & ajustements (45 min)

### Séance 4: Asset Pipeline (Phase 4)
**Durée**: 2-3 heures
1. Créer `scripts/extract-resources.ts` (30 min)
2. Créer `scripts/generate-asset-prompts.ts` (60 min)
3. Créer `scripts/build-assets.sh` (30 min)
4. Générer ressources & prompts (30 min)
5. Documentation assets (30 min)

### Séance 5: PixiJS Renderer (Phase 5 - Future)
**Durée**: 4-6 heures
1. Configuration PixiJS (30 min)
2. Créer `src/render/pixi-renderer.ts` (90 min)
3. Créer `src/components/PixiCanvas.tsx` (60 min)
4. Loader sprite sheets (60 min)
5. Implémenter animations (60 min)
6. Debug & optimisation (60 min)

---

## 10. Exemple d'Export JSON

```json
{
  "timestamp": 1234567890123,
  "phase": "running",
  "grid": {
    "width": 128,
    "height": 128,
    "cells": [
      {
        "x": 42,
        "y": 17,
        "resource": {
          "type": "lunar_hydrogen",
          "producedAt": 1234567880000
        },
        "station": {
          "transitionId": "lunar_hydrogen_extraction",
          "state": "idle",
          "progress": 0
        }
      },
      {
        "x": 43,
        "y": 17,
        "station": {
          "transitionId": "convey__lunar_hydrogen",
          "state": "processing",
          "progress": 0.6
        }
      }
    ]
  },
  "tokens": {
    "lunar_hydrogen_surface": 5,
    "lunar_hydrogen_bus": 3,
    "lunar_hydrogen_stock": 12,
    "run": 1
  },
  "animations": [
    {
      "resourceId": "lunar_hydrogen",
      "layer": "surface",
      "action": "consume",
      "frameIndex": 8,
      "progress": 0.4
    }
  ]
}
```

---

## 11. Conclusion

Ce plan exhaustif couvre l'ensemble de l'implémentation du moteur Whitepod, de l'initialisation des types TypeScript jusqu'à la pipeline de génération d'assets. Les 5 phases sont séquencées logiquement, avec des checkpoints clairs et des critères d'acceptation précis.

**Prochaines étapes** (dans une session ultérieure):

1. **Phase 1**: ✅ Types core + PetriNet engine + Grid manager
2. **Phase 2**: ✅ Store Zustand + loaders + persistance + autosave
3. **Phase 3**: ✅ Game loop + intégration React + export Pixi sparse
4. **Phase 4**: ⏳ Asset pipeline + scripts (non implémenté)
5. **Phase 5**: ⏳ PixiJS renderer + raffinage visuel

Le plan est prêt pour l'implémentation.
