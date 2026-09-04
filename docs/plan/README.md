# Plan d'implémentation — index

Ce plan couvre la totalité de l'écart entre le cahier des charges (`docs/cdc/Monopoly.md`, non versionné) et le code. Il est destiné aux agents qui implémenteront les lots. Un agent prend **un lot**, lit ce fichier plus le fichier de son lot, et n'a pas besoin des autres.

## Ordre des lots

Cet ordre est le résultat d'un arbitrage explicite, il ne se réordonne pas librement.

| Lot | Objet | Dépend de |
|---|---|---|
| [1](lot-1-correctifs.md) | Correctifs : options mortes, déconnexion, faille invité | — |
| [2](lot-2-decoupage-front.md) | Découpage de `game.*` + primitives `dialog` / `player-picker` / `board` | — |
| [3](lot-3-plateau-hud.md) | Plateau plein cadre + HUD en gouttières + actions au centre | 2 |
| [4](lot-4-echange.md) | Échange : deux modales, sliders bornés, cartes, contre-offre | 2, 3 |
| [5](lot-5-fin-de-partie.md) | Écran de fin + historique de partie | 2 |
| [6](lot-6-encheres.md) | Enchères + premiers tests back | 2, 3 |
| [7](lot-7-plateaux-custom.md) | Plateaux personnalisés + éditeur + S3 | 2, 6 |
| [8](lot-8-reste-cdc.md) | Succès, titres, rejeu, règles officielles restantes | 5, 6, 7 |

**Pourquoi cet ordre.** Le lot 1 d'abord parce que ce sont des comportements qui mentent à l'utilisateur, pas des manques : une option cochée qui ne fait rien est pire qu'une fonctionnalité absente, l'utilisateur ne peut pas savoir qu'il s'est fait avoir. Le lot 2 avant 3 et 4 parce qu'ajouter des fonctionnalités dans un fichier de 1689 lignes le double. Le lot 6 avant le 7 parce que les enchères valident la primitive `dialog` sous contrainte temps réel avant que l'éditeur de plateau ne l'utilise partout.

## Conventions de travail

- Branche par lot : `feature/lot-N-<slug>`, mergée dans `dev`. Jamais de commit direct sur `main` ni `dev`.
- Front : Angular SSR, BEM strict, thème clair **et** sombre. Tout composant nouveau a un `.spec.ts` Jest.
- Back : clean architecture (`Monopoly.Domain` / `.Application` / `.Infrastructure` / `.Api`), mediator, commentaires XML `///`.
- Le serveur est autoritaire (ADR 0003) : le client n'envoie que des intentions, jamais un résultat.
- Toute action est validée contre la `TurnPhase` courante (ADR 0006).
- Le vocabulaire de `CONTEXT.md` fait foi. Un terme qui manque ou qui devient faux se corrige **dans `CONTEXT.md`**, dans le même commit.

## Attention aux chemins

Les dossiers ont été renommés : `back/` → `backend/`, `front/` → `frontend/`. Toute documentation antérieure citant `back/` ou `front/` désigne les mêmes fichiers.

## Contraintes transverses issues du cadrage

Ces décisions ont été prises en session de cadrage et s'appliquent à plusieurs lots. Elles ne se re-débattent pas en cours d'implémentation.

**Plateau.** Le plateau occupe le maximum de la boîte qui lui reste après deux colonnes de HUD **fixes** ; il ne déborde jamais et ne se pan/zoome pas. Sa taille rendue vaut `min(largeurDispo / colonnes, hauteurDispo / lignes)`. Les actions de tour et les dés vivent **au centre du plateau**, pas dans les gouttières. Le titre « Monopoly » au centre disparaît ; la cagnotte Vacances est déplacée sur la case Vacances.

**Dimensions.** Un plateau va de 5×5 à 20×20, **chaque dimension indépendante** : le rectangulaire (5×12) est autorisé. Le minimum 2×2 du CdC est une erreur de rédaction — un 2×2 n'a que ses 4 angles, donc zéro propriété. Aucun code ne doit plus supposer un plateau carré.

**Échange.** Deux modales : un `player-picker` réutilisable, puis la modale d'échange. Gauche = ce que je donne, droite = ce que je demande. Les deux curseurs d'argent sont bornés aux liquidités réelles de leur camp. Les propriétés sont des cartes ; celles qui ne sont pas échangeables sont **grisées avec la raison affichée**, jamais masquées ni sélectionnables-puis-refusées.

**Enchères.** Modale bloquante pour tous les joueurs. Offre plafonnée aux liquidités. Bien non adjugé remis en circulation libre. Résolution par échéance en base, jamais par ordonnanceur ni par minuteur client (ADR 0008).

**Cible d'écran.** Desktop-first assumé. Le CdC §12.8 exige mobile et tablette : c'est un écart connu et accepté, documenté au lot 8.

**Hors périmètre.** Le CdC ne demande ni chat, ni système d'amis, ni pages de profil. Ne pas les inventer.

## Décisions encore ouvertes

À trancher avec le porteur du projet avant d'implémenter la partie concernée — ne pas décider seul :

1. **Loyer non réclamé** (CdC §3.2) : la règle officielle veut qu'un loyer non réclamé avant le 2ᵉ joueur suivant soit perdu. Le code prélève automatiquement. Garder l'automatisme ou implémenter la réclamation ? (lot 8)
2. **Responsive** (CdC §12.8) : accepter définitivement l'écart desktop-first, ou financer un vrai design mobile ? (lot 8)
3. **Liste des Succès** : le CdC annonce 150 à 200 succès en V1 sans les énumérer. La liste est à écrire. (lot 8)
4. **Partie limitée en durée** (CdC §IV-B) : aujourd'hui la limite est en nombre de tours. Ajouter une limite en temps réel, ou considérer que la limite de tours couvre l'exigence ? (lot 8)
