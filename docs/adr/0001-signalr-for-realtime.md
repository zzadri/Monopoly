# Utilisation de SignalR pour le temps réel

Le jeu nécessite une synchronisation live entre joueurs (dés, déplacements, achats, échanges) que l'API REST ne peut pas fournir seule. On utilise SignalR plutôt qu'une solution WebSocket brute ou un service tiers (ex: Pusher, Ably) car il s'intègre nativement à l'API C#/.NET 10, avec fallback automatique et gestion de groupes/hubs intégrée. Ce choix crée un couplage fort à l'écosystème .NET côté transport temps réel.
