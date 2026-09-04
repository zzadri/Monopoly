import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { APP_CONFIG } from './config';

export type BotDifficulty = 'TresFacile' | 'Facile' | 'Moyen' | 'Difficile' | 'Extreme';

export interface BoardSpace {
  position: number;
  type: string;
  name: string;
  groupColorHex: string | null;
  price: number | null;
}

export interface DefaultBoard {
  boardId: string;
  boardVersionId: string;
  name: string;
  rows: number;
  columns: number;
  spaces: BoardSpace[];
}

export interface CreateGameRequest {
  boardVersionId: string;
  maxPlayers: number;
  isPrivate: boolean;
  loyerDoubleEnsembleComplet: boolean;
  cagnotteVacances: boolean;
  encheres: boolean;
  pasDeLoyerEnPrison: boolean;
  hypothequeSansLoyer: boolean;
  constructionEquilibree: boolean;
  argentDepart: number;
  melangerOrdreJoueurs: boolean;
  botCount: number;
  botDifficulty: BotDifficulty | null;
  turnLimit: number;
}

export interface CreateGameResponse {
  id: string;
}

@Injectable({ providedIn: 'root' })
export class GamesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = APP_CONFIG.apiBaseUrl;

  getDefaultBoard(): Observable<DefaultBoard> {
    return this.http.get<DefaultBoard>(`${this.baseUrl}/boards/default`);
  }

  createGame(request: CreateGameRequest): Observable<CreateGameResponse> {
    return this.http.post<CreateGameResponse>(`${this.baseUrl}/games`, request);
  }
}
