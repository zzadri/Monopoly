# Lot 2 — Découpage de `game.*` et primitives partagées

**Dépend de** : rien. **Bloque** : lots 3, 4, 5, 6, 7.

`frontend/src/app/pages/game/` est un monolithe : `game.html` 407 lignes, `game.ts` 476, `game.css` 782. Les lots suivants y ajouteraient les modales, les overlays, les enchères et l'éditeur de plateau — soit un doublement. Ce lot ne change **aucun comportement visible** : c'est une extraction à iso-fonctionnalité, vérifiable en comparant l'écran avant et après.

Il n'existe aujourd'hui **aucune primitive de modale** dans tout `frontend/src` : ni `dialog`, ni `modal`, ni `overlay`. Tout passe par des panneaux latéraux.

## 2.1 — Primitive `dialog`

La brique la plus importante du lot : les lots 3 à 7 en ont besoin au moins sept fois (échange, sélection de joueur, enchère, décision d'achat, décision de prison, règlement de dette, fiche propriété, éditeur). Une modale ad-hoc répétée sept fois, ce sont sept fois les mêmes bugs de focus.

Exigences : piège de focus, fermeture par `Escape`, fermeture au clic sur l'arrière-plan (désactivable — l'enchère ne doit pas se fermer), blocage du défilement du corps de page, `role="dialog"` et `aria-modal="true"`, restitution du focus à l'élément déclencheur à la fermeture, animation respectant `prefers-reduced-motion`, thème clair et sombre.

Prévoir une variante **bloquante** (sans bouton de fermeture, sans `Escape`) : l'enchère du lot 6 en dépend.

## 2.2 — Composant `player-picker`

Sélecteur de joueur réutilisable, première étape de l'échange. Ses autres usages prévus : choix du créancier, vente d'une carte « Sortez de prison », cible d'une carte personnalisée.

API : liste de joueurs, liste d'exclusions, émission du joueur choisi. Chaque entrée affiche l'avatar, le nom, **et des métadonnées de décision** — liquidités, nombre de propriétés, groupes complets détenus. Choisir une cible d'échange sans voir ses liquidités ni ses groupes revient à choisir à l'aveugle.

## 2.3 — Composant `board` partagé

Le point critique du lot. La logique de placement périmétrique est **dupliquée** dans `game.ts` et `create-game.ts`. L'éditeur de plateau du lot 7 en créerait une troisième copie.

- Extraire un composant unique consommé par la partie **et** par l'éditeur.
- Bonne nouvelle : `perimeterCell(position, rows, columns)` prend déjà les deux dimensions séparément et gère donc déjà les plateaux rectangulaires. Ne pas la réécrire, la déplacer.
- Supprimer les deux copies après extraction.
- Le composant accepte des lignes et colonnes distinctes. Aucune hypothèse de plateau carré.

Attention : la seule vraie hypothèse carrée du projet est côté back, dans `GameSessionService` (`side = (perimeter + 4) / 4`). Elle est traitée au lot 7, pas ici — mais le composant front ne doit pas en dépendre.

## 2.4 — Composants extraits

À sortir de `game.*`, sans changement de rendu : `board-cell`, `player-card`, `dice`, `event-log`, `property-card`, `turn-actions`.

`property-card` doit dès maintenant prévoir : couleur du groupe, prix, état hypothéqué, constructions, et un état **désactivé avec motif** — le lot 4 l'utilisera pour les propriétés non échangeables.

## 2.5 — Tests

Un `.spec.ts` Jest par composant extrait. `frontend/src/app/pages/game/game.spec.ts` fait 24 lignes aujourd'hui : la couverture de cet écran est quasi nulle alors qu'il concentre tout le jeu.

## Vérification du lot

`npm test`, `npm run lint`, `npm run e2e`. Comparaison visuelle avant/après en thème clair **et** sombre : le rendu doit être identique. `game.html` et `game.ts` doivent avoir massivement diminué — si le monolithe reste gros, l'extraction est incomplète et les lots suivants échoueront à leur tour.
