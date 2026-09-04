import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { provideKeycloakAuth } from './app/core/keycloak.providers';
import { App } from './app/app';

bootstrapApplication(App, {
  providers: [...appConfig.providers, ...provideKeycloakAuth()],
}).catch((err) => console.error(err));
