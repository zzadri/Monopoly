import { Component, OnDestroy, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GamePlayService } from '../../core/game-play.service';
import { GamePlayer, GameSpace, GameState } from '../../core/game-state.models';

interface BoardCell {
  space: GameSpace;
  row: number;
  col: number;
  owner: GamePlayer | null;
  icon: string;
  subtitle: string;
  /** Le bandeau de couleur borde l'extérieur du plateau. */
  bandSide: 'top' | 'right' | 'bottom' | 'left';
  isCorner: boolean;
}

/** Un pion positionné en pourcentage sur le plateau, prêt à être animé. */
interface TokenView {
  id: string;
  name: string;
  initial: string;
  color: string;
  left: number;
  top: number;
  isCurrent: boolean;
}

/** Durée d'un saut de case, en ms. */
const STEP_MS = 160;

/**
 * Clés d'icônes vectorielles (le rendu SVG vit dans le template) : les emojis
 * dépendaient de la police système et rendaient mal.
 */
const SPACE_ICONS: Record<string, string> = {
  Depart: 'start',
  Prison: 'jail',
  AllezEnPrison: 'gotojail',
  Vacances: 'vacation',
  Chance: 'chance',
  CaisseCommune: 'chest',
  Taxe: 'tax',
  Gare: 'train',
};

