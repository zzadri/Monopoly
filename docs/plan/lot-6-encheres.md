# Lot 6 — Enchères, et premiers tests back

**Dépend de** : lots 2 et 3. **Bloque** : lot 7 (valide la primitive `dialog` sous contrainte temps réel), et la tâche 8.5.

Les enchères débloquent trois exigences du CdC d'un coup : §3.1 (refus d'achat), §15 (faillite envers la banque, dont les biens sont revendus aux enchères) et §12 (pénurie de bâtiments, vendus au plus offrant). C'est aussi la fonctionnalité qui teste le plus l'architecture temps réel du projet.

Lire l'ADR 0008 avant de commencer. Il tranche le point difficile.

## 6.1 — Domaine

Une Enchère porte : la propriété concernée, l'offre courante, son auteur, et `AuctionEndsAt`. Voir `CONTEXT.md` — Enchère.

Ajouter une `TurnPhase` dédiée. Le serveur n'accepte une action que si elle correspond à la phase courante (ADR 0006) : c'est ce mécanisme qui garantit la suspension de tous les joueurs pendant l'enchère.

## 6.2 — Déclenchement

`GameEngine.DeclinePendingProperty` contient aujourd'hui `// TODO enchères temps réel` et laisse le bien libre. Il doit désormais ouvrir une enchère **si l'option est active** — l'option `GameOptions.Encheres` existe déjà et n'est lue nulle part. Le lot 1 l'a neutralisée dans l'interface ; ce lot la réactive et la décoche par défaut n'a plus lieu d'être.

## 6.3 — Règles

- Minuteur de 15 s, remis à zéro à chaque nouvelle offre.
- Incrément libre au-dessus de la dernière offre.
- **Tous** les joueurs peuvent enchérir, y compris celui qui a refusé l'achat.
- Offre plafonnée aux **liquidités** de l'enchérisseur : on n'enchérit pas en comptant hypothéquer ensuite. Autoriser au-delà obligerait à gérer un gagnant insolvable déclenché par un minuteur.
- Adjugée au dernier enchérisseur quand le minuteur s'écoule.
- **Aucune offre du tout** : le bien n'est pas adjugé et redevient disponible pour le prochain joueur qui s'y arrête. Ne pas inventer de remise en vente ni de rétention par la banque — ni le CdC ni les règles officielles ne les prévoient.

## 6.4 — Résolution (ADR 0008)

L'échéance est **stockée**, pas attendue. Toute requête touchant ensuite la partie constate l'expiration et adjuge avant de traiter son action.

En complément, `backend/Monopoly.Api/IdleLobbyCleanupService.cs` — qui balaie déjà les parties — adjuge les enchères expirées des parties que plus personne ne consulte. Sans cela, une table abandonnée en pleine enchère laisserait un trou de plusieurs heures au milieu du journal, donc du futur Rejeu.

Ne créer **ni** `BackgroundService` dédié (il réintroduirait l'ordonnanceur que l'ADR 0006 a évité), **ni** minuteur côté client décidant de l'adjudication (l'ADR 0003 interdit au client de décider d'un résultat de jeu).

## 6.5 — Bots enchérisseurs

Sans cela, une partie en solo contre trois bots adjuge systématiquement au joueur humain pour une pièce, et l'option n'a de sens qu'en multijoueur.

Les bots enchérissent jusqu'à un pourcentage du prix affiché indexé sur leur difficulté, en conservant la même réserve de trésorerie que celle déjà utilisée par `BotPlayer`.

## 6.6 — Faillite envers la banque

CdC §15 : les biens remis à la banque lors d'une faillite envers elle sont **immédiatement remis aux enchères**. Aujourd'hui `GameEngine.Bankrupt` les retire simplement. Dépend de tout ce qui précède.

## 6.7 — Interface

Modale **bloquante** (variante prévue au lot 2) : pas de fermeture par `Escape`, pas de clic sur l'arrière-plan. Le jeu est déjà au tour par tour, personne n'a d'autre action légitime en cours ; laisser les autres agir ouvrirait une fenêtre où l'on hypothèque pour financer son enchère pendant que le minuteur tourne, ce qui avantagerait le joueur le plus rapide plutôt que le meilleur.

Afficher : le bien, l'offre courante et son auteur, le temps restant, et le plafond de sa propre offre.

## 6.8 — Premiers tests back

Il n'existe **aucun projet de test côté back** : `backend/Monopoly.slnx` ne contient que 4 projets, et les ~830 lignes de règles de `GameEngine.cs` ne sont pas testées — alors que ce lot y ajoute les enchères.

- Créer `Monopoly.Domain.Tests` (xUnit).
- Couvrir `RentCalculator` et les règles touchées par ce lot. **Pas** de couverture rétroactive des 830 lignes : juste un filet sous ce qui est modifié.
- Corriger l'ADR 0004, qui impose « Jest front et back » — ce qui n'a pas de sens en C#. L'ADR se corrige, il ne se suit pas littéralement.

## Vérification du lot

Enchère à quatre joueurs, dont des bots ; enchère sans aucune offre ; enchère où tous les clients se déconnectent avant l'expiration (le balayage doit adjuger). Vérifier qu'aucun joueur ne peut agir pendant l'enchère. `dotnet test`, `dotnet build`, `npm test`.
