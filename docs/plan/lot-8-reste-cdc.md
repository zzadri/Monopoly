# Lot 8 — Reste du cahier des charges

**Dépend de** : lots 5, 6, 7. **Bloque** : rien.

Tout ce que les lots 1 à 7 ne couvrent pas. Les tâches sont largement indépendantes : elles peuvent être prises séparément et livrées dans n'importe quel ordre, sauf mention contraire.

## Fonctionnalités entièrement absentes

### 8.1 — Succès (CdC §5)

Rien n'existe : ni entité, ni `DbSet`, ni endpoint, ni route front. Le CdC annonce **150 à 200 succès en V1** sans les énumérer — la liste reste à écrire avec le porteur du projet (décision ouverte).

Règles connues : un Succès est distinct d'un Titre et n'est jamais fondé sur la détention d'un Titre. Un succès basé sur un « % du plateau » se calcule sur le nombre de cases-propriétés **actuellement possédées**, hypothéquées exclues. Certains Succès accordent un Titre **permanent** en récompense, définis au cas par cas — il n'y a pas de règle générique. Voir `CONTEXT.md` — Succès.

Prévoir une page dédiée.

### 8.2 — Titres (CdC §3)

Rien n'existe : le mot n'apparaît que dans `CONTEXT.md`.

Un Titre est attribué selon la position dans un Classement donné. Un joueur cumule **un Titre par Classement** où il est éligible — être #1 au Niveau et top 3 des Victoires donne deux Titres. Les positions 4 à 50 d'un même Classement partagent un Titre commun « Top 50 » **propre à ce Classement** : « Top 50 Niveau » et « Top 50 Victoires » sont distincts. Le Titre est **perdu** dès qu'un autre joueur prend la place. Voir `CONTEXT.md` — Titre.

Attention : les Titres permanents accordés par certains Succès (8.1) échappent à cette perte.

### 8.3 — Rejeu (CdC §8)

Dépend du lot 5, qui pose la requête d'historique.

Consultation coup par coup d'une partie terminée — chaque lancer de dé, chaque transaction — avec navigation avant/arrière et contrôle de vitesse, à la manière d'un replay d'échecs en ligne.

Les fondations existent : `GameEvent` est numéroté par `Sequence`, et `Game.BoardVersionId` fige la version du plateau, donc le plateau rejoué est bien celui de l'époque. Mais `GameSessionService` ne charge que les 60 derniers événements : une partie longue en compte des milliers, la lecture doit être paginée.

L'ADR 0008 signale un point à respecter : l'heure d'adjudication d'une enchère inscrite au journal est celle de la requête qui l'a constatée, pas celle de l'expiration théorique. Le Rejeu doit s'appuyer sur `AuctionEndsAt` pour restituer la chronologie perçue par les joueurs.

### 8.4 — Pénurie de bâtiments (CdC §12)

Aucun inventaire de bâtiments n'existe, pas même un champ : la construction est illimitée. Le CdC impose un stock de **32 maisons et 12 hôtels**, et une vente au plus offrant en cas de pénurie — donc une enchère, d'où la dépendance au lot 6.

Avec les enchères, c'est le second mécanisme de rareté du jeu original ; sans les deux, la partie perd sa tension économique.

### 8.5 — Mon rang hors du top 50 (CdC §3)

Le classement affiche un podium et le top 50. Si le joueur qui consulte n'y figure pas, il doit apparaître **plus bas avec son rang réel**. `GetLeaderboardQuery` et `LeaderboardDto` n'ont aujourd'hui aucune notion de « moi ».

## Règles officielles incomplètes

### 8.6 — Ordre de départ déterminé aux dés (CdC §2)

`GameEngine.Start()` prend simplement le participant de `SeatOrder` 0. Le CdC veut que chacun lance les dés et que le plus haut total commence. À articuler avec l'option « mélanger l'ordre des joueurs », déjà implémentée.

### 8.7 — Impôt sur le revenu (CdC §5)

Le CdC laisse le choix entre **10 % du capital total** et un montant fixe de 200. Le code applique un montant fixe selon le nom de la case, sans calcul ni choix. Le choix implique une décision du joueur, donc une `TurnPhase` dédiée ou une extension de la phase existante.

