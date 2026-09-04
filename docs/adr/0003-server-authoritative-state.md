# État de jeu serveur-autoritaire

Le client n'envoie que des intentions (ex: "je lance les dés", "j'achète X") ; le serveur calcule seul tout résultat (dés, argent, propriétés) et le diffuse via SignalR. Choisi comme mécanisme anti-cheat principal plutôt qu'une détection a posteriori de valeurs falsifiées côté client, car aucune valeur de jeu sensible ne transite jamais depuis le client. Implique que toute la logique de règles doit vivre côté API, le front n'étant qu'un rendu de l'état reçu.
