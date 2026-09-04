import { Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import Keycloak from 'keycloak-js';
import { KEYCLOAK_EVENT_SIGNAL } from 'keycloak-angular';

@Component({
  imports: [],
  selector: 'app-home',
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home {
  private readonly keycloak = inject(Keycloak);
  private readonly router = inject(Router);
  private readonly keycloakSignal = inject(KEYCLOAK_EVENT_SIGNAL);

  /** Un joueur déjà connecté ne doit pas se voir proposer de se connecter. */
  protected readonly isAuthenticated = signal(this.keycloak.authenticated ?? false);
  protected readonly userName = signal(
    (this.keycloak.tokenParsed?.['preferred_username'] as string) ?? '',
  );

  protected login(): void {
    void this.keycloak.login({ redirectUri: `${window.location.origin}/lobby` });
  }

  protected playAsGuest(): void {
    void this.router.navigate(['/lobby']);
  }

  protected goToLobby(): void {
    void this.router.navigate(['/lobby']);
  }

  constructor() {
    // L'état Keycloak arrive après le bootstrap : on suit son signal d'événements.
    effect(() => {
      this.keycloakSignal();
      this.isAuthenticated.set(this.keycloak.authenticated ?? false);
      this.userName.set((this.keycloak.tokenParsed?.['preferred_username'] as string) ?? '');
    });
  }
}
