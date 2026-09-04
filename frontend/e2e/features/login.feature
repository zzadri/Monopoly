# language: fr
Fonctionnalité: Connexion Keycloak
  Scénario: Cliquer sur Se connecter redirige vers Keycloak
    Etant donné que je visite la page d'accueil
    Quand je clique sur "Se connecter"
    Alors je suis redirigé vers le realm Keycloak "monopoly"
