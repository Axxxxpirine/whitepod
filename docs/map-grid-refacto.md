# Refacto carte/grille — historique

> **Statut** : Plan V2 (true iso projection) livré sur `feat/map-grid-atmosphere`.
> **Source de vérité** : `DESIGN.md` decisions log entry 2026-05-09 (iso projection).

## Plan V2 — True iso diamond projection (2026-05-09)

Le rendu monde bascule en projection iso 2:1 diamond. Toutes les coords logiques `(tx, ty)` du gameplay restent rectangulaires — seuls les renderers et les transforms screen↔world projettent par `IsoTransform.tileCenterToIso` / `isoToTile`.

### Décisions verrouillées

| Code | Décision |
|---|---|
| **D-1** | Direction esthétique : Atmospheric RTS gameplay (Frostpunk / They Are Billions vibe), pas Drawing Board strict. |
| **D-2** | Stratégie de rendu : true iso diamond 2:1 (ISO_TILE_W=64, ISO_TILE_H=32). |
| **D-3** | Coords gameplay : inchangées rectangulaires. Engine simulation intacte (cf `PRIMITIVES.md`). |
| **D-4** | Soleil : figé SE. |
| **D-5** | Diagonales axonométriques (V1) : supprimées (devenues redondantes avec le vrai iso). |
| **D-6** | UI/HUD : reste Drawing Board. Seul le play-field bascule en atmospheric RTS. |
| **D-7** | Backdrop planétaire conservé et renforcé (gradient ×4 contrasté + `AmbientHazeRenderer`). |

### Phases livrées

1. **Foundation iso math** — `src/game/engine/IsoTransform.ts` + tests round-trip / vertex picking.
2. **Viewport + CoordinateTransform iso** — picking via `Math.round` sur l'inverse iso. Pan limits adaptées aux bounds iso.
3. **GridRenderer + TileSprite iso diamonds** — texture régolithe diamond-masquée, sprite anchor center, suppression des helpers axonométriques.
4. **Décals + ressources iso** — positions via `tileCenterToIso`.
5. **Buildings + shadows + Y-sort** — bottom-anchor iso, `BlurFilter` shadow container, `zIndex` par baseline iso. Sprite pixel scaling : width × `ISO_TILE_W`, height × `ISO_TILE_H` (sprites RTS authored pour 3/4 SE conservent leurs proportions).
6. **Belts + flow + highlights + preview + energy iso** — diamond outline footprint, edge-midpoint iso pour les belts, helper partagé `isoFootprint.footprintDiamond`.
7. **Fog of war iso projection** — canvas couvre l'iso world bbox, chaque tile peint son iso position. Reveal preview = polygone iso de 48 samples.
8. **Atmosphère** — `WorldBackdropRenderer` gradient × vignette renforcés, nouveau `AmbientHazeRenderer` (screen-space vignette + earthlight bleed).
9. **DESIGN.md** decisions log entry, ce doc archivé.

### Hors scope

- Refonte gameplay coords en iso (D-3).
- Animations runtime sprites buildings.
- Refonte HUD/toolbar (D-6).
- Day/night × shadow rotation (D-4).
- Earth disc backdrop (optionnel post-QA).
- Skybox étoilée (AI-slop blacklist).

---

## Plan V1 — Atmospheric top-down (archivé)

Avant la bascule iso, une approche V1 avait été planifiée : conserver le terrain top-down et maquiller le conflit de perspective par lumière + décals + axonométriques.

Ce qui a été livré sur la branche en V1 (commit `b913b55` "checkpoint atmospheric V1 work before iso refactor") :

- `WorldBackdropRenderer` (gradient radial planétaire) — **conservé et étendu en V2**.
- `FogOfWarRenderer` earthlight (3 stops) — **conservé en V2**, projection iso.
- `TerrainDecalRenderer` shadows offset NW — **conservé en V2**.
- `GridRenderer` diagonales axonométriques (decision 2026-05-09 #1) — **supprimé en V2** (redondant avec vrai iso, source du "weird grid feel").

V1 ne pouvait pas résoudre la cause racine : trois projections coexistaient (top-down, axonométrique, sprites SE 3/4). V2 aligne tout sur l'iso 3/4.
