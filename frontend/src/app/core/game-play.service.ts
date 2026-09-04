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
    // Le secret d'invité part en en-tête : en query string il finirait dans les
    // journaux des proxys et dans l'historique du navigateur.
    const secret = this.guestSecretFor(gameId);
    const state = await firstValueFrom(
      this.http.get<GameState>(`${this.baseUrl}/games/${gameId}/state`, {
        headers: secret ? { 'X-Guest-Secret': secret } : {},
      }),
    );
    this.state.set(state);
    return state;
  }

  async join(gameId: string, guestName?: string): Promise<JoinGameResult> {
    const result = await firstValueFrom(
      this.http.post<JoinGameResult>(`${this.baseUrl}/games/${gameId}/join`, {
        guestName: guestName ?? null,
        guestSecret: this.guestSecretFor(gameId),
      }),
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
        this.http.post<GameState>(`${this.baseUrl}/games/${gameId}/actions`, {
          action,
          spaceId: spaceId ?? null,
          guestSecret: this.guestSecretFor(gameId),
        }),
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
        this.http.post<GameState>(`${this.baseUrl}/games/${gameId}/trades`, {
          targetId,
          offeredSpaceIds,
          requestedSpaceIds,
          offeredMoney,
          requestedMoney,
          guestSecret: this.guestSecretFor(gameId),
        }),
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
        this.http.post<GameState>(`${this.baseUrl}/games/${gameId}/trades/${tradeId}/respond`, {
          accept,
          guestSecret: this.guestSecretFor(gameId),
        }),
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
      // Nouvelle connexion = nouveau connectionId : sans ce ré-enregistrement,
      // le serveur ne saurait plus quel siège elle occupe.
      void this.announcePresence(gameId, connection.connectionId);
    });
    connection.onclose(() => this.connected.set(false));

    await connection.start();
    await connection.invoke('JoinGame', gameId);
    await this.announcePresence(gameId, connection.connectionId);

    this.connection = connection;
    this.connected.set(true);
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
        this.http.post<void>(`${this.baseUrl}/games/${gameId}/presence`, {
          connectionId,
          guestSecret: this.guestSecretFor(gameId),
        }),
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
