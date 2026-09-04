import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { provideKeycloakServerStub } from './core/keycloak.providers';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes)), ...provideKeycloakServerStub()],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
