# Moteur de jeu entièrement côté serveur, piloté par phases

Toutes les règles (dés, déplacements, loyers, prison, cartes, hypothèques, faillites, échanges) vivent dans `Monopoly.Application/Games/Engine/GameEngine.cs` ; le client n'envoie que des intentions typées et reçoit l'état recalculé. Chaque action est validée contre la `TurnPhase` courante, ce qui rend impossible de jouer hors de son tour ou de sauter une décision — c'est la mise en œuvre concrète de l'ADR 0003 et, de fait, l'anti-triche du projet (§9 du CdC).

Les bots tournent dans le même processus, juste après l'action humaine : leur tour est résolu côté serveur avant que la réponse ne parte, ce qui évite un ordonnanceur séparé et garantit qu'un client ne peut jamais observer un état intermédiaire incohérent.
