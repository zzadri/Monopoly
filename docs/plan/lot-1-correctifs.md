# Lot 1 — Correctifs : options mortes, déconnexion, faille invité

**Dépend de** : rien. **Bloque** : rien, mais passe en premier.

Ce lot ne crée aucune fonctionnalité. Il supprime des comportements qui trompent l'utilisateur ou cassent une partie. Chaque tâche est indépendante et peut faire son propre commit.

## 1.1 — Supprimer l'option « Hypothèque » (`HypothequeSansLoyer`)

L'option est câblée de bout en bout — base, domaine, DTO, case à cocher — et **le moteur ne lit jamais le champ**. Pire, la règle qu'elle prétend activer (« pas de loyer sur un terrain hypothéqué ») est déjà appliquée sans condition dans `GameEngine.cs` (branche qui annule le loyer quand `ownership.IsMortgaged`). L'option ne pourrait donc qu'activer une chose toujours active.

- Retirer `HypothequeSansLoyer` de `backend/Monopoly.Domain/Entities/GameOptions.cs`.
- Retirer le champ des DTO et de `CreateGameCommand`.
- Retirer la case à cocher de `frontend/src/app/pages/create-game/create-game.html` et la propriété correspondante dans `create-game.ts`.
- Migration EF de suppression de colonne.

**Fait quand** : `grep -ri "HypothequeSansLoyer" backend/ frontend/` ne renvoie rien, et la création de partie fonctionne toujours.

## 1.2 — Neutraliser l'option « Enchères » jusqu'au lot 6

`GameOptions.Encheres` existe partout et est **cochée par défaut** (`create-game.ts`), mais `GameEngine.DeclinePendingProperty` contient `// TODO enchères temps réel` et laisse simplement le bien libre. Un joueur croit activer les enchères et ne l'apprend jamais.

Ne **pas** supprimer le champ : le lot 6 l'utilisera.

- Passer la valeur par défaut à `false` dans `create-game.ts`.
- Désactiver la case (`disabled`) et l'accompagner d'une mention explicite du type « bientôt disponible ».

**Fait quand** : il est impossible de créer une partie qui prétend avoir les enchères actives.

## 1.3 — Bascule en Bot de repli à la déconnexion

Le `ParticipantKind.BotDeRepli` existe, `BotPlayer` sait jouer un siège repris, et `JoinGame` sait rendre le siège au joueur qui revient. Mais `backend/Monopoly.Api/Hubs/GameHub.cs` **n'implémente pas `OnDisconnectedAsync`** et `IsConnected` n'est jamais mis à `false`. Conséquence actuelle : quand un joueur ferme son onglet, la partie reste bloquée indéfiniment sur sa phase. **C'est le bug le plus grave du projet** — il tue la partie de tous les autres.

- Implémenter `OnDisconnectedAsync` : retrouver le participant depuis la connexion, `IsConnected = false`, basculer en `BotDeRepli`.
- Bascule **immédiate**, sans délai de grâce : un délai fige la table pour tout le monde à chaque rafraîchissement de page. Le coût d'une bascule inutile est d'un tour joué par un bot ; le coût d'une partie figée est total.
- Vérifier que la reprise du siège à la reconnexion fonctionne (chemin déjà présent dans `JoinGame`).
- La partie reste comptée pour l'XP : un Bot de repli ne pénalise personne (`CONTEXT.md` — Bot).

**Fait quand** : un joueur ferme son onglet en cours de partie, le bot joue son tour, le joueur revient et récupère son siège.

## 1.4 — `guestSecret` hors de l'URL

`GET /games/{id}/state?guestSecret=...` fait transiter un jeton de siège en query string. Tout proxy, tout journal d'accès serveur, tout historique de navigateur le conserve — il suffit de le lire pour prendre le contrôle d'un siège invité. C'est la seule brèche d'un back par ailleurs strictement autoritaire.

- Passer le jeton en en-tête `X-Guest-Secret` dans `backend/Monopoly.Api/Endpoints/GamesEndpoints.cs`.
- Adapter `frontend/src/app/core/game-play.service.ts`.
- Vérifier qu'aucune autre route ne prend le jeton en query.

**Fait quand** : plus aucun `guestSecret` n'apparaît dans une URL, et une partie en invité fonctionne toujours après rechargement.

## 1.5 — Réanimer `BankruptciesInflicted`

Le champ existe sur `Player`, il a sa migration, et `CONTEXT.md` en fait un classement secondaire officiel. **Il n'est jamais incrémenté** et le classement n'est pas exposé.

- Incrémenter dans `GameEngine.Bankrupt`, uniquement quand la faillite a un créancier joueur (une faillite envers la banque n'est infligée par personne).
- N'incrémenter que si la partie compte pour les classements (`Game.CountsForXpAndClassements`).
- Exposer le classement `faillites` dans `backend/Monopoly.Application/Leaderboards/GetLeaderboard.cs`.
- Ajouter l'onglet dans `frontend/src/app/pages/leaderboard/`.

**Fait quand** : une faillite infligée à un joueur incrémente son compteur, et le classement s'affiche.

## Vérification du lot

`dotnet build` côté back, `npm test` et `npm run lint` côté front. Une partie complète jouée de bout en bout, incluant une déconnexion volontaire en cours de route.