@Component({
  imports: [],
  selector: 'app-game',
  styleUrl: './game.css',
  templateUrl: './game.html',
})
export class Game implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly play = inject(GamePlayService);

  protected readonly gameId = signal<string>('');
  protected readonly panelTab = signal<'joueurs' | 'proprietes' | 'echanges'>('joueurs');
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly guestName = signal('');

  protected readonly state = this.play.state;

  protected readonly you = computed<GamePlayer | null>(() => {
    const s = this.state();
    if (!s?.yourParticipantId) return null;
    return s.players.find((p) => p.id === s.yourParticipantId) ?? null;
  });

  protected readonly currentPlayer = computed<GamePlayer | null>(() => {
    const s = this.state();
    if (!s?.currentParticipantId) return null;
    return s.players.find((p) => p.id === s.currentParticipantId) ?? null;
  });

  protected readonly isYourTurn = computed(() => {
    const s = this.state();
    return !!s?.yourParticipantId && s.currentParticipantId === s.yourParticipantId;
  });

  protected readonly cells = computed<BoardCell[]>(() => {
    const s = this.state();
    if (!s) return [];

    return s.spaces.map((space) => {
      const { row, col } = this.perimeterCell(space.position, s.rows, s.columns);

      // Bandeau vers l'extérieur du plateau (Richup), pas vers le centre.
      let bandSide: BoardCell['bandSide'] = 'top';
      if (col === s.columns - 1) bandSide = 'right';
      else if (row === s.rows - 1) bandSide = 'bottom';
      else if (col === 0) bandSide = 'left';

      const isCorner =
        (row === 0 || row === s.rows - 1) && (col === 0 || col === s.columns - 1);

      return {
        space,
        row,
        col,
        owner: s.players.find((p) => p.id === space.ownerParticipantId) ?? null,
        icon: this.iconFor(space),
        subtitle: this.subtitleFor(space),
        bandSide,
        isCorner,
      };
    });
  });

  /** Les biens du joueur, pour construire / hypothéquer. */
  protected readonly yourProperties = computed<GameSpace[]>(() => {
    const s = this.state();
    const me = this.you();
    if (!s || !me) return [];
    return s.spaces
      .filter((space) => space.ownerParticipantId === me.id)
      .sort((a, b) => a.position - b.position);
  });

  protected readonly canStart = computed(() => {
    const s = this.state();
    return s?.status === 'Lobby' && !!s.yourParticipantId && s.players.length >= 2;
  });

  // --------------------------------------------------------------- Animation

  /** Position affichée de chaque pion : rattrape la position réelle case par case. */
  private readonly displayedPositions = signal<Record<string, number>>({});
  private readonly movingPlayerId = signal<string | null>(null);
  private moveTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly rolling = signal(false);
  private rollTimer: ReturnType<typeof setTimeout> | null = null;
  private lastDiceSequence = -1;

  /** Faces des dés : positions des points pour chaque valeur. */
  protected readonly diePips = [
    [],
    [4],
    [0, 8],
    [0, 4, 8],
    [0, 2, 6, 8],
    [0, 2, 4, 6, 8],
    [0, 2, 3, 5, 6, 8],
  ];

  protected readonly tokens = computed<TokenView[]>(() => {
    const s = this.state();
    if (!s) return [];

    const displayed = this.displayedPositions();
    const perCell = new Map<number, number>();

    return s.players
      .filter((p) => !p.isBankrupt)
      .map((player) => {
        const position = displayed[player.id] ?? player.position;
        const { row, col } = this.perimeterCell(position, s.rows, s.columns);

        // Plusieurs pions sur la même case : on les éparpille un peu.
        const index = perCell.get(position) ?? 0;
        perCell.set(position, index + 1);
        const offsetX = (index % 2) * 34 - 17;
        const offsetY = Math.floor(index / 2) * 30 - 12;

        const cellW = 100 / s.columns;
        const cellH = 100 / s.rows;

        return {
          id: player.id,
          name: player.displayName,
          initial: player.displayName.charAt(0).toUpperCase(),
          color: player.tokenColor,
          left: (col + 0.5) * cellW + (offsetX / 100) * cellW,
          top: (row + 0.5) * cellH + (offsetY / 100) * cellH,
          isCurrent: player.id === s.currentParticipantId,
        };
      });
  });

  constructor() {
    // Rejoue les déplacements case par case dès que le serveur bouge un pion.
    effect(() => {
      const s = this.state();
      if (!s) return;

      untracked(() => {
        // Salon fermé faute de démarrage : on ne laisse personne coincé dessus.
        if (s.status === 'Cancelled') {
          void this.router.navigate(['/'], {
            state: { notice: "Le salon a été fermé : la partie n'a pas démarré à temps." },
          });
          return;
        }

        this.syncDice(s);
        this.syncTokens(s);
      });
    });
  }

  private syncDice(s: GameState): void {
    const lastRoll = [...s.events].reverse().find((e) => e.type === 'DiceRolled');
    if (!lastRoll || lastRoll.sequence <= this.lastDiceSequence) return;

    this.lastDiceSequence = lastRoll.sequence;
    this.rolling.set(true);
    if (this.rollTimer) clearTimeout(this.rollTimer);
    this.rollTimer = setTimeout(() => this.rolling.set(false), 650);
  }

  private syncTokens(s: GameState): void {
    const displayed = { ...this.displayedPositions() };
    let dirty = false;

    // Premier rendu, ou joueur qui vient d'arriver : pas d'animation.
    for (const player of s.players) {
      if (displayed[player.id] === undefined) {
        displayed[player.id] = player.position;
        dirty = true;
      }
    }
    if (dirty) this.displayedPositions.set(displayed);

    if (this.moveTimer) return; // une animation est déjà en cours

    this.stepTowardsServerPositions();
  }

  private stepTowardsServerPositions(): void {
    const s = this.state();
    if (!s) return;

    const displayed = { ...this.displayedPositions() };
    const behind = s.players.find(
      (p) => !p.isBankrupt && displayed[p.id] !== undefined && displayed[p.id] !== p.position,
    );

    if (!behind) {
      this.movingPlayerId.set(null);
      this.moveTimer = null;
      return;
    }

    const from = displayed[behind.id];
    const to = behind.position;
    const forward = (to - from + s.spaces.length) % s.spaces.length;

    // Un déplacement de plus de 12 cases ne vient pas des dés (prison, carte) :
    // on téléporte au lieu de faire le tour du plateau.
    const next = forward > 0 && forward <= 12 ? (from + 1) % s.spaces.length : to;

    displayed[behind.id] = next;
    this.displayedPositions.set(displayed);
    this.movingPlayerId.set(behind.id);

    this.moveTimer = setTimeout(() => {
      this.moveTimer = null;
      this.stepTowardsServerPositions();
    }, STEP_MS);
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('Partie introuvable.');
      this.loading.set(false);
      return;
    }
    this.gameId.set(id);

    // L'état de partie et le temps réel sont purement navigateur : le rendu
    // serveur se contente de l'écran de chargement, l'hydratation prend le relais.
    if (typeof window === 'undefined') return;

    try {
      await this.play.loadState(id);
      await this.play.connectRealtime(id);
    } catch {
      this.loadError.set("Impossible de charger la partie. Elle n'existe peut-être plus.");
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    if (this.moveTimer) clearTimeout(this.moveTimer);
    if (this.rollTimer) clearTimeout(this.rollTimer);
    void this.play.disconnectRealtime();
  }

  protected async join(): Promise<void> {
    try {
      await this.play.join(this.gameId(), this.guestName() || undefined);
    } catch {
      this.loadError.set('Impossible de rejoindre ce salon (complet ou déjà démarré).');
    }
  }

  protected onGuestNameInput(event: Event): void {
    this.guestName.set((event.target as HTMLInputElement).value);
  }

  protected selectTab(tab: 'joueurs' | 'proprietes' | 'echanges'): void {
    this.panelTab.set(tab);
  }

  /** Journal du plus récent au plus ancien : on lit le dernier coup en haut. */
  protected readonly recentEvents = computed(() => {
    const s = this.state();
    return s ? [...s.events].reverse() : [];
  });

  protected act(action: Parameters<GamePlayService['act']>[1], spaceId?: string): void {
    void this.play.act(this.gameId(), action, spaceId);
  }

  private iconFor(space: GameSpace): string {
    if (space.type === 'Compagnie') {
      return space.name.toLowerCase().includes('eau') ? 'water' : 'power';
    }
    return SPACE_ICONS[space.type] ?? '';
  }

  private subtitleFor(space: GameSpace): string {
    if (space.price) return `${space.price} €`;
    if (space.type === 'Depart') return '+200 €';
    if (space.type === 'Taxe') return space.name.toLowerCase().includes('revenu') ? '200 €' : '100 €';
    if (space.type === 'Prison') return 'simple visite';
    return '';
  }

  protected spaceTitle(cell: BoardCell): string {
    const parts = [cell.space.name];
    if (cell.space.price) parts.push(`prix ${cell.space.price} €`);
    if (cell.space.currentRent) parts.push(`loyer ${cell.space.currentRent} €`);
    if (cell.owner) parts.push(`à ${cell.owner.displayName}`);
    if (cell.space.isMortgaged) parts.push('hypothéqué');
    return parts.join(' — ');
  }

  protected shareLink(): string {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/game/${this.gameId()}`;
  }

  protected async copyShareLink(): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(this.shareLink());
  }

  /** Offres qui attendent ma réponse. */
  protected readonly incomingTrades = computed(() => {
    const s = this.state();
    if (!s?.yourParticipantId) return [];
    return s.trades.filter((t) => t.targetId === s.yourParticipantId);
  });

  /** Offres que j'ai envoyées et qui attendent. */
  protected readonly outgoingTrades = computed(() => {
    const s = this.state();
    if (!s?.yourParticipantId) return [];
    return s.trades.filter((t) => t.proposerId === s.yourParticipantId);
  });

  /** Les autres joueurs encore en lice, cibles possibles d'un échange. */
  protected readonly tradePartners = computed(() => {
    const s = this.state();
    const me = this.you();
    if (!s || !me) return [];
    return s.players.filter((p) => p.id !== me.id && !p.isBankrupt);
  });

  protected readonly partnerProperties = computed(() => {
    const s = this.state();
    const target = this.tradeTargetId();
    if (!s || !target) return [];
    return s.spaces.filter((space) => space.ownerParticipantId === target);
  });

  protected readonly tradeTargetId = signal<string>('');
  protected readonly tradeOfferedIds = signal<string[]>([]);
  protected readonly tradeRequestedIds = signal<string[]>([]);
  protected readonly tradeOfferedMoney = signal(0);
  protected readonly tradeRequestedMoney = signal(0);
  protected readonly tradeOpen = signal(false);

  protected toggleTradePanel(): void {
    this.tradeOpen.update((open) => !open);
  }

  protected onTradeTargetChange(event: Event): void {
    this.tradeTargetId.set((event.target as HTMLSelectElement).value);
    this.tradeRequestedIds.set([]);
  }

  protected onOfferedMoney(event: Event): void {
    this.tradeOfferedMoney.set(Number((event.target as HTMLInputElement).value) || 0);
  }

  protected onRequestedMoney(event: Event): void {
    this.tradeRequestedMoney.set(Number((event.target as HTMLInputElement).value) || 0);
  }

  protected toggleOffered(spaceId: string): void {
    this.tradeOfferedIds.update((ids) =>
      ids.includes(spaceId) ? ids.filter((id) => id !== spaceId) : [...ids, spaceId],
    );
  }

  protected toggleRequested(spaceId: string): void {
    this.tradeRequestedIds.update((ids) =>
      ids.includes(spaceId) ? ids.filter((id) => id !== spaceId) : [...ids, spaceId],
    );
  }

  protected async sendTrade(): Promise<void> {
    const target = this.tradeTargetId();
    if (!target) return;
    await this.play.proposeTrade(
      this.gameId(),
      target,
      this.tradeOfferedIds(),
      this.tradeRequestedIds(),
      this.tradeOfferedMoney(),
      this.tradeRequestedMoney(),
    );
    this.tradeOfferedIds.set([]);
    this.tradeRequestedIds.set([]);
    this.tradeOfferedMoney.set(0);
    this.tradeRequestedMoney.set(0);
    this.tradeOpen.set(false);
  }

  protected respondTrade(tradeId: string, accept: boolean): void {
    void this.play.respondTrade(this.gameId(), tradeId, accept);
  }

  private perimeterCell(position: number, rows: number, columns: number): { row: number; col: number } {
    const topLen = columns;
    const rightLen = rows - 1;
    const bottomLen = columns - 1;

    if (position < topLen) return { row: 0, col: position };
    position -= topLen;

    if (position < rightLen) return { row: position + 1, col: columns - 1 };
    position -= rightLen;

    if (position < bottomLen) return { row: rows - 1, col: columns - 2 - position };
    position -= bottomLen;

    return { row: rows - 2 - position, col: 0 };
  }

  protected readonly phaseLabel = computed(() => {
    const s: GameState | null = this.state();
    if (!s) return '';
    if (s.status === 'Lobby') return 'En attente de joueurs';
    if (s.status === 'Finished') return 'Partie terminée';
    switch (s.phase) {
      case 'AwaitingRoll':
        return 'Lancer de dés';
      case 'AwaitingPurchaseDecision':
        return 'Décision d’achat';
      case 'AwaitingJailDecision':
        return 'En prison';
      case 'AwaitingDebtSettlement':
        return 'Dette à régler';
      default:
        return 'Fin de tour';
    }
  });
}