### 8.8 — Hôtel : quatre maisons sur tout le groupe (CdC §11)

La cinquième construction transforme en hôtel et remet le compteur de maisons à zéro, mais **rien ne vérifie que tous les terrains du groupe portent 4 maisons** lorsque l'option « construction équilibrée » est désactivée.

### 8.9 — Revente uniforme des maisons (CdC §13)

`SellBuilding` rembourse bien la moitié du prix, mais **ne contrôle pas l'uniformité de la vente**, que le CdC exige explicitement — la revente doit se faire uniformément et en ordre inverse de la construction.

### 8.10 — Partie abrégée (CdC §IV-A)

Aucune option de ce type. Le CdC décrit : fin à la deuxième faillite, deux titres de propriété distribués à chaque joueur au départ, et un hôtel obtenu à **trois** maisons au lieu de quatre. `Start()` ne distribue rien aujourd'hui.

### 8.11 — Fin de partie au temps écoulé (CdC §IV-B)

Implémenté en **nombre de tours** (`GameOptions.TurnLimit`), pas en durée. Le CdC parle d'un temps convenu à l'avance ; il demande aussi la distribution de deux titres au départ, comme la partie abrégée. **Décision ouverte** : ajouter une vraie limite en temps, ou considérer que la limite de tours couvre l'exigence.

### 8.12 — Aléa des cartes (CdC §7)

Deux valeurs sont figées alors que le CdC les veut variables : le dividende, décrit comme « entre 50 et 500, prix rond », vaut 200 en dur ; et « reculez de {1 à 6} cases » recule toujours de 3.

### 8.13 — Configuration des bots (CdC §6)

Le back accepte déjà un nombre de bots libre (`CreateGameCommand.BotCount`), mais le front n'expose qu'une case à cocher qui **remplit toutes les places libres**, avec une difficulté unique pour tous. Le CdC demande le choix dans les paramètres au début de la partie : exposer le nombre, et la difficulté par bot.

### 8.14 — Loyer non réclamé (CdC §3.2) — décision ouverte

La règle officielle veut qu'un loyer non réclamé avant que le deuxième joueur suivant ait lancé les dés soit perdu. Le code le prélève automatiquement, sans notion de réclamation. **Ne pas trancher seul** : demander au porteur du projet si l'automatisme est assumé.

## Qualité, conformité, mise en production

### 8.15 — Responsive (CdC §12.8) — décision ouverte

Le CdC exige « tout le projet responsive (mobile, PC, tablette) ». Le projet est desktop-first assumé, avec seulement quatre points de rupture dans tout le front, et un plateau N×N difficile en portrait. **L'écart est connu et accepté** ; il est ici pour être visible, pas pour être comblé en silence. Trancher avec le porteur du projet avant d'investir.

### 8.16 — Mode spectateur (CdC)

Partiel : un bouton « Observer » existe et l'état est lisible sans siège. Manquent le masquage des informations privées et la liste des spectateurs.

### 8.17 — Corriger l'ADR 0004

L'ADR impose « Jest unitaire front **et back** », ce qui n'a pas de sens en C#. Le lot 6 crée `Monopoly.Domain.Tests` en xUnit ; l'ADR doit refléter ce choix. De même, le CdC demande « KDoc » pour les commentaires du back — KDoc est un format Kotlin ; le projet utilise les commentaires XML `///` de C#, qui sont l'équivalent correct. Documenter cet écart plutôt que le laisser passer pour un oubli.

### 8.18 — Préparation à la mise en production

- `frontend/angular.json` → `security.allowedHosts` ne contient que `localhost` et `front`. Sans le vrai nom de domaine, le serveur SSR rejettera toutes les requêtes (protection SSRF native d'Angular).
- `frontend/src/app/core/config.ts` : URLs d'API et de Keycloak codées en dur pour le développement local.
- Vérifier que Swagger reste bien désactivé hors développement (déjà en place).

## Vérification du lot

Chaque tâche a son propre critère. Globalement : `dotnet test`, `dotnet build`, `npm test`, `npm run lint`, `npm run e2e`, et une relecture du CdC section par section pour confirmer qu'aucune exigence ne reste sans réponse — soit implémentée, soit explicitement documentée comme écart accepté.
