import { EnvironmentProviders, Provider, signal } from '@angular/core';
import Keycloak from 'keycloak-js';
import {
  createInterceptorCondition,
  IncludeBearerTokenCondition,
  INCLUDE_BEARER_TOKEN_INTERCEPTOR_CONFIG,
  KEYCLOAK_EVENT_SIGNAL,
  provideKeycloak,
} from 'keycloak-angular';
import { APP_CONFIG } from './config';

const bearerTokenCondition = createInterceptorCondition<IncludeBearerTokenCondition>({
  urlPattern: new RegExp(`^${APP_CONFIG.apiBaseUrl}(/.*)?$`, 'i'),
  bearerPrefix: 'Bearer',
});

/**
 * Real Keycloak wiring — browser bootstrap only (main.ts). keycloak-js
 * touches `window` at construction time, so this must never be evaluated
 * server-side (see app.config.server.ts for the SSR stub instead).
 */
export function provideKeycloakAuth(): (Provider | EnvironmentProviders)[] {
  return [
    provideKeycloak({
      config: APP_CONFIG.keycloak,
      initOptions: {
        // On ne force jamais la connexion : jouer en invité est un choix
        // légitime (Monopoly.md §1.2), pas une erreur à rediriger.
        onLoad: 'check-sso',
        silentCheckSsoRedirectUri: `${window.location.origin}/silent-check-sso.html`,
        // Front (4200) et Keycloak (8081) sont deux origines : l'iframe de
        // surveillance de session tierce est peu fiable dans ce contexte
        // (cookies tiers) et pas nécessaire pour un simple check-sso.
        checkLoginIframe: false,
      },
    }),
    {
      provide: INCLUDE_BEARER_TOKEN_INTERCEPTOR_CONFIG,
      useValue: [bearerTokenCondition],
    },
  ];
}

/** SSR always renders the logged-out shell; hydration reconciles real auth state client-side. */
export function provideKeycloakServerStub(): Provider[] {
  return [
    {
      provide: Keycloak,
      useValue: {
        authenticated: false,
        tokenParsed: {},
        init: () => Promise.resolve(false),
        login: () => Promise.resolve(),
        logout: () => Promise.resolve(),
      },
    },
    { provide: KEYCLOAK_EVENT_SIGNAL, useValue: signal(undefined) },
  ];
}
