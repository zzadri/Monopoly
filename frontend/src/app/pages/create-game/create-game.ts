import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Keycloak from 'keycloak-js';
import { BotDifficulty, DefaultBoard, GamesApi } from '../../core/games-api.service';

const STARTING_MONEY_OPTIONS = [500, 1000, 1500, 2000, 2500, 3000] as const;

const BOT_DIFFICULTY_LABELS: Record<BotDifficulty, string> = {
  TresFacile: 'Très facile',
  Facile: 'Facile',
  Moyen: 'Moyen',
  Difficile: 'Difficile',
  Extreme: 'Extrême',
};

const SPECIAL_LABELS: Record<string, string> = {
  Depart: 'Départ',
  Prison: 'Prison',
  AllezEnPrison: 'Prison',
  Vacances: 'Vacances',
  Chance: 'Chance',
  CaisseCommune: 'Caisse',
  Taxe: 'Taxe',
};

interface PreviewCell {
  row: number;
  col: number;
  color: string | null;
  name: string;
  price: number | null;
  title: string;
  bandSide: 'top' | 'right' | 'bottom' | 'left';
  isCorner: boolean;
}

@Component({
  imports: [FormsModule],
  selector: 'app-create-game',
  styleUrl: './create-game.css',
  templateUrl: './create-game.html',
})
export class CreateGame implements OnInit {
  private readonly keycloak = inject(Keycloak);
  private readonly gamesApi = inject(GamesApi);
  private readonly router = inject(Router);

  protected readonly startingMoneyOptions = STARTING_MONEY_OPTIONS;
  protected readonly botDifficulties = Object.keys(BOT_DIFFICULTY_LABELS) as BotDifficulty[];
  protected readonly botDifficultyLabels = BOT_DIFFICULTY_LABELS;

  protected readonly board = signal<DefaultBoard | null>(null);
  protected readonly boardError = signal<string | null>(null);
  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly previewCells = computed<PreviewCell[]>(() => {
    const b = this.board();
    if (!b) return [];
    return b.spaces.map((space) => {
      const { row, col } = this.perimeterCell(space.position, b.rows, b.columns);

      let bandSide: PreviewCell['bandSide'] = 'top';
      if (col === b.columns - 1) bandSide = 'right';
      else if (row === b.rows - 1) bandSide = 'bottom';
      else if (col === 0) bandSide = 'left';

      return {
        row,
        col,
        color: space.groupColorHex,
        name: SPECIAL_LABELS[space.type] ?? space.name,
        price: space.price,
        title: space.name + (space.price ? ` — ${space.price} €` : ''),
        bandSide,
        isCorner: (row === 0 || row === b.rows - 1) && (col === 0 || col === b.columns - 1),
      };
    });
  });

  protected maxPlayers = 8;
  protected argentDepart = 1500;
  protected isPrivate = false;
  protected melangerOrdreJoueurs = false;

  protected loyerDoubleEnsembleComplet = false;
  protected cagnotteVacances = false;
  protected encheres = true;
  protected pasDeLoyerEnPrison = false;
  protected hypothequeSansLoyer = false;
  protected constructionEquilibree = true;

  protected turnLimit = 200;
  /** Oui/non : si oui, le salon est complété par des bots jusqu'au maximum. */
  protected withBots = false;
  protected botDifficulty: BotDifficulty = 'Moyen';

  /** Nombre de bots effectivement ajoutés : toutes les places libres. */
  protected botCount(): number {
    return this.withBots ? Math.max(0, Number(this.maxPlayers) - 1) : 0;
  }

  ngOnInit(): void {
    if (!this.keycloak.authenticated) {
      void this.router.navigate(['/lobby']);
      return;
    }

    this.gamesApi.getDefaultBoard().subscribe({
      next: (board) => this.board.set(board),
      error: () => this.boardError.set("Impossible de charger l'aperçu du plateau."),
    });
  }

  protected cancel(): void {
    void this.router.navigate(['/lobby']);
  }

  protected submitCreateGame(): void {
    const board = this.board();
    if (!board) return;

    this.submitting.set(true);
    this.errorMessage.set(null);

    this.gamesApi
      .createGame({
        boardVersionId: board.boardVersionId,
        maxPlayers: this.maxPlayers,
        isPrivate: this.isPrivate,
        argentDepart: this.argentDepart,
        melangerOrdreJoueurs: this.melangerOrdreJoueurs,
        loyerDoubleEnsembleComplet: this.loyerDoubleEnsembleComplet,
        cagnotteVacances: this.cagnotteVacances,
        encheres: this.encheres,
        pasDeLoyerEnPrison: this.pasDeLoyerEnPrison,
        hypothequeSansLoyer: this.hypothequeSansLoyer,
        constructionEquilibree: this.constructionEquilibree,
        turnLimit: Number(this.turnLimit) || 0,
        botCount: this.botCount(),
        botDifficulty: this.withBots ? this.botDifficulty : null,
      })
      .subscribe({
        next: (game) => {
          void this.router.navigate(['/game', game.id]);
        },
        error: () => {
          this.submitting.set(false);
          this.errorMessage.set("La partie n'a pas pu être créée. Réessaie dans un instant.");
        },
      });
  }

  /** Place une position (0..N-1) sur le pourtour d'une grille rows x columns, en partant du coin haut-gauche, sens horaire. */
  private perimeterCell(position: number, rows: number, columns: number): { row: number; col: number } {
    const topLen = columns;
    const rightLen = rows - 1;
    const bottomLen = columns - 1;

    if (position < topLen) {
      return { row: 0, col: position };
    }
    position -= topLen;

    if (position < rightLen) {
      return { row: position + 1, col: columns - 1 };
    }
    position -= rightLen;

    if (position < bottomLen) {
      return { row: rows - 1, col: columns - 2 - position };
    }
    position -= bottomLen;

    return { row: rows - 2 - position, col: 0 };
  }
}
