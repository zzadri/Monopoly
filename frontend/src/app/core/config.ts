/**
 * Dev-only hardcoded config, matches docker-compose.yml defaults.
 * TODO: swap for real per-environment config before deploying beyond local dev.
 */
export const APP_CONFIG = {
  apiBaseUrl: 'http://localhost:8080',
  keycloak: {
    url: 'http://localhost:8081',
    realm: 'monopoly',
    clientId: 'monopoly-front',
  },
} as const;
