# Monopoly

Plateforme de Monopoly multijoueur en ligne, avec plateaux personnalisables, progression du joueur et classements.

## Language

**XP (Expérience)**:
Points gagnés par un joueur à la fin d'une partie non-bot. Un bonus d'XP est accordé en cas de victoire. Détermine le Niveau du joueur.
_Avoid_: Points, score (ambigu avec le patrimoine en jeu)

**Niveau**:
Palier de progression du joueur dérivé de son XP cumulé. Conditionne certains déblocages (ex: création de plateaux personnalisés).

**Échange (Trade)**:
Transaction structurée entre deux joueurs, initiée par l'un et acceptée ou refusée par l'autre, portant sur une ou plusieurs Propriétés, de l'argent, et/ou des Cartes "Sortez de prison". Chaque camp est plafonné à ses liquidités : on ne peut ni offrir plus d'argent qu'on n'en possède, ni en demander plus que la cible n'en possède.
Une **Contre-offre** est une nouvelle proposition, de rôles inversés, qui refuse et remplace la précédente. Il n'existe jamais qu'une offre vivante à la fois entre deux joueurs.
_Avoid_: Prêt (interdit par les règles - l'Échange est une vente/troc immédiat, pas un prêt)
_Avoid_: Contre-offre comprise comme une négociation en fil - chaque Contre-offre clôt l'offre précédente, elle ne s'y ajoute pas.

**Bot**:
Faux joueur contrôlé par le serveur. Deux cas distincts :
- **Bot de partie** : ajouté volontairement par les joueurs à la création de la partie. Sa présence exclut la partie de l'XP et des Classements.
- **Bot de repli** : prend automatiquement le contrôle d'un Joueur déconnecté (ou ayant rage quit) en cours de partie ; le Joueur reprend le contrôle s'il se reconnecte. Sa présence ne pénalise pas les autres joueurs : la partie reste comptée normalement pour l'XP.
_Avoid_: "partie avec bot" sans préciser lequel des deux cas - les règles de comptage diffèrent.

**Enchère (Auction)**:
Vente au plus offrant d'une Propriété refusée à l'achat par le joueur qui est tombé dessus, si l'option correspondante est activée dans les paramètres de la partie. Fonctionne à l'anglaise : minuteur de 15s remis à zéro à chaque nouvelle offre, incrément libre au-dessus de la dernière offre, tous les joueurs (y compris celui qui a refusé l'achat) peuvent enchérir, adjugée au dernier enchérisseur quand le minuteur s'écoule sans nouvelle offre.
Une offre est plafonnée aux liquidités de l'enchérisseur : on n'enchérit pas en comptant hypothéquer ensuite. Tant qu'une Enchère court, aucun joueur ne peut agir sur la partie - elle suspend tout le monde, pas seulement le joueur dont c'est le tour. Si le minuteur s'écoule sans la moindre offre, la Propriété n'est pas adjugée et redevient simplement disponible pour le prochain Joueur qui s'y arrête.

**Carte "Sortez de prison"**:
Carte identifiée, et non un compteur : il en existe exactement deux dans une Partie, l'une dans le paquet Chance, l'autre dans le paquet Caisse Commune. Conservée par le Joueur qui la tire jusqu'à usage, elle retourne **sous son propre paquet d'origine** une fois utilisée - une Partie longue ne peut donc pas les épuiser. Échangeable comme une Propriété (voir Échange).
_Avoid_: la traiter comme une quantité interchangeable - l'origine de chaque carte détermine le paquet auquel elle revient.

**Plateau personnalisé (Custom board)**:
Plateau créé par un Joueur ayant atteint le Niveau 25. Taille de 5x5 à 20x20, **chaque dimension indépendante** : les plateaux rectangulaires (ex. 5x12) sont autorisés. Le CdC mentionne un minimum de 2x2 ; c'est une erreur de rédaction, un plateau 2x2 se réduisant à ses 4 cases d'angle et ne comportant donc aucune Propriété. Le minimum réel est 5x5, soit 12 Propriétés. Les 4 cases d'angle gardent toujours leur rôle fixe (Départ, Prison/Visite, Allez en prison, Vacances). Chaque groupe de Propriétés compte au moins 2 Propriétés, sans maximum imposé de groupes ni de Propriétés par groupe. Contient 3 types de case possibles : Terrain (groupe de couleur, loyer par maison/hôtel), Gare et Compagnie (voir formules dédiées). Le créateur fixe le prix de base de chaque case ; les loyers dérivés sont calculés automatiquement (ajustables manuellement s'il le souhaite).
Privé par défaut ; le créateur peut le rendre public (réversible). Un plateau public est utilisable par n'importe quel Joueur, pas seulement son créateur (bibliothèque commune), et peut être noté (1 à 5, une note par Joueur, éditable/supprimable par son auteur) et commenté (le créateur peut masquer un commentaire sur son propre plateau, pas le supprimer).
Chaque mise à jour du créateur crée une nouvelle version ; une Partie fige la version du plateau utilisée au moment où elle démarre - une mise à jour ultérieure ne s'applique jamais rétroactivement.

**Gare**:
Case spéciale sans maison ni hôtel. Loyer généralisé : `loyer(n) = 25 × 2^(n-1)` où `n` = nombre de Gares possédées par le même Joueur (base 25 ajustable par le créateur, formule fixe).

**Compagnie**:
Case spéciale sans maison ni hôtel, nommée librement comme une Propriété classique. Loyer généralisé : résultat des dés × `(4 + 6×(n-1))` où `n` = nombre de Compagnies possédées par le même Joueur.

**Rejeu (Replay)**:
Consultation a posteriori d'une partie Historisée, coup par coup (chaque lancer de dé, chaque transaction) avec navigation avant/arrière et contrôle de vitesse - équivalent d'un replay d'échecs en ligne.

**Classement (Leaderboard)**:
Il existe un classement principal (Niveau total du joueur) et des classements secondaires : nombre de parties gagnées, nombre de parties jouées, plus gros patrimoine atteint en une partie, nombre de faillites infligées à d'autres joueurs.

**Titre**:
Distinction attribuée à un joueur selon sa position dans un Classement donné. Un joueur peut cumuler un Titre par Classement où il est éligible (ex: être #1 au Niveau ET dans le top 3 des Victoires en même temps). Les positions 4 à 50 d'un même Classement partagent un Titre commun "Top 50" propre à ce Classement (donc distinct entre "Top 50 Niveau" et "Top 50 Victoires", etc.). Le Titre est perdu dès qu'un autre joueur prend sa place dans le Classement.
_Avoid_: Succès (un Succès peut donner un Titre en récompense, mais ce sont deux concepts différents)

**Succès (Achievement)**:
Objectif à débloquer, distinct du Titre (jamais basé sur la détention d'un Titre). Un succès basé sur "% du plateau" se calcule sur le nombre de cases-propriétés actuellement possédées par le joueur, hypothéquées exclues. Certains Succès (définis au cas par cas, pas de règle générique) accordent un Titre permanent en récompense.

**Phase de tour (TurnPhase)**:
Où en est le tour courant côté serveur : `AwaitingRoll`, `AwaitingPurchaseDecision`, `AwaitingJailDecision`, `AwaitingEndTurn`, `AwaitingDebtSettlement`. Le serveur n'accepte une action que si elle correspond à la phase en cours — c'est le point d'application concret de l'état autoritaire.

**Dette en attente**:
Somme qu'un joueur doit régler mais ne peut pas payer immédiatement. La partie se bloque sur sa phase `AwaitingDebtSettlement` : il doit vendre ses constructions, hypothéquer, ou déclarer faillite. Une faillite transfère tout au créancier (ou remet les biens à la banque si la dette était envers elle).

**Journal de partie (GameEvent)**:
Suite ordonnée et numérotée de tout ce qui s'est produit dans une partie. Sert de log en direct, d'historique, et de base au futur Rejeu. Seuls les derniers événements sont rechargés à chaque action — une partie longue en compte des milliers.

**Patrimoine (Net worth)**:
Liquide + prix affiché des propriétés (moitié si hypothéquée) + coût des bâtiments. Départage les joueurs quand une partie s'arrête à la limite de tours, et alimente le classement secondaire correspondant.
