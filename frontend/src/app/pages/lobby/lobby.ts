import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import Keycloak from 'keycloak-js';
import { GamePlayService } from '../../core/game-play.service';
import { GameSummary } from '../../core/game-state.models';

@Component({
  imports: [],
  selector: 'app-lobby',
  styleUrl: './lobby.css',
  templateUrl: './lobby.html',
})
export class Lobby implements OnInit {
  private readonly keycloak = inject(Keycloak);
  private readonly router = inject(Router);
  private readonly play = inject(GamePlayService);

  protected readonly isAuthenticated = signal(this.keycloak.authenticated ?? false);
  protected readonly games = signal<GameSummary[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    if (typeof window === 'undefined') {
      this.loading.set(false);
      return;
    }
    await this.refresh();
  }

  protected async refresh(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.games.set(await this.play.listGames());
    } catch {
      this.error.set('Impossible de charger les salons.');
    } finally {
      this.loading.set(false);
    }
  }

  protected login(): void {
    void this.keycloak.login();
  }

  protected openCreateForm(): void {
    void this.router.navigate(['/lobby/create']);
  }

  protected openGame(game: GameSummary): void {
    void this.router.navigate(['/game', game.id]);
  }

  protected statusLabel(game: GameSummary): string {
    return game.status === 'Lobby' ? 'En attente' : 'En cours';
  }
}
