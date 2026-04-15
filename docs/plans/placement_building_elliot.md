Plan final — validé                                                                                                                                                                                               
                                                
  Décisions verrouillées                                                                                                                                                                                            
                                                                                                                                                                                                                    
  1. BuildingRegistry dédié (Uint16Array d'occupation + Map<BuildingId, Building>)                                                                                                                                  
  2. Rotation: paramètre rotation: Direction présent dans l'API, logique no-op en v1                                                                                                                                
  3. Store Zustand: selectedTool devient union discriminée {kind:'tile'|'building', ...}                                                                                                                            
                                                                                                                                                                                                                    
  Fichiers à créer/modifier                                                                                                                                                                                         
                                                                                                                                                                                                                    
  NEW  src/game/data/BuildingRegistry.ts                                                                                                                                                                            
  NEW  src/game/data/buildingCatalog.ts          # 1-2 entrées placeholder (1x1 et 3x3)                                                                                                                             
  NEW  tests/data/BuildingRegistry.test.ts                                                                                                                                                                          
  NEW  tests/engine/GameEngine.building.test.ts                                                                                                                                                                     
  MOD  src/game/types.ts                          # +Building, +BuildingType, +BuildingId, +Footprint, +PlacementResult                                                                                             
  MOD  src/game/engine/GameEngine.ts              # +placeBuilding, +removeBuilding, +getBuildingAt, +canPlaceBuilding, +getBuildings                                                                               
  MOD  src/store/useGameStore.ts                  # selectedTool en union                                                                                                                                           
                                                                                                                                                                                                                    
  API finale GameEngine                                                                                                                                                                                             
                                                                                                                                                                                                                    
  canPlaceBuilding(typeId, origin, rotation?): PlacementResult                                                                                                                                                      
  placeBuilding(typeId, origin, rotation?): BuildingId | null                                                                                                                                                       
  removeBuilding(id): boolean                                                                                                                                                                                       
  getBuildingAt(x, y): Building | null                                                                                                                                                                              
  getBuildings(): ReadonlyMap<BuildingId, Building>                                                                                                                                                                 
                                         
  type PlacementResult =                                                                                                                                                                                            
    | { ok: true }                             
    | { ok: false; reason: 'out_of_bounds' | 'tile_occupied' | 'tile_type_invalid' | 'unknown_type' };                                                                                                              
                                                                                                                                                                                                                    
  Invariants critiques à tester  
                                                                                                                                                                                                                    
  1. Atomicité: un placement échoué sur la N-ième tuile du footprint ne laisse aucune tuile occupée.                                                                                                                
  2. Lookup uniforme: getBuildingAt retourne le même bâtiment pour chacune des 9 tuiles d'un 3×3.
  3. Bords: origin=(498,498) avec footprint 3×3 → out_of_bounds.                                                                                                                                                    
  4. IDs stables: suppression puis re-création n'a pas à réutiliser un id (compteur strictement croissant).                                                                                                         
  5. Serialize roundtrip: registry → buffer → registry reconstruit avec occupation grid identique.                                                                                                                  
                                                                                                                                                                                                                    
  NOT in scope                                                                                                                                                                                                      
                                                                                                                                                                                                                    
  - Coût, énergie, ressources dans BuildingType                                                                                                                                                                     
  - Rotation effective (logique, pas signature)
  - Réseau/connexions entre bâtiments (convoyeurs)                                                                                                                                                                  
  - Palette UI, sprites, preview au survol — Julien                                                                                                                                                                 
  - Animations, sons                                                                                                                                                                                                
  - Undo/redo, persistence localStorage auto                                                                                                                                                                        
  - Validation métier complexe (ex: "un extracteur doit être adjacent à du Rock") — v1 utilise seulement allowedTiles                                                                                               
                                                                                                                                                                                                                    
  Handoff Julien (frontend)                                                                                                                                                                                         
                                                                                                                                                                                                                    
  Ce que ma branche lui livre, prêt à consommer:                                                                                                                                                                    
  - engine.placeBuilding(typeId, {x,y}) fonctionne
  - engine.getBuildingAt(x,y) pour hover/preview                                                                                                                                                                    
  - useGameStore().selectedTool en union type, il choisit la forme du UI de sélection
  - buildingCatalog avec 2 entrées placeholder (ex: placeholder_1x1, placeholder_3x3) pour qu'il teste sans attendre                                                                                                
                                                                                                                                                                                                                    
  Je ne touche pas: GridRenderer, TileSprite, GameCanvas.tsx, App.tsx, App.css, aucun composant React au-delà du hook store.                                                                                        
                                                                                                                                                                                                                    
  ---                                                                                                                                                                                                               
  Completion Summary                                                                                                                                                                                                
                                               
  ┌──────────────────┬──────────────────────────────────────────────────┐
  │     Section      │                     Résultat                     │                                                                                                                                           
  ├──────────────────┼──────────────────────────────────────────────────┤
  │ Mode             │ HOLD SCOPE (override "atomique")                 │                                                                                                                                           
  ├──────────────────┼──────────────────────────────────────────────────┤
  │ Approche retenue │ A — BuildingRegistry dédié                       │                                                                                                                                           
  ├──────────────────┼──────────────────────────────────────────────────┤                                                                                                                                           
  │ Error/Rescue map │ 4 reasons nommés, 0 catch-all                    │                                                                                                                                           
  ├──────────────────┼──────────────────────────────────────────────────┤                                                                                                                                           
  │ Tests requis     │ 11 cases listés, focus sur atomicité multi-tuile │
  ├──────────────────┼──────────────────────────────────────────────────┤                                                                                                                                           
  │ Scope décisions  │ 3/3 répondues                                    │
  ├──────────────────┼──────────────────────────────────────────────────┤                                                                                                                                           
  │ Gaps critiques   │ 0                                                │
  ├──────────────────┼──────────────────────────────────────────────────┤                                                                                                                                           
  │ Unresolved       │ 0                                                │
  └──────────────────┴──────────────────────────────────────────────────┘                                                                                                                                           
                                               
  VERDICT: CLEARED — plan prêt à implémenter.                                                                                                                                                                       
                                               
  Prochaines étapes                                                                                                                                                                                                 
                                         
  1. git checkout -b feat/building-placement (tu es sur main, faut bouger)                                                                                                                                          
  2. Implémenter selon le plan                 
  3. /plan-eng-review si tu veux une passe archi avant code, sinon direct                                                                                                                                           
  4. Tests verts → PR vers main                                                                                                                                                                                     
                                                                         