# Lot 7 — Plateaux personnalisés

**Dépend de** : lots 2 et 6. **Bloque** : rien.

Le CdC §4 en entier. C'est le plus gros manque du projet — et **le plus prêt à combler** : le modèle de données est complet et versionné (`Board`, `BoardVersion`, `PropertyGroup`, `BoardSpace` avec `RentOverrides`, migrations appliquées, `Game.BoardVersionId` figé au démarrage). Il n'existe pourtant **aucune ligne de code permettant d'en créer un** : `BoardsEndpoints.cs` n'expose que `GET /boards/default`.

## 7.1 — Dimensions explicites

`BoardVersion` (dans `backend/Monopoly.Domain/Entities/Board.cs`) n'a **ni `Rows` ni `Columns`** : les dimensions sont aujourd'hui *déduites* du nombre de cases, ce qui n'est possible que si le plateau est carré.

- Ajouter `Rows` et `Columns`.
- Migration qui **recalcule** les valeurs depuis le nombre de cases des plateaux existants. Ne pas mettre une valeur par défaut à 11 : elle serait fausse pour tout plateau non 11×11 et le piège ne se déclencherait que plus tard.

## 7.2 — Tuer l'hypothèse carrée

`GameSessionService` contient `var side = (perimeter + 4) / 4;` avec le commentaire `// rows == columns pour un plateau carré`. C'est la seule vraie hypothèse carrée du back. Elle est remplacée par une lecture de `Rows` et `Columns`.

Côté front, `perimeterCell(position, rows, columns)` gère déjà les rectangles — le lot 2 l'a déplacée dans le composant `board` partagé, rien à refaire ici.

## 7.3 — Contraintes de plateau

- De **5×5 à 20×20, chaque dimension indépendante**. Le rectangulaire (5×12) est autorisé, sans contrainte de ratio.
- Le minimum 2×2 du CdC est une erreur de rédaction : un 2×2 se réduit à ses 4 angles et n'a aucune propriété. Voir `CONTEXT.md` — Plateau personnalisé.
- Les 4 cases d'angle gardent toujours leur rôle fixe : Départ, Prison/Visite, Allez en prison, Vacances.
- Chaque groupe compte **au moins 2 propriétés**, sans maximum de groupes ni de propriétés par groupe. Aucune autre contrainte : un groupe peut s'étaler sur un angle, comme dans le Monopoly officiel.

## 7.4 — Déblocage au Niveau 25

`Player.Level` existe et n'est lu par personne. La création de plateau est réservée aux joueurs de Niveau 25 ou plus, et interdite aux invités.

## 7.5 — API et versioning

Commandes, handlers et endpoints de création, modification, suppression, publication. Chaque mise à jour du créateur crée une **nouvelle version** ; une partie fige la version utilisée au démarrage et une mise à jour ultérieure ne s'applique jamais rétroactivement. Ce comportement est déjà porté par le modèle — ne pas le contourner.

## 7.6 — Éditeur front

Consomme le composant `board` du lot 2 et la primitive `dialog`. Permet de : dimensionner la grille, poser les types de case (Terrain, Gare, Compagnie), définir les groupes et leur couleur, nommer chaque case, fixer son prix de base.

Les loyers dérivés sont **calculés automatiquement** à partir du prix, et ajustables manuellement via `BoardSpace.RentOverrides` — le champ existe déjà. Les formules de `RentCalculator` sont en place : loyer de terrain, gare `25 × 2^(n-1)`, compagnie `dés × (4 + 6×(n-1))`. La base 25 des gares est ajustable par le créateur, la formule non.

## 7.7 — Images et stockage S3

Le conteneur Garage tourne, il a sa configuration et son README de bootstrap — mais il n'existe **aucun SDK S3 dans le back et aucun upload**. Le seul champ image (`BoardSpace.ImageUrl`) n'est ni écrit ni lu. C'est l'exigence CdC §1 sur les images publiées par les utilisateurs.

Intégrer le SDK, l'upload, et l'affichage de l'image sur la case. Valider type et taille des fichiers reçus.

## 7.8 — Bibliothèque publique

Privé par défaut ; le créateur peut rendre public, et revenir en arrière. Un plateau public est utilisable par n'importe quel joueur, pas seulement son créateur.

Notes de 1 à 5, une par joueur, éditable et supprimable par son auteur. Commentaires : le créateur peut **masquer** un commentaire sur son propre plateau, pas le supprimer.

Aucune de ces entités n'existe — ni note, ni commentaire, ni `DbSet` correspondant.

## 7.9 — Choisir un plateau à la création de partie

CdC : « changer la map par une map custom ». `CreateGameCommand.BoardVersionId` accepte déjà une version, mais le front n'expose que `/boards/default`. Ajouter la sélection dans l'écran de création, avec la bibliothèque publique et ses notes.

## 7.10 — Cartes personnalisées

CdC §4 et §7 : le créateur choisit entre cartes de base, cartes personnalisées, ou un mélange, et les cartes sont **propres au plateau**. Les paquets sont aujourd'hui des constantes statiques (`DefaultCardDecks.cs`) et il n'existe aucune entité `Card` en base.

Le CdC cite des effets absents de `CardEffect`, notamment « {joueur1} vole X € à {joueur2} » et le vol de propriété. Ils impliquent un ciblage de joueur : réutiliser le `player-picker` du lot 2.

Cette tâche est la plus lourde du lot. Elle peut être livrée séparément si le lot devient trop gros.

## Vérification du lot

Créer un plateau 5×5, un 20×20 et un rectangulaire 5×12, puis jouer une partie complète sur chacun. Vérifier qu'une mise à jour du plateau ne modifie pas une partie déjà démarrée. Vérifier qu'un joueur sous le Niveau 25 et qu'un invité ne peuvent pas créer de plateau. `dotnet test`, `npm test`, `npm run lint`.
