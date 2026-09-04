# Lot 3 — Plateau plein cadre, HUD en gouttières, actions au centre

**Dépend de** : lot 2. **Bloque** : lots 4, 6.

## Le problème

`game.css` borne le plateau à `width: min(100%, calc(100vh - 6.5rem))` et réserve en permanence une colonne latérale `minmax(18rem, 24rem)`. Le plateau est donc plafonné par la hauteur du viewport et n'exploite jamais la largeur de l'écran. Sur un écran 1080p il fait environ 976 px alors qu'il en a 1500 de disponibles. Un plateau 20×20 y est illisible.

En prime, le panneau latéral empile joueurs, propriétés et échanges dans trois onglets d'une colonne étroite : le formulaire d'échange y est tronqué et son bouton « Fermer » se retrouve au-dessus du formulaire qu'il ferme.

## 3.1 — Boîte de rendu

Deux colonnes de HUD **fixes**, de part et d'autre. Le plateau occupe le maximum de la boîte restante :

```
tailleCase = min(largeurDispo / colonnes, hauteurDispo / lignes)
```

Ce choix est délibérément insensible à la forme du plateau. Un plateau 20×5 devient simplement petit plutôt que de déclencher un second layout de HUD (haut/bas) qu'il faudrait concevoir, tester et maintenir pour des plateaux extrêmes que personne n'a encore créés.

Ne **pas** faire déborder le plateau avec pan/zoom : cela impose de naviguer pour retrouver son propre pion à chaque tour.

- Remplacer `aspect-ratio: 1` (`game.css`) par un ratio dérivé de `colonnes / lignes`.
- Le corps de la page ne défile jamais horizontalement.

## 3.2 — Centre du plateau

Le centre accueille **les dés et les actions de tour** : lancer, acheter, refuser, payer l'amende, utiliser une carte de sortie, terminer le tour. C'est l'endroit que le joueur regarde à chaque tour ; l'y placer supprime l'aller-retour entre le plateau et une colonne latérale.

- Supprimer le titre « Monopoly » du centre.
- Déplacer la cagnotte Vacances **sur la case Vacances**, sa place logique.

Le centre est toujours large : il vaut `(lignes - 2) / lignes` de la hauteur du plateau, soit 60 % sur le plus petit plateau autorisé (5×5) et 90 % sur un 20×20. Aucune bascule vers une barre flottante n'est nécessaire, quelle que soit la taille.

## 3.3 — Gouttières

Affichage permanent : les cartes joueurs (nom, liquidités, couleur de pion, indicateur de tour courant).

## 3.4 — Overlays invocables

Passent en overlay, ouverts à la demande via la primitive `dialog` du lot 2 : le journal de partie, tes propriétés, les échanges. Le journal est le plus gros consommateur d'espace pour la plus faible fréquence de lecture — il n'a rien à faire en permanence à l'écran.

Les onglets « Joueurs / Propriétés / Échanges » de l'ancien panneau latéral disparaissent en tant que tels.

## 3.5 — Écrans étroits

Desktop-first assumé. Sous le point de rupture, dégradation honnête : plateau réduit, HUD replié. Le CdC §12.8 exige mobile et tablette — l'écart est connu, accepté, et documenté au lot 8. Ne pas investir ici dans un design mobile complet sans revenir vers le porteur du projet.

## Vérification du lot

Sur 1080p, le plateau par défaut 11×11 doit être nettement plus grand qu'avant. Tester avec un plateau simulé 20×20 et un 5×5 : le rendu doit rester lisible et centré dans les deux cas. Thème clair et sombre. `npm test`, `npm run lint`, `npm run e2e`.
