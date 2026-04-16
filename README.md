# Whitepod

Jeu de gestion et d'optimisation industrielle sur grille lunaire. Le joueur incarne l'architecte d'un système automatisé vivant : il observe un territoire, organise l'implantation de son infrastructure, anticipe les contraintes de circulation et d'énergie, puis affine en continu la structure de son réseau pour transformer un espace brut en machine cohérente, stable et évolutive.

## Objectif

Booster l'extraction de ressources brutes (hélium-3, hydrogène, oxygène, régolithe) en une chaîne de production multi-tiers, puis assembler et lancer une fusée.

## Boucle de jeu

1. **Démarrer la simulation** avec `Run simulation`.
2. **Placer des extracteurs** à côté des dépôts pour miner les ressources brutes.
3. **Placer des convoyeurs** pour transférer les produits de `surface` vers `bus`.
4. **Placer des stockages** pour transférer de `bus` vers `stock`.
5. **Dépenser les ressources stockées** pour placer des stations de recette et fabriquer des objets de tier supérieur.
6. **Répéter** tier après tier jusqu'à produire `rocket_ready`.
7. **Stocker `rocket_ready`** et déclencher le lancement avec `Launch rocket`.

La boucle fondamentale est :

`dépôt → extracteur → surface → convoyeur → bus → stockage → stock → recette → nouvelle ressource tier`

## Progression par tiers

Le jeu guide la progression via un guide intégré accessible depuis le bouton `Help`. Pour atteindre le tier suivant :
- Maintenez les ressources du tier actuel en stock.
- Construisez la station de recette correspondante.
- Ajoutez convoyeur et stockage pour la nouvelle ressource produite.
- Répétez jusqu'au composant final de la fusée.

## État actuel

- Phase 4: assets intégrés depuis `output/whitepod-assets` via manifest
- Phase 5: renderer Pixi et HUD en stabilisation visuelle
- Simulation mode: disponible pour démo autonome
- Persistance locale via localStorage
- Sauvegarde automatique toutes les 30 ticks
- Guide de progression par tiers intégré
- Coûts de build réels (placement de stations débite les tokens)

## Stack

- TypeScript
- React 19
- Zustand
- PixiJS 8
- Vite 8
- Tailwind CSS 4
- Vitest
- ESLint

## Scripts utiles

- `npm run dev`
- `npm run build`
- `npm test`
- `npm run assets:build`

## Assets

- Source canonique: `output/whitepod-assets/`
- Assets servis par l'app: `public/assets/raw/`
- Manifest runtime: `public/assets/manifest.json`
- Build: `bash scripts/build-assets.sh`
