import { Component, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import Keycloak from 'keycloak-js';
import { KEYCLOAK_EVENT_SIGNAL } from 'keycloak-angular';
import { ThemeService } from '../../core/theme.service';

@Component({
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  selector: 'app-shell',
  styleUrl: './app-shell.css',
  templateUrl: './app-shell.html',
})
export class AppShell {
  private readonly keycloak = inject(Keycloak);
  private readonly keycloakSignal = inject(KEYCLOAK_EVENT_SIGNAL);
  protected readonly themeService = inject(ThemeService);

  protected readonly authenticated = signal(false);
  protected readonly username = signal('');

  constructor() {
    effect(() => {
      this.keycloakSignal();
      this.authenticated.set(this.keycloak.authenticated ?? false);
      this.username.set((this.keycloak.tokenParsed?.['preferred_username'] as string) ?? '');
    });
  }

  protected login(): void {
    void this.keycloak.login();
  }

  protected logout(): void {
    void this.keycloak.logout({ redirectUri: typeof window !== 'undefined' ? window.location.origin : undefined });
  }

  protected toggleTheme(): void {
    this.themeService.toggle();
  }
}
