# Lot 4 — Échange : deux modales, curseurs bornés, cartes

**Dépend de** : lots 2 et 3. **Bloque** : rien.

L'ADR 0007 le rappelle : un playtest de 4 joueurs sur 1100+ tours **n'a jamais pu se terminer** sans échanges, les 8 groupes étant partagés entre plusieurs joueurs. L'échange est le mécanisme qui rend une partie terminable — sa modale est l'écran le plus important du jeu, pas un confort.

Aujourd'hui il vit dans le troisième onglet d'un panneau latéral étroit : deux listes de cases à cocher et un champ numérique, tronqués par le manque de place.

## 4.1 — Étape 1 : sélection du joueur

Réutilise le `player-picker` du lot 2. Le choix de la cible vient **avant** la composition, parce qu'il détermine quelles propriétés sont affichées à droite : l'inverse viderait le formulaire à chaque changement de cible.

Depuis l'étape 2, les avatars des autres joueurs restent cliquables pour changer de cible sans fermer la modale.

## 4.2 — Étape 2 : composition

Deux colonnes symétriques. **Gauche = ce que je donne. Droite = ce que je demande.**

Chaque colonne porte un curseur d'argent borné aux liquidités réelles de son camp : à gauche mes liquidités, à droite celles de la cible. La contrainte vit dans le contrôle, pas dans un message d'erreur après coup — une offre composable est une offre acceptable.

Attention à une asymétrie du back : `GameEngine.ProposeTrade` rejette bien `offeredMoney > proposer.Money`, mais **ne borne pas** `requestedMoney` par les liquidités de la cible ; l'échec ne survient qu'à l'acceptation, chez l'autre joueur, plusieurs dizaines de secondes plus tard. Borner le curseur côté client **et** ajouter la validation côté serveur.

## 4.3 — Propriétés en cartes

Les propriétés sont des `property-card` (lot 2) : couleur du groupe et prix visibles. Une case à cocher textuelle ne peut pas montrer le groupe, qui est pourtant l'information qui décide de l'échange.

`ValidateTradeable` refuse toute propriété appartenant à un groupe où **quelqu'un** a bâti, pas seulement la case bâtie elle-même. Beaucoup de propriétés sont donc non échangeables sans que rien ne l'explique.

Ces cartes sont **grisées avec le motif affiché** (« groupe bâti — revends les constructions d'abord »). Ni masquées — cela ferait croire que la propriété n'existe pas — ni sélectionnables avec erreur à l'envoi, qui est le défaut actuel.

## 4.4 — Cartes « Sortez de prison » échangeables

Exigence du CdC §5 : la carte est vendable à un autre joueur au prix convenu. `TradeOffer` ne porte aujourd'hui que des cases et de l'argent.

Les cartes s'affichent **dans la liste des propriétés** pour économiser la place, avec un style nettement distinct des propriétés.

## 4.5 — Modèle des cartes de prison

Prérequis de 4.4. `GameParticipant.GetOutOfJailCards` est un simple `int`. Aucune identité, aucune origine mémorisée — alors qu'il existe deux cartes distinctes (`ch-09` dans Chance, `cc-16` dans Caisse Commune) et que la règle officielle veut qu'une carte utilisée retourne **sous son propre paquet**. Aujourd'hui `UseJailCard` décrémente un compteur : la carte disparaît définitivement de la partie.

- Modéliser des cartes identifiées portant leur paquet d'origine.
- `UseJailCard` remet la carte sous son paquet.
- Migration depuis le compteur existant.
- Voir `CONTEXT.md` — Carte « Sortez de prison ».

Corriger ce modèle maintenant coûte une colonne ; plus tard, une migration sur des parties en cours.

## 4.6 — Contre-offre

« Contre-proposer » ferme l'offre reçue et rouvre la modale d'échange pré-remplie, rôles inversés. Aucune entité nouvelle, aucun chaînage d'offres : une contre-offre **remplace** la précédente, elle ne s'y ajoute pas (`CONTEXT.md` — Échange).

## 4.7 — Intérêt sur hypothèque acquise en échange

Exigence du CdC §14, aujourd'hui absente : `RespondToTrade` transfère la propriété sans aucun intérêt. Le nouveau propriétaire d'un bien hypothéqué doit **10 % d'intérêt à la banque au moment de l'acquisition**, puis 10 % supplémentaires s'il lève l'hypothèque plus tard.

## Vérification du lot

Échange complet entre deux joueurs humains, puis avec un bot. Vérifier qu'une propriété d'un groupe bâti apparaît grisée avec son motif, qu'un curseur ne peut pas dépasser les liquidités du camp, qu'une carte de prison change bien de main, et qu'une contre-offre annule l'offre initiale. `npm test`, `npm run lint`, `dotnet build`.
