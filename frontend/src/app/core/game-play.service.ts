import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { HubConnection, HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import { firstValueFrom } from 'rxjs';
import { APP_CONFIG } from './config';
import { GameActionType, GameState, GameSummary, JoinGameResult } from './game-state.models';

/**
 * Pilote une partie : appels d'intention vers l'API (le serveur décide de
 * tout, cf. ADR 0003) et abonnement temps réel aux changements d'état.
 */
@Injectable({ providedIn: 'root' })
export class GamePlayService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = APP_CONFIG.apiBaseUrl;
  private connection: HubConnection | null = null;

  readonly state = signal<GameState | null>(null);
  readonly connected = signal(false);
  readonly actionError = signal<string | null>(null);

  listGames(): Promise<GameSummary[]> {
    return firstValueFrom(this.http.get<GameSummary[]>(`${this.baseUrl}/games`));
  }

  async loadState(gameId: string): Promise<GameState> {
    const state = await firstValueFrom(
      this.http.get<GameState>(`${this.baseUrl}/games/${gameId}/state`, {
        headers: this.guestHeaders(gameId),
      }),
    );
    this.state.set(state);
    return state;
  }

  async join(gameId: string, guestName?: string): Promise<JoinGameResult> {
    const result = await firstValueFrom(
      this.http.post<JoinGameResult>(
        `${this.baseUrl}/games/${gameId}/join`,
        { guestName: guestName ?? null },
        { headers: this.guestHeaders(gameId) },
      ),
    );

    if (result.guestSecret) {
      this.storeGuestSecret(gameId, result.guestSecret);
    }
    this.applyOwnState(result.state, result.participantId);
    return result;
  }

  async act(gameId: string, action: GameActionType, spaceId?: string): Promise<void> {
    this.actionError.set(null);
    try {
      const state = await firstValueFrom(
        this.http.post<GameState>(
          `${this.baseUrl}/games/${gameId}/actions`,
          { action, spaceId: spaceId ?? null },
          { headers: this.guestHeaders(gameId) },
        ),
      );
      this.state.set(state);
    } catch (error: unknown) {
      this.actionError.set(this.describe(error));
    }
  }

  async proposeTrade(
    gameId: string,
    targetId: string,
    offeredSpaceIds: string[],
    requestedSpaceIds: string[],
    offeredMoney: number,
    requestedMoney: number,
  ): Promise<void> {
    this.actionError.set(null);
    try {
      const state = await firstValueFrom(
        this.http.post<GameState>(
          `${this.baseUrl}/games/${gameId}/trades`,
          { targetId, offeredSpaceIds, requestedSpaceIds, offeredMoney, requestedMoney },
          { headers: this.guestHeaders(gameId) },
        ),
      );
      this.state.set(state);
    } catch (error: unknown) {
      this.actionError.set(this.describe(error));
    }
  }

  async respondTrade(gameId: string, tradeId: string, accept: boolean): Promise<void> {
    this.actionError.set(null);
    try {
      const state = await firstValueFrom(
        this.http.post<GameState>(
          `${this.baseUrl}/games/${gameId}/trades/${tradeId}/respond`,
          { accept },
          { headers: this.guestHeaders(gameId) },
        ),
      );
      this.state.set(state);
    } catch (error: unknown) {
      this.actionError.set(this.describe(error));
    }
  }

  async connectRealtime(gameId: string): Promise<void> {
    if (this.connection) return;

    const connection = new HubConnectionBuilder()
      .withUrl(`${this.baseUrl}/hubs/game`)
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Warning)
      .build();

    // Le serveur diffuse l'état sans siège : on conserve le nôtre localement.
    connection.on('gameStateChanged', (incoming: GameState) => {
      const mine = this.state()?.yourParticipantId ?? null;
      this.state.set({ ...incoming, yourParticipantId: mine });
    });

    connection.onreconnected(() => {
      void connection.invoke('JoinGame', gameId);
      void this.resumeSeat(gameId, connection.connectionId);
    });
    connection.onclose(() => this.connected.set(false));

    await connection.start();
    await connection.invoke('JoinGame', gameId);
    await this.resumeSeat(gameId, connection.connectionId);

    this.connection = connection;
    this.connected.set(true);
  }

  /**
   * Reprend la main sur notre siège, puis rattache la connexion temps réel.
   *
   * Une coupure réseau, même brève, fait passer le siège à un Bot de repli
   * côté serveur (bascule immédiate, sans délai de grâce). Sans cette reprise
   * le joueur revient devant son plateau pendant qu'un bot continue de jouer
   * ses tours : ni la reconnexion SignalR ni un rechargement de page ne
   * repassaient IsConnected à true, seul /join le fait.
   */
  private async resumeSeat(gameId: string, connectionId: string | null): Promise<void> {
    const state = this.state();
    const mine = state?.players.find((p) => p.id === state.yourParticipantId);

    if (mine && (mine.kind === 'BotDeRepli' || !mine.isConnected)) {
      try {
        await this.join(gameId);
      } catch {
        // Siège irrécupérable (secret perdu, session expirée) : on reste
        // spectateur plutôt que de bloquer l'écran.
      }
    }

    // Toujours après la reprise : le serveur doit associer le siège rendu à la
    // nouvelle connexion, dont le connectionId vient de changer.
    await this.announcePresence(gameId, connectionId);
  }

  /**
   * Dit au serveur quelle connexion temps réel occupe notre siège. Sans cela,
   * une déconnexion ne peut pas rendre le siège à un Bot de repli et la partie
   * se fige sur le joueur absent.
   */
  private async announcePresence(gameId: string, connectionId: string | null): Promise<void> {
    if (!connectionId) return;
    try {
      await firstValueFrom(
        this.http.post<void>(
          `${this.baseUrl}/games/${gameId}/presence`,
          { connectionId },
          { headers: this.guestHeaders(gameId) },
        ),
      );
    } catch {
      // Un spectateur n'a pas de siège : l'échec est sans conséquence.
    }
  }

  async disconnectRealtime(): Promise<void> {
    if (!this.connection) return;
    const connection = this.connection;
    this.connection = null;
    this.connected.set(false);
    await connection.stop();
  }

  /**
   * Le laissez-passer d'un invité voyage en en-tête sur toutes les routes qui
   * l'exigent : uniforme, et jamais dans une URL — une query string finit dans
   * les journaux des proxys et l'historique du navigateur.
   */
  private guestHeaders(gameId: string): Record<string, string> {
    const secret = this.guestSecretFor(gameId);
    return secret ? { 'X-Guest-Secret': secret } : {};
  }

  guestSecretFor(gameId: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(`monopoly-guest-${gameId}`);
  }

  private storeGuestSecret(gameId: string, secret: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(`monopoly-guest-${gameId}`, secret);
  }

  private applyOwnState(state: GameState, participantId: string): void {
    this.state.set({ ...state, yourParticipantId: participantId });
  }

  private describe(error: unknown): string {
    const problem = error as { error?: { detail?: string; title?: string }; status?: number };
    return (
      problem?.error?.detail ??
      problem?.error?.title ??
      (problem?.status === 401 ? 'Connecte-toi pour effectuer cette action.' : "L'action a été refusée.")
    );
  }
}
