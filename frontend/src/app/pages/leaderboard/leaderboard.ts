import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from '../../core/config';

interface LeaderboardRow {
  rank: number;
  displayName: string;
  level: number;
  xp: number;
  gamesPlayed: number;
  gamesWon: number;
  bestNetWorth: number;
  value: number;
}

interface LeaderboardData {
  board: string;
  label: string;
  rows: LeaderboardRow[];
}

const BOARDS = [
  { key: 'niveau', label: 'Niveau' },
  { key: 'victoires', label: 'Victoires' },
  { key: 'parties', label: 'Parties jouées' },
  { key: 'patrimoine', label: 'Patrimoine' },
] as const;

@Component({
  imports: [],
  selector: 'app-leaderboard',
  styleUrl: './leaderboard.css',
  templateUrl: './leaderboard.html',
})
export class Leaderboard implements OnInit {
  private readonly http = inject(HttpClient);

  protected readonly boards = BOARDS;
  protected readonly current = signal<string>('niveau');
  protected readonly data = signal<LeaderboardData | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    if (typeof window === 'undefined') {
      this.loading.set(false);
      return;
    }
    await this.load('niveau');
  }

  protected async load(board: string): Promise<void> {
    this.current.set(board);
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(
        await firstValueFrom(this.http.get<LeaderboardData>(`${APP_CONFIG.apiBaseUrl}/leaderboards/${board}`)),
      );
    } catch {
      this.error.set('Impossible de charger le classement.');
    } finally {
      this.loading.set(false);
    }
  }

  protected podium(): LeaderboardRow[] {
    return (this.data()?.rows ?? []).slice(0, 3);
  }

  protected rest(): LeaderboardRow[] {
    return (this.data()?.rows ?? []).slice(3);
  }
}
