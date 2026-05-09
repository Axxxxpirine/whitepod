# Refacto carte / grille — plan d'exécution

> **Branche** : `feat/map-grid-atmosphere` (créée depuis `origin/main` après merge de la PR #52 "RTS sprite library and Field Model rendering")
> **PR cible** : à créer en fin de Phase 2
> **Source de la diagnose** : `/plan-design-review` du 2026-05-08, screenshots dans `.context/design-review/01..04-*.png`

---

## 1. Contexte

La PR #52 a livré la bibliothèque RTS (sprites buildings + ressources + décals terrain) et l'extension `DESIGN.md` "RTS Field Model". Les **assets** sont stylistiquement réussis, mais à zoom 1x (défaut) la **carte/grille** lit comme "une pierre grise flottant dans le vide" :

- pas d'horizon, pas de cadrage spatial
- bruit du regolith devient du screen-static
- hairlines de grille (`#2A3038` promis dans `DESIGN.md`) disparaissent à l'antialiasing
- fog-of-war = masque binaire avec coupure brutale vers le noir
- buildings 3/4 SE flottent sur un terrain top-down → whiplash perspective
- aucune passe lumière → rien n'ancre les buildings au sol

**Rating actuel** : 5/10. **Cible** : 8/10 minimum.

---

## 2. Décisions figées

| Code | Décision | Source |
|------|----------|--------|
| **D-1 setting planétaire** | Surface lunaire (régolithe gris, vacuum, Earth visible). | `CHANGELOG.md` L9 "Lunar ISRU resource lore" |
| **D-2 perspective** | Terrain reste **top-down strict**. Le 3/4 SE n'existe que sur les sprites buildings, ancrés par soft-shadow elliptical. Pas de refacto picking/placement. | Plan original, contrainte de scope |
| **D-3 lumière directionnelle** | Soleil **figé SE** (pas de rotation runtime). `dayNightCycleSeconds` continue d'agir uniquement en color-tint screen-space via `DayNightOverlayRenderer`. | Cohérence visuelle + perf |
| **Atmosphère** | Pas de brume atmosphérique terrestre (la Lune n'a pas d'air). Le "fog-of-war" devient earthlight bleu glacé qui s'atténue vers le noir profond. | D-1 |
| **Skybox** | Aucune décoration étoilée (AI-slop). Backdrop = dégradé radial planétaire seul. Earth visible optionnelle (à valider visuellement quand implémenté). | DESIGN.md "AI Slop blacklist" |

---

## 3. Ordre d'exécution (par impact croissant et risque croissant)

```
Tâche 0 : Pré-flight
  ↓
Tâche 1 : Gap #6 — hairlines de grille          (visuel, faible risque, ~30% du fix)
  ↓
Tâche 2 : Gap #5 — tile noise calmé              (visuel, faible risque)
  ↓
Tâche 3 : Gap #3 — backdrop planétaire            (nouveau renderer, indépendant)
  ↓
Tâche 4 : Gap #4 — fog atmosphérique              (refactor existant, gameplay neutre)
  ↓
Tâche 5 : Gap #2 — passe lumière directionnelle   (perf-sensible, bench AVANT/APRÈS)
  ↓
Tâche 6 : Gap #1 — ancrage perspective            (compensation visuelle, pas de gameplay)
  ↓
Tâche 7 : Polish + revue + PR
```

Chaque tâche est commitée atomiquement (`feat(renderer): ...`) avec lint + tests + build verts avant le commit suivant. CLAUDE.md exige cette discipline.

---

## 4. Tâches détaillées

### Tâche 0 — Pré-flight

**But** : démarrer sur une base propre, capturer la baseline visuelle.

- [ ] `git status` propre, sur `feat/map-grid-atmosphere` (déjà fait).
- [ ] `npm run lint` + `npm test -- --run` + `npm run build` : tous verts.
- [ ] Conserver les 4 baselines : `.context/design-review/01-default-view.png`, `02-zoomed-2.5x.png`, `03-zoomed-out-0.5x.png`, `04-zoomed-4x.png`.
- [ ] Lancer le dev server (`:5173` déjà tourne dans Conductor) et capturer 1 screenshot supplémentaire avec un chantier construit (extracteur + solar + storage + belt) pour comparer après chaque tâche.
- [ ] Bench perf baseline : `gstack browse perf` → noter FPS moyen, frame time.

**Acceptation** : screenshots baseline archivés, perf baseline notée.

---

### Tâche 1 — Gap #6 : Hairlines de grille perceptibles à tout zoom

**But** : la promesse `DESIGN.md` ("`#2A3038` 1px hairlines") doit tenir au zoom par défaut.

**Fichiers** :
- `src/game/renderer/GridRenderer.ts` (modifier)

**Approche** :
1. Repérer la passe terrain actuelle dans `GridRenderer.ts` (~L20-82). Aujourd'hui : tint procédural par tile, pas de lignes.
2. Ajouter un sous-pass `drawGridLines(container, viewport)` dessiné dans le même container après le terrain.
3. Couleur : token `--grid-line` (`#2A3038`) — exposer via `GRID_LINE_HEX` constant si le fichier n'a pas encore d'accès aux tokens.
4. Largeur : 1px **constant en pixels écran** (donc `lineWidth = 1 / viewport.zoom`).
5. Alpha :
   - zoom ≥ 1.0 → alpha 1.0
   - zoom 0.4 – 1.0 → alpha lerp linéaire de 1.0 à 0.35
   - zoom < 0.4 → alpha 0 (évite le moiré)
6. Cull : ne dessiner que les lignes visibles dans le viewport (lecture viewport bounds, calcul des ranges X/Y).
7. Dessin via `Graphics` Pixi (pool / batch — réutiliser le pattern de `BeltRenderer.ts` qui pool déjà des Graphics).

**Acceptation** :
- Screenshot zoom 1x : hairlines visibles, lecture "drawing board" évidente.
- Screenshot zoom 0.5x : hairlines présentes mais discrètes (alpha ~0.5).
- Screenshot zoom 2.5x et 4x : nets, aucun moiré, aucune perte de perf perçue.
- 60 fps maintenu.

**Vérification** :
```bash
npm run lint && npm test -- --run && npm run build
$B goto http://localhost:5173/
$B js "window.engine.viewport.zoom = 1; window.engine.viewport.onChange()"
$B screenshot .context/design-review/T1-zoom-1x-after.png
$B js "window.engine.viewport.zoom = 0.5; window.engine.viewport.onChange()"
$B screenshot .context/design-review/T1-zoom-0.5x-after.png
```

**Commit** : `feat(renderer): draw zoom-aware grid hairlines on the terrain`

---

### Tâche 2 — Gap #5 : Tile noise calmé

**But** : à zoom 1x, le terrain doit lire "régolithe", pas "static TV".

**Fichiers** :
- `src/game/renderer/TileSprite.ts` (modifier — fonctions `getTileColor()` et `createRegolithTexture()`, lignes ~36-99)

**Approche** :
1. Réduire l'amplitude du per-tile noise : `±2` actuel → `±1` (la quantization 8 niveaux amplifie le bruit).
2. Quantization 8 → 6 niveaux pour calmer le contraste inter-tiles.
3. Garder le crater darkening multi-scale (il fonctionne — c'est le bruit de base qui pose problème).
4. Pour la texture régolithe (`createRegolithTexture()`) : passer la densité de speckles de "fine" à "sparse" (ratio dark/total speckles ÷ 2). Conserver la palette warmgrey.
5. Augmenter la granularité spatiale : utiliser une seed bigger-step (fbm-like) pour avoir des "patches" de tile_color cohérents plutôt que du salt-and-pepper par tile.

**Acceptation** :
- Le bruit ne lit plus comme du statique. À zoom 1x : impression de "sol granuleux mat".
- Tests `tests/renderer/BuildingRenderer.test.ts` toujours verts (le test de placement ne dépend pas de la couleur, mais on valide).
- Performance ≥ baseline (la génération est en init, pas de coût frame).

**Vérification** :
```bash
npm run lint && npm test -- --run && npm run build
# Diff visuel zoom 1x avant/après
```

**Commit** : `feat(renderer): calm regolith noise into legible granular texture`

---

### Tâche 3 — Gap #3 : Backdrop planétaire (nouveau renderer)

**But** : la map ne flotte plus dans le vide noir. Il y a un "lieu" — la Lune — autour.

**Fichiers** :
- `src/game/renderer/WorldBackdropRenderer.ts` (**nouveau**)
- `src/components/GameCanvas.tsx` (modifier — wirer en couche -10, sous tous les renderers terrain)

**Approche** :
1. Créer un `WorldBackdropRenderer` qui gère :
   - Un `Graphics` plein-écran fixe screen-space (PAS world-space — c'est un fond).
   - Un dégradé radial centré sur le viewport center :
     - inner stop : `#0B0D10` (token `--bg`)
     - mid stop (rayon ~0.65 du min(w,h)/2) : `#080A0D` (légèrement plus sombre)
     - outer stop (bord écran) : `#04060A` (presque noir, légèrement bleu-glacé)
   - Recalcul à chaque resize, pas à chaque frame.
2. **Optionnel** (à activer en deuxième passe) : un disque "Earth" en haut-droite, 24px de diamètre, couleur `#3F8AB8` (cyan terne) avec terminator subtil. À valider visuellement avant d'inclure.
3. **PAS d'étoiles décoratives** (DESIGN.md AI-slop blacklist).
4. Insérer dans `GameCanvas.tsx` AVANT `gridRenderer.init()`. Z-order : backdrop (couche -10) → grid → terrain decals → ressources → buildings → belts → flow → highlights → preview → energy links → fog → daynight.

**Acceptation** :
- Zoom 0.5x : la map ne lit plus comme un disque flottant. Présence d'un "espace planétaire" autour.
- Aucune dégradation perf (gradient radial = 1 draw call).
- Aucun changement de gameplay.

**Vérification** :
```bash
npm run lint && npm test -- --run && npm run build
$B screenshot .context/design-review/T3-backdrop-zoom-0.5x.png
```

**Commit** : `feat(renderer): add WorldBackdropRenderer for planetary spatial framing`

---

### Tâche 4 — Gap #4 : Fog-of-war atmosphérique

**But** : la transition entre exploré et inexploré ne lit plus comme un masque binaire.

**Fichiers** :
- `src/game/renderer/FogOfWarRenderer.ts` (modifier)

**Approche** :
1. Repérer le rendu actuel : à confirmer mais c'est probablement un `Graphics.beginFill()` noir ou un canvas-rendered alpha mask.
2. Refactor : passer à un dégradé multi-stop (3 stops minimum) sur la transition exploré → inexploré :
   - exploré (alpha 0)
   - frange (rayon 1-2 tiles autour) : earthlight bleu glacé `#1A2A3A` à alpha 0.35 (la dispersion lunaire de la lumière Terre)
   - inexploré profond : `#02030A` à alpha 0.95 (presque noir mais cohérent avec le backdrop)
3. Approche technique :
   - Si renderer canvas : modifier le gradient buffer (radialGradient avec 3 colorStops).
   - Si renderer Graphics : utiliser `BlurFilter` léger (radius 4-8) sur le mask actuel pour adoucir le bord, suivi d'un tint multi-stop.
4. Préserver la logique gameplay : la zone explorée reste calculée comme aujourd'hui (watchtowers, base initiale). Seul le **rendu** du masque change.
5. Reveal preview circles (mode placement watchtower) : conserver intact.

**Acceptation** :
- Coupure brutale → bord doux + tinté earthlight.
- Bord du playable se "fond" dans le backdrop (Tâche 3).
- Gameplay strictement identique : aucun changement de visibilité, aucun changement de logique reveal.
- Perf : pas plus d'1 draw call additionnel (BlurFilter ou gradient).

**Vérification** :
```bash
npm run lint && npm test -- --run && npm run build
$B screenshot .context/design-review/T4-fog-zoom-1x.png
$B screenshot .context/design-review/T4-fog-zoom-0.5x.png
```

**Commit** : `feat(renderer): soften fog-of-war into atmospheric earthlight haze`

---

### Tâche 5 — Gap #2 : Passe lumière directionnelle

**But** : les buildings sont ancrés au sol. Le terrain a une légère AO aux arêtes des cratères. Le tout cohérent avec un soleil SE figé.

**Fichiers** :
- `src/game/renderer/LightingPass.ts` (**nouveau** — peut être un simple ColorMatrixFilter Pixi appliqué au container terrain)
- `src/game/renderer/BuildingRenderer.ts` (modifier — vérifier la direction de la shadow elliptical actuelle, l'aligner SE si pas déjà)
- `src/game/renderer/TerrainDecalRenderer.ts` (modifier — ajouter une demi-ombre sur le côté NW des cratères)

**Approche** :
1. Diagnostic actuel : `BuildingRenderer.ts` dessine déjà des shadows (alpha 0.26). Vérifier l'orientation : doivent partir vers le NW (soleil SE → ombre NW). Si centrées ou orientées autrement, corriger.
2. Pour les cratères et rock_seam (`TerrainDecalRenderer.ts`) : ajouter un halo plus sombre sur le bord NW de chaque décal. 2 options :
   - Option simple : modifier le rendu pour dessiner deux passes (background dark, foreground rock).
   - Option propre : un sprite "shadow" pré-calculé livré dans `public/sprites/rts/terrain/` — coût asset 0 (peut être généré localement). Hors scope si trop long.
3. Ambient ground tint : appliquer un `ColorMatrixFilter` léger (gain 1.02 sur R, 1.0 sur G, 0.98 sur B) sur le container terrain pour donner une teinte chaude subtile côté SE. Ne PAS toucher les buildings (risque de désaturer les sprites).
4. **Pas** de raycasting / pas de shader maison. Pixi 8 `ColorMatrixFilter` suffit.

**Risque perf** : un filter Pixi sur un container de la taille du terrain peut coûter cher. Bench AVANT/APRÈS obligatoire.

**Fallback si perf < 55 fps** : retirer le `ColorMatrixFilter` global, garder uniquement les shadows sur buildings + cratères (gain visuel ~70% sans coût GPU).

**Acceptation** :
- Buildings semblent posés (shadow visible à NW, soft).
- Cratères ont une lecture concave (pas plat).
- 60 fps maintenu sur la map de référence (mid-game, ~50 buildings placés).
- Aucune désaturation des sprites RTS.

**Vérification** :
```bash
npm run lint && npm test -- --run && npm run build
# Bench perf après
gstack browse perf
$B screenshot .context/design-review/T5-lighting-mid-game.png
```

**Commit** : `feat(renderer): add directional lighting pass with NW shadows`

---

### Tâche 6 — Gap #1 : Compensation perspective (ancrage)

**But** : aplanir le whiplash entre terrain top-down et sprites 3/4 SE — sans refacturer l'engine.

**Fichiers** :
- `src/game/renderer/BuildingRenderer.ts` (vérifier / ajuster les ground-shadow plates)
- `src/game/renderer/GridRenderer.ts` (optionnel — légère alpha sous les buildings pour suggérer la perspective)

**Approche** :
1. La shadow elliptical posée par la Tâche 5 est la principale réponse à ce gap. Vérifier qu'elle est :
   - bottom-anchored (elle l'est déjà via `displayHeightTiles`)
   - **wider that the footprint** (overflow ~10% en X, ~5% en Y) pour suggérer que le sprite "déborde" légèrement sur le sol environnant en perspective
   - alpha 0.26 + soft blur radius 1-2 tiles
2. **Optionnel** : sous chaque building, dimmer très légèrement le tile underneath (alpha 0.15 dark overlay) pour suggérer le contact sol. À tester visuellement, peut être trop bruité.
3. Tester avec la map de référence : zoom 1x, plusieurs buildings placés. Le résultat doit lire "buildings posés sur un sol gridé" et non "buildings flottant sur un patron de carrés".

**Acceptation** :
- Lecture cohérente "buildings ancrés" à zoom 1x et 2.5x.
- Pas de régression sur la lisibilité du grid.
- Tests `BuildingRenderer.test.ts` verts.

**Vérification** :
```bash
npm run lint && npm test -- --run && npm run build
$B screenshot .context/design-review/T6-anchored-zoom-1x.png
$B screenshot .context/design-review/T6-anchored-zoom-2.5x.png
```

**Commit** : `feat(renderer): widen building shadows to anchor 3/4 sprites onto top-down terrain`

---

### Tâche 7 — Polish, revue, PR

**But** : valider l'ensemble, créer la PR vers `main`.

**Étapes** :
1. **Sweep visuel final** : screenshots aux 3 zooms (0.5x / 1x / 2.5x) + map mid-game + map start. Comparer aux baselines (`01..04-*.png`). Le rating cible est 8/10.
2. **Bench perf complet** : FPS moyen, frame time, GPU memory si dispo. Doit être ≥ baseline ou ≤ 5% de régression. Au-delà, appliquer le fallback de la Tâche 5.
3. **Lint + tests + build** : verts.
4. **Tester la résilience** :
   - Reload de la session (la persistence localStorage doit ramener la map identique)
   - Pan/zoom rapide pendant 30s, vérifier qu'aucune fuite mémoire visible (frame time stable).
5. **Update DESIGN.md** : ajouter une entrée "Decisions log" :
   ```
   - **2026-XX-XX**: Map/grid refacto. Hairlines visibles à tout zoom, backdrop planétaire,
     fog atmosphérique earthlight, lumière directionnelle SE figée. Terrain top-down strict
     conservé. Réf : `docs/map-grid-refacto.md`.
   ```
6. **Push** : `git push -u origin feat/map-grid-atmosphere`
7. **PR** :
   - Titre : `feat(renderer): atmospheric map and grid refacto`
   - Body : résumé des 6 gaps fixés + screenshots avant/après + note perf bench + lien vers ce doc
   - Base : `main`
8. **Lancer `/plan-eng-review` ou `/codex review`** sur la PR avant merge.

**Acceptation finale** : rating design ≥ 8/10, perf ≥ baseline -5%, tests verts, PR ouverte avec screenshots.

**Commit** : `docs(design): log map/grid refacto decision`

---

## 5. Hors scope (explicite)

| Item | Pourquoi reporté |
|------|------------------|
| Refacto picking/placement engine en 3/4 réel | Énorme chantier (refacto coords, viewport, click handling). Pas justifié pour le gain visuel. |
| Animation runtime (sprites animés, particules de poussière) | Polish. Peut venir en passe 3 si le visuel valide. |
| Refonte HUD top-left ou toolbar | Hors scope canvas. Chrome UI déjà OK. |
| Skybox étoilée décorative | AI-slop blacklist. |
| Earth visible en backdrop | Optionnel, à valider visuellement après Tâche 3. À marquer TODO si reporté. |
| Day/night × shadow direction | D-3 figé : soleil SE invariant. Si gameplay devient "construit-de-nuit", reposer la question. |
| Disque/sphère lunaire vu depuis l'espace en zoom-out extrême | Bonus visuel. Tester en T7, garder si simple. |

---

## 6. Réutiliser ce qui existe

| Existant | Utilisation |
|----------|-------------|
| `DayNightOverlayRenderer` | Hook screen-space déjà en place. Peut accueillir un tweak de tint si Tâche 5 ne suffit pas. |
| `TerrainDecalRenderer` (PR #52) | Pattern hash + cull stride à reproduire pour toute nouvelle décoration de sol. |
| Tokens `DESIGN.md` (`--grid-tile`, `--grid-line`, `--bg`, `--accent`) | Source de vérité unique. AUCUNE nouvelle couleur introduite par ce refacto. |
| `viewport.zoom` (observable via `onChange`) | Drive l'alpha des hairlines (Tâche 1) et tout calcul d'opacité zoom-aware. |
| Pool `Graphics` de `BeltRenderer.ts` | Pattern à dupliquer pour le grid-line drawing. |

---

## 7. Risques & atténuations

| Risque | Atténuation |
|--------|-------------|
| Tâche 5 dégrade le FPS sous 55 | Fallback documenté : retirer `ColorMatrixFilter` global, garder shadows seules. |
| Grid hairlines créent du moiré sous zoom 0.4 | Alpha → 0 sous 0.4 (Tâche 1, étape 5). |
| Backdrop change la lisibilité du fog-of-war | Tester l'enchaînement T3 + T4 ensemble avant commit du fog. |
| Régression placement preview / energy link visibility | Test de fumée manuel après chaque tâche. |
| Test flake `generateComplexScenario` | Pré-existant sur main, pas introduit par ce refacto. À ignorer sauf si reproductible. |

---

## 8. Critères de sortie globaux

- [ ] Rating design auto-évalué ≥ 8/10
- [ ] Tous gaps #1 à #6 traités ou explicitement reportés avec TODO tracé
- [ ] `npm run lint` ✅
- [ ] `npm test -- --run` ✅ (373 ou plus, 0 failure stable sur 3 runs)
- [ ] `npm run build` ✅
- [ ] FPS moyen ≥ baseline -5%
- [ ] Aucun changement gameplay (placement, picking, energy, belts, fog reveal)
- [ ] DESIGN.md mis à jour (Decisions log)
- [ ] PR créée vers `main`, screenshots avant/après dans le body
