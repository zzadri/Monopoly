# Monopoly

Plateforme Monopoly multijoueur en ligne : parties en temps réel, bots, échanges, classements.
Voir [`docs/cdc/Monopoly.md`](docs/cdc/Monopoly.md) pour le cahier des charges, [`CONTEXT.md`](CONTEXT.md) pour le glossaire du domaine et [`docs/adr/`](docs/adr) pour les décisions d'architecture.

## Structure

- `front/` — Angular SSR (BEM, thème clair/sombre), rien en commun avec `back/`
- `back/` — API .NET 10, clean architecture (`Monopoly.Domain` / `.Application` / `.Infrastructure` / `.Api`)
- `docker/` — configuration Postgres (init), Keycloak (import de realm) et Garage (S3)
- `docs/adr/` — décisions d'architecture

## Démarrage

```sh
cp .env.example .env   # ajuster les mots de passe si besoin
docker compose up --build
```

- Front : http://localhost:4200
- API : http://localhost:8080 (Swagger sur `/swagger` en dev uniquement)
- Keycloak : http://localhost:8081 (admin / mot de passe de `.env`)

Bootstrap Garage (une seule fois) : voir [`docker/garage/README.md`](docker/garage/README.md).

## Jouer

1. Se connecter (ou créer un compte via Keycloak).
2. **Salons → Ouvrir un salon** : régler joueurs, argent de départ, règles, bots et limite de tours.
3. Partager le lien de la partie, ou ajouter des bots pour jouer seul immédiatement.
4. **Démarrer la partie**, puis lancer les dés à son tour.

Un invité (sans compte) peut rejoindre un salon depuis son lien et jouer normalement ; il ne peut simplement pas ouvrir de salon ni gagner d'XP.

### Ce qui est jouable

Dés et doublets, déplacements, achats, loyers (terrains, gares, compagnies avec leurs formules propres), maisons et hôtels avec construction équilibrée, hypothèques, cartes Chance et Caisse Commune, prison, taxes, cagnotte Vacances, dettes et faillites, échanges entre joueurs, bots à 5 niveaux de difficulté, fin de partie (dernier debout ou limite de tours), XP et classements.

## Développement local (sans Docker)

```sh
# back
cd back && dotnet watch --project Monopoly.Api

# front (Node >= 24.15, voir front/.nvmrc)
cd front && npm start
```

Tests : `npm test` (Jest) et `npm run e2e` (Cucumber + Playwright, nécessite `npm start` à côté) et `npm run lint` côté front ; `dotnet build` côté back.

## À faire avant mise en prod

- `front/angular.json` → `security.allowedHosts` ne contient que `localhost`/`front` : ajouter le vrai nom de domaine, sinon le serveur SSR rejette toutes les requêtes (protection SSRF native Angular).
- `front/src/app/core/config.ts` : URLs d'API et Keycloak codées en dur pour le dev local.
- Enchères, plateaux personnalisés, succès, titres et rejeu de partie restent à implémenter (voir CdC).
