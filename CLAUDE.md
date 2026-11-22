# Whitepod

Jeu de gestion et d'optimisation industrielle sur grille. Le joueur incarne l'architecte d'un systeme automatise vivant : il observe un territoire, organise l'implantation de son infrastructure, anticipe les contraintes de circulation et d'energie, puis affine en continu la structure de son reseau pour transformer un espace brut en machine coherente, stable et evolutive.

## Stack technique

- TypeScript
- React 19
- Zustand (state management)
- PixiJS 8 (rendu 2D)
- Vite 8 (tooling/build)
- Tailwind CSS 4 (UI styling)
- shadcn (composants UI)
- Vitest (tests)
- ESLint (qualite code)
- localStorage (persistance locale durable, restauree apres fermeture du navigateur)

## Documentation de reference

- [`README.md`](./README.md) — setup, commandes npm, reference de l'API moteur (`window.engine`), structure du projet.
- [`PRIMITIVES.md`](./PRIMITIVES.md) — contrat operationnel des primitives de jeu (scenarios, tests de regression, solveurs).
- [`DESIGN.md`](./DESIGN.md) — source de verite du design system "Architect's Drawing Board" (tokens, typographie, espacement, decisions log).
- [`CHANGELOG.md`](./CHANGELOG.md) — historique des versions.
- [`ROADMAP.md`](./ROADMAP.md) — vision et phases jusqu'a la 1.0 (boucle de jeu, campagne, decisions ouvertes).

## Priorites fondamentales

- La performance et la fiabilite passent en premier.
- Le comportement doit rester previsible sous charge et en cas de defaillance (redemarrage de session, reconnexion, flux partiels).
- En cas de compromis, privilegier la correctitude et la robustesse plutot que la commodite a court terme.

## Maintenabilite

- La maintenabilite a long terme est une priorite. Avant d'ajouter une fonctionnalite, verifier s'il existe de la logique partagee pouvant etre extraite dans un module separe.
- La duplication de logique entre plusieurs fichiers est un code smell a eviter.
- Ne pas hesiter a modifier le code existant. Ne pas prendre de raccourcis en ajoutant de la logique locale pour resoudre un probleme.

## Design system

- `DESIGN.md` is the source of truth for all visual and UI decisions (colors, typography, spacing, aesthetic direction "Architect's Drawing Board").
- Toujours lire `DESIGN.md` avant de modifier un composant UI, d'ajouter un ecran, ou de choisir une couleur / police / radius.
- Les tokens de couleur, la typographie et les regles d'espacement y sont definis une fois. Ne jamais deviner, ne jamais dupliquer.
- Flaguer tout code existant ou nouveau qui ne respecte pas `DESIGN.md` (ex: `#ffffff` pur a la place de `#E8E6DF`, chiffres sans `tabular-nums`, ombres portees, radius > 4px, palette orange-rust).
- Ne pas devier de `DESIGN.md` sans approbation explicite du user, consignee dans le tableau "Decisions log" du fichier.

## Git et travail en equipe

- Toujours travailler sur une branche dediee, jamais directement sur `main`.
- Nommer les branches de maniere descriptive : `feat/nom-feature`, `fix/nom-bug`, `refactor/description`.
- Les commits doivent etre atomiques : un commit = un changement logique coherent.
- Messages de commit clairs et concis, en anglais, au present imperatif (ex: `Add grid rendering`, `Fix energy propagation bug`).
- Faire des commits frequents pour faciliter le suivi et les reverts si necessaire.
- Avant d'avancer dans l'implementation ou de considerer une tache terminee, s'assurer que `npm run lint`, `npm run build` et `npm test -- --run` passent localement. Si l'une de ces verifications echoue, corriger avant de continuer.
- Avant de pousser, s'assurer que le code compile, que les tests passent et que le linter est satisfait.
- Utiliser les Pull Requests pour toute integration vers `main`. Decrire le contexte, les changements et comment tester.
- Garder les PR petites et focalisees sur un seul sujet pour faciliter la review.
- Rebaser sur `main` plutot que merger `main` dans la branche, pour garder un historique lineaire et lisible.
- Ne jamais force-push sur une branche partagee sans coordination avec l'equipe.
