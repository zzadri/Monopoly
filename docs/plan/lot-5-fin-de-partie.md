# Lot 5 — Écran de fin de partie et historique

**Dépend de** : lot 2. **Bloque** : le Rejeu du lot 8.

Le CdC §8 demande deux choses : afficher les statistiques aux joueurs à la fin de la partie, et conserver la partie historisée pour les consulter plus tard. Aujourd'hui la fin de partie tient en **une ligne** : « X remporte la partie. »

Les données existent déjà entièrement — `Game.EndedAt`, `Game.WinnerParticipantId`, et le journal complet `GameEvent` numéroté. Il manque la requête et l'écran. C'est le plus petit coût pour le plus gros gain de ce plan.

## 5.1 — Écran de fin

Affiché à tous les joueurs quand la partie passe à `Finished` :

- Le vainqueur.
- Le classement final par **patrimoine** (liquide + prix affiché des propriétés, moitié si hypothéquée, + coût des bâtiments — voir `CONTEXT.md` — Patrimoine). C'est déjà le critère qui départage à la limite de tours.
- L'XP gagné par joueur, en distinguant le bonus de victoire. Rappeler explicitement que la partie ne rapporte rien si elle comptait un Bot de partie.
- Le nombre de faillites infligées par joueur.
- Durée et nombre de tours.

Le compteur de faillites impose de réaliser d'abord la tâche 1.5 du lot 1 (`BankruptciesInflicted` n'est jamais incrémenté). Une seule fonctionnalité répare ainsi deux trous : l'écran de fin et un classement secondaire annoncé dans `CONTEXT.md` mais jamais alimenté.

## 5.2 — Historique des parties terminées

`ListOpenGamesQuery` ne renvoie que les parties en `Lobby` ou `InProgress` : une partie terminée devient inaccessible, alors que tout est en base.

- Requête et endpoint listant les parties terminées d'un joueur.
- Endpoint de détail rejouant le résumé de fin d'une partie passée.
- Route et page front correspondantes.

Concevoir cette requête d'historique en pensant au Rejeu (lot 8) : c'est la même source de données, `GameEvent` ordonné par `Sequence`. `GameSessionService` ne charge aujourd'hui que les 60 derniers événements — le Rejeu aura besoin de tout, paginé, car une partie longue en compte des milliers.

## Vérification du lot

Terminer une partie et vérifier l'écran de fin ; la retrouver ensuite dans l'historique après rechargement complet. Vérifier qu'une partie avec Bot de partie affiche bien zéro XP. `npm test`, `npm run lint`, `dotnet build`.
