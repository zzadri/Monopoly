-- Ne s'exécute qu'à la toute première initialisation du volume Postgres.
-- Keycloak a sa propre base, séparée de celle de l'app (monopoly).
CREATE DATABASE keycloak;
