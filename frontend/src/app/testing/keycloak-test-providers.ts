import { signal } from '@angular/core';
import Keycloak from 'keycloak-js';
import { KEYCLOAK_EVENT_SIGNAL } from 'keycloak-angular';

/** Minimal Keycloak double for component tests — no real auth server involved. */
export function provideKeycloakTestingStub() {
  return [
    {
      provide: Keycloak,
      useValue: {
        authenticated: false,
        tokenParsed: {},
        login: () => Promise.resolve(),
        logout: () => Promise.resolve(),
      },
    },
    { provide: KEYCLOAK_EVENT_SIGNAL, useValue: signal(undefined) },
  ];
}
