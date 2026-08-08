import crypto from 'node:crypto';
import {
  type BoardDef, type Card, type GameSettings, type GameStateView, type LogPart,
  type PlayerView, type TradeOffer, type TurnPhase, type Tile,
  type GameEvent, type GameEventKind, type ReplaySnapshot, type IntegrityReport,
  PREDEFINED_TREASURE, PREDEFINED_SURPRISE,
} from 'shared';
import { IntegrityMonitor, SeededRng } from './integrity.js';

const SALARY = 200;
const BAIL = 50;
const MAX_PRISON_TURNS = 3;
const AUCTION_INITIAL_MS = 10000;
const AUCTION_BUMP_MS = 6000;

export interface PlayerInit {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isBot: boolean;
}

interface PlayerState extends PlayerView {
  netWorthHistory: number[];
  prisonVisits: number;
}

interface Ownership {
  owner: string;
  houses: number;
  mortgaged: boolean;
}

export interface EngineEvents {
  onUpdate: () => void;
  onLog: (parts: LogPart[]) => void;
  onDice: (playerId: string, values: number[]) => void;
  onCard: (playerId: string, deck: 'treasure' | 'surprise', text: string) => void;
  onEnded: (summary: GameEndSummary) => void;
}

export interface GameEndSummary {
  winnerId: string | null;
  winnerName: string;
  boardName: string;
  startedAt: Date;
  durationS: number;
  turns: number;
  doubles: number;
  mostVisited: string | null;
  prisonKing: string | null;
  netWorthHistory: Record<string, number[]>;
  players: { id: string; name: string; avatar: string; isBot: boolean; won: boolean }[];
}

export class GameEngine {
  readonly board: BoardDef;
  readonly settings: GameSettings;
  private readonly players: PlayerState[] = [];
  private readonly ownership = new Map<number, Ownership>();
  private currentIdx = 0;
  private phase: TurnPhase = 'roll';
  private lastDice: { values: number[]; isDouble: boolean } | null = null;
  private doublesCount = 0;
  private vacationPot = 0;
  private pendingTile: number | null = null;
  private auction: { tile: number; highestBid: number; highestBidder: string | null; endsAt: number } | null = null;
  private auctionTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly trades: TradeOffer[] = [];
  private readonly treasureDeck: Card[] = [];
  private readonly surpriseDeck: Card[] = [];
  private turnNumber = 0;
  private doublesTotal = 0;
  private readonly tileVisits = new Map<number, number>();
  private startedAt = new Date();
  started = false;
  ended = false;
  private winner: string | null = null;
  private readonly startIndex: number;
  private extraTurn = false;
  /** empêche le tour supplémentaire malgré un double (évasion de prison) */
  private noReplay = false;
  private debtCreditor: string | null = null; // à qui va l'argent si faillite pendant une dette

  /** tirage vérifiable : tous les aléas de la partie en dérivent */
  readonly rng: SeededRng;
  readonly integrity = new IntegrityMonitor();
  /** journal immuable : sert d'audit et de source du replay */
  private readonly journal: GameEvent[] = [];
  private eventSeq = 0;

  constructor(
    board: BoardDef,
    settings: GameSettings,
    playerInits: PlayerInit[],
    private readonly events: EngineEvents,
    public readonly roomId: string,
    seed?: string,
  ) {
    this.board = board;
    this.settings = settings;
    this.rng = new SeededRng(seed);

    this.startIndex = Math.max(0, board.tiles.findIndex((t) => t.type === 'start'));

    let order = [...playerInits];
    if (settings.rules.randomizeOrder) order = shuffle(order, this.rng);
    this.players = order.map((p) => ({
      ...p,
      cash: settings.startingCash,
      position: this.startIndex,
      inPrison: false,
      prisonTurns: 0,
      jailCards: 0,
      bankrupt: false,
      connected: true,
      onVacation: false,
      rentImmunity: false,
      netWorthHistory: [settings.startingCash],
      prisonVisits: 0,
    }));

    this.treasureDeck = shuffle(buildDeck(board.treasureMode, PREDEFINED_TREASURE, board.customTreasure), this.rng);
    this.surpriseDeck = shuffle(buildDeck(board.surpriseMode, PREDEFINED_SURPRISE, board.customSurprise), this.rng);
  }

  start() {
    this.started = true;
    this.startedAt = new Date();
    this.phase = 'roll';
    this.log([{ t: 'text', text: 'La partie commence ! Bonne chance à tous.' }], 'start', null);
    this.events.onUpdate();
    this.maybeBot();
  }

  // ---------- Vue ----------

  view(): GameStateView {
    const ownership: Record<number, { owner: string; houses: number; mortgaged: boolean }> = {};
    for (const [k, v] of this.ownership) ownership[k] = { ...v };
    return {
      roomId: this.roomId,
      boardId: this.board.id,
      settings: this.settings,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, color: p.color, cash: p.cash,
        position: p.position, inPrison: p.inPrison, prisonTurns: p.prisonTurns,
        jailCards: p.jailCards, bankrupt: p.bankrupt, connected: p.connected,
        isBot: p.isBot, onVacation: p.onVacation, rentImmunity: p.rentImmunity,
      })),
      ownership,
      currentPlayer: this.players[this.currentIdx]?.id ?? '',
      phase: this.phase,
      lastDice: this.lastDice,
      doublesCount: this.doublesCount,
      vacationPot: this.vacationPot,
      pendingTile: this.pendingTile,
      auction: this.auction ? { ...this.auction } : null,
      trades: this.trades.filter((t) => t.status === 'pending'),
      turnNumber: this.turnNumber,
      started: this.started,
      ended: this.ended,
      winner: this.winner,
    };
  }

  setConnected(playerId: string, connected: boolean) {
    const p = this.players.find((x) => x.id === playerId);
    if (p) { p.connected = connected; this.events.onUpdate(); }
  }

  // ---------- Helpers ----------

  private get current(): PlayerState { return this.players[this.currentIdx]; }
  private player(id: string) { return this.players.find((p) => p.id === id); }
  private tile(i: number): Tile { return this.board.tiles[i]; }
  private get size() { return this.board.tiles.length; }
  private active() { return this.players.filter((p) => !p.bankrupt); }

  /**
   * Journalise un événement : diffusé aux clients et consigné dans le journal
   * d'audit, qui sert ensuite de bande de replay.
   */
  private log(parts: LogPart[], kind: GameEventKind = 'turn', playerId: string | null = null) {
    this.events.onLog(parts);
    this.record(kind, playerId, parts);
  }

  /* ---------- journal d'audit / replay ---------- */

  /** Instantané compact : suffit à reconstituer l'écran de jeu à cet instant. */
  private snapshot(): ReplaySnapshot {
    const index = new Map(this.players.map((p, i) => [p.id, i]));
    const own: [number, number, number, 0 | 1][] = [];
    for (const [tile, o] of this.ownership) {
      const owner = index.get(o.owner);
      if (owner === undefined) continue;
      own.push([tile, owner, o.houses, o.mortgaged ? 1 : 0]);
    }
    return {
      pos: this.players.map((p) => p.position),
      cash: this.players.map((p) => p.cash),
      own,
      cur: this.currentIdx,
    };
  }

  /**
   * Enregistre une action validée. Le journal est append-only : il constitue
   * la preuve du déroulement de la partie et la source du replay.
   */
  private record(kind: GameEventKind, playerId: string | null, parts: LogPart[]) {
    if (this.journal.length >= 5000) return; // borne de sécurité mémoire
    this.journal.push({
      seq: ++this.eventSeq,
      turn: this.turnNumber,
      t: Date.now() - this.startedAt.getTime(),
      kind,
      playerId,
      parts,
      snap: this.snapshot(),
    });
  }

  get events_journal(): GameEvent[] {
    return this.journal;
  }

  /** Rapport d'intégrité : le seed n'est révélé qu'une fois la partie finie. */
  integrityReport(): IntegrityReport {
    const r = this.integrity.result;
    return {
      score: r.score,
      status: r.status,
      seed: this.ended ? this.rng.seed : null,
      seedHash: this.rng.seedHash,
      draws: this.rng.draws,
      anomalies: r.anomalies,
    };
  }

  /** Contrôles d'invariants : toute incohérence fait chuter le score. */
  private checkInvariants() {
    for (const p of this.players) {
      if (p.position < 0 || p.position >= this.size) {
        this.integrity.flag('impossible_value', `position ${p.position} hors plateau`, p.id);
      }
      if (p.cash < 0 && this.phase !== 'debt' && !p.bankrupt) {
        this.integrity.flag('state_invariant', `solde négatif (${p.cash}) hors phase de dette`, p.id);
      }
      if (p.bankrupt && this.propsOf(p.id).length > 0) {
        this.integrity.flag('state_invariant', 'joueur en faillite possédant encore des biens', p.id);
      }
    }
    for (const [tile, o] of this.ownership) {
      if (o.houses < 0 || o.houses > 5) {
        this.integrity.flag('impossible_value', `${o.houses} constructions sur la case ${tile}`, o.owner);
      }
      if (!this.players.some((p) => p.id === o.owner)) {
        this.integrity.flag('state_invariant', `case ${tile} détenue par un joueur inconnu`);
      }
    }
  }
  private pl(p: PlayerState): LogPart { return { t: 'player', id: p.id, name: p.name, avatar: p.avatar, color: p.color }; }
  private tl(i: number): LogPart { return { t: 'tile', index: i, name: this.tile(i).name }; }
  private cash(n: number): LogPart { return { t: 'cash', amount: n }; }

  private prisonIndex(): number {
    return this.board.tiles.findIndex((t) => t.type === 'prison');
  }

  private propsOf(playerId: string): number[] {
    const out: number[] = [];
    for (const [idx, o] of this.ownership) if (o.owner === playerId) out.push(idx);
    return out;
  }

  private groupTiles(group: string): number[] {
    return this.board.tiles
      .map((t, i) => ({ t, i }))
      .filter((x) => x.t.type === 'property' && x.t.group === group)
      .map((x) => x.i);
  }

  private ownsFullSet(playerId: string, group: string): boolean {
    return this.groupTiles(group).every((i) => this.ownership.get(i)?.owner === playerId);
  }

  private countType(playerId: string, type: 'airport' | 'utility'): number {
    let n = 0;
    for (const [idx, o] of this.ownership) {
      if (o.owner === playerId && this.tile(idx).type === type) n++;
    }
    return n;
  }

  netWorth(playerId: string): number {
    const p = this.player(playerId);
    if (!p || p.bankrupt) return 0;
    let total = p.cash;
    for (const idx of this.propsOf(playerId)) {
      const o = this.ownership.get(idx)!;
      const t = this.tile(idx);
      const price = 'price' in t ? t.price : 0;
      total += o.mortgaged ? Math.floor(price / 2) : price;
      if (t.type === 'property') total += o.houses * t.houseCost;
    }
    return total;
  }

  // ---------- Contrôle d'intégrité des requêtes clientes ----------

  /**
   * Point de passage obligatoire avant toute action demandée par un client.
   * Applique l'idempotence (rejeu impossible) et la surveillance de cadence.
   * Le serveur reste seul juge : ce garde ne remplace pas les règles du jeu,
   * il les précède.
   */
  guardAction(playerId: string, actionId?: string): string | null {
    const p = this.player(playerId);
    const isBot = p?.isBot ?? false;
    if (this.integrity.isReplay(actionId, playerId)) {
      return 'Action déjà traitée.';
    }
    this.integrity.checkPace(playerId, isBot);
    this.integrity.checkRobotic(playerId, isBot);
    return null;
  }

  /** Consigne une action refusée par les règles (tentative hors tour, etc.). */
  noteRejected(playerId: string, reason: string) {
    this.integrity.flag('rejected_action', reason, playerId);
  }

  // ---------- Actions joueur ----------

  roll(playerId: string): string | null {
    const error = this.validateRoll(playerId);
    if (error) return error;

    const p = this.current;
    const { count, sides } = this.settings.dice;
    const values = this.rollDice(count, sides);
    const isDouble = count >= 2 && values.every((v) => v === values[0]);
    const total = values.reduce((a, b) => a + b, 0);

    this.lastDice = { values, isDouble };
    this.noReplay = false;
    this.events.onDice(p.id, values);
    this.record('roll', p.id, [
      this.pl(p), { t: 'text', text: `lance les dés : ${values.join(' + ')} = ${total}` },
    ]);

    if (p.inPrison) {
      this.handlePrisonRoll(p, values, isDouble, total, sides);
    } else {
      this.handleNormalRoll(p, values, isDouble, total);
    }

    this.events.onUpdate();
    return null;
  }

  private validateRoll(playerId: string): string | null {
    if (this.ended || !this.started) return 'Partie non active.';
    if (this.current.id !== playerId) return "Ce n'est pas votre tour.";
    if (this.phase !== 'roll') return 'Vous ne pouvez pas lancer maintenant.';
    return null;
  }

  private rollDice(count: number, sides: number): number[] {
    return Array.from({ length: count }, () => 1 + this.rng.int(sides));
  }

  private handlePrisonRoll(
    p: PlayerState,
    values: number[],
    isDouble: boolean,
    total: number,
    sides: number,
  ): void {
    const escaped = isDouble || (values.length === 1 && values[0] === sides);

    if (escaped) {
      this.escapePrison(p);
      this.moveBy(p, total, true);
      return;
    }

    p.prisonTurns++;
    if (p.prisonTurns >= MAX_PRISON_TURNS) {
      this.releaseFromPrisonWithBail(p);
      this.moveBy(p, total, true);
      return;
    }

    this.log([
      this.pl(p),
      { t: 'text', text: `reste en prison (tentative ${p.prisonTurns}/${MAX_PRISON_TURNS}).` },
    ], 'prison', p.id);
    this.toEndPhase(false);
  }

  private escapePrison(p: PlayerState): void {
    p.inPrison = false;
    p.prisonTurns = 0;
    this.noReplay = true;
    this.log([this.pl(p), { t: 'text', text: 's’évade de prison !' }], 'prison', p.id);
  }

  private releaseFromPrisonWithBail(p: PlayerState): void {
    this.log([
      this.pl(p),
      { t: 'text', text: 'paye sa caution de' },
      this.cash(BAIL),
      { t: 'text', text: 'et sort de prison.' },
    ]);
    this.pay(p, BAIL, null);
    p.inPrison = false;
    p.prisonTurns = 0;
  }

  private handleNormalRoll(
    p: PlayerState,
    values: number[],
    isDouble: boolean,
    total: number,
  ): void {
    if (isDouble && this.handleDouble(p, values.length)) return;
    this.moveBy(p, total, true);
  }

  private handleDouble(p: PlayerState, diceCount: number): boolean {
    this.doublesCount++;
    this.doublesTotal++;

    if (this.doublesCount < 3) return false;

    const word = diceCount >= 3 ? 'triples' : 'doubles';
    this.log([
      this.pl(p),
      { t: 'text', text: `fait trois ${word} de suite et part en prison !` },
    ], 'prison', p.id);
    this.sendToPrison(p);
    this.toEndPhase(false);
    return true;
  }

  payBail(playerId: string): string | null {
    const p = this.player(playerId);
    if (!p || this.current.id !== playerId || !p.inPrison || this.phase !== 'roll') return 'Action impossible.';
    if (p.cash < BAIL) return 'Pas assez d’argent pour la caution.';
    this.pay(p, BAIL, null);
    p.inPrison = false;
    p.prisonTurns = 0;
    this.log([this.pl(p), { t: 'text', text: 'paye sa caution de' }, this.cash(BAIL), { t: 'text', text: 'et sort de prison.' }]);
    this.events.onUpdate();
    return null;
  }

  useJailCard(playerId: string): string | null {
    const p = this.player(playerId);
    if (!p || this.current.id !== playerId || !p.inPrison || this.phase !== 'roll') return 'Action impossible.';
    if (p.jailCards < 1) return 'Aucune carte « Sortie de prison ».';
    p.jailCards--;
    p.inPrison = false;
    p.prisonTurns = 0;
    this.log([this.pl(p), { t: 'text', text: 'utilise une carte « Sortie de prison ».' }]);
    this.events.onUpdate();
    return null;
  }

  buy(playerId: string): string | null {
    if (this.current.id !== playerId || this.phase !== 'buy' || this.pendingTile === null) return 'Action impossible.';
    const p = this.current;
    const t = this.tile(this.pendingTile);
    if (!('price' in t)) return 'Case non achetable.';
    if (p.cash < t.price) return 'Pas assez d’argent.';
    p.cash -= t.price;
    this.ownership.set(this.pendingTile, { owner: p.id, houses: 0, mortgaged: false });
    this.log([this.pl(p), { t: 'text', text: 'achète' }, this.tl(this.pendingTile), { t: 'text', text: 'pour' }, this.cash(t.price)], 'buy', p.id);
    this.pendingTile = null;
    this.toEndPhase(true);
    this.events.onUpdate();
    return null;
  }

  skipBuy(playerId: string): string | null {
    if (this.current.id !== playerId || this.phase !== 'buy' || this.pendingTile === null) return 'Action impossible.';
    const tileIdx = this.pendingTile;
    this.pendingTile = null;
    if (this.settings.rules.auction) {
      this.startAuction(tileIdx);
    } else {
      this.log([this.pl(this.current), { t: 'text', text: 'n’achète pas' }, this.tl(tileIdx)]);
      this.toEndPhase(true);
    }
    this.events.onUpdate();
    return null;
  }

  bid(playerId: string, amount: number): string | null {
    if (this.phase !== 'auction' || !this.auction) return 'Aucune enchère en cours.';
    const p = this.player(playerId);
    if (!p || p.bankrupt) return 'Action impossible.';
    if (!Number.isInteger(amount) || amount <= this.auction.highestBid) return 'Enchère trop basse.';
    if (amount > p.cash) return 'Pas assez d’argent.';
    this.auction.highestBid = amount;
    this.auction.highestBidder = p.id;
    this.auction.endsAt = Date.now() + AUCTION_BUMP_MS;
    this.armAuctionTimer();
    this.events.onUpdate();
    return null;
  }

  private startAuction(tileIdx: number) {
    this.phase = 'auction';
    this.auction = { tile: tileIdx, highestBid: 0, highestBidder: null, endsAt: Date.now() + AUCTION_INITIAL_MS };
    this.log([{ t: 'text', text: 'Enchère lancée pour' }, this.tl(tileIdx)]);
    this.armAuctionTimer();
    // les bots misent
    for (const b of this.active().filter((x) => x.isBot)) this.scheduleBotBid(b.id);
  }

  private armAuctionTimer() {
    if (this.auctionTimer) clearTimeout(this.auctionTimer);
    if (!this.auction) return;
    this.auctionTimer = setTimeout(() => this.finishAuction(), this.auction.endsAt - Date.now() + 50);
  }

  private finishAuction() {
    if (!this.auction) return;
    const { tile, highestBid, highestBidder } = this.auction;
    this.auction = null;
    if (this.auctionTimer) { clearTimeout(this.auctionTimer); this.auctionTimer = null; }
    if (highestBidder) {
      const w = this.player(highestBidder)!;
      w.cash -= highestBid;
      this.ownership.set(tile, { owner: w.id, houses: 0, mortgaged: false });
      this.log([this.pl(w), { t: 'text', text: 'remporte l’enchère pour' }, this.tl(tile), { t: 'text', text: 'à' }, this.cash(highestBid)], 'auction', w.id);
    } else {
      this.log([{ t: 'text', text: 'Personne n’a enchéri pour' }, this.tl(tile)]);
    }
    this.toEndPhase(true);
    this.events.onUpdate();
  }

  build(playerId: string, tileIdx: number): string | null {
    const err = this.checkManage(playerId, tileIdx);
    if (err) return err;
    const t = this.tile(tileIdx);
    if (t.type !== 'property') return 'Constructions impossibles ici.';
    const o = this.ownership.get(tileIdx)!;
    const p = this.player(playerId)!;
    if (!this.ownsFullSet(playerId, t.group)) return 'Il faut posséder le groupe complet.';
    const groupIdx = this.groupTiles(t.group);
    if (groupIdx.some((i) => this.ownership.get(i)!.mortgaged)) return 'Groupe partiellement hypothéqué.';
    if (o.houses >= 5) return 'Hôtel déjà construit.';
    if (this.settings.rules.evenBuild) {
      const minHouses = Math.min(...groupIdx.map((i) => this.ownership.get(i)!.houses));
      if (o.houses > minHouses) return 'Construction équilibrée : construisez d’abord ailleurs dans le groupe.';
    }
    if (p.cash < t.houseCost) return 'Pas assez d’argent.';
    p.cash -= t.houseCost;
    o.houses++;
    this.log([this.pl(p), { t: 'text', text: o.houses === 5 ? 'construit un hôtel sur' : `construit une maison sur` }, this.tl(tileIdx)], 'build', p.id);
    this.events.onUpdate();
    return null;
  }

  sellHouse(playerId: string, tileIdx: number): string | null {
    const err = this.checkManage(playerId, tileIdx, true);
    if (err) return err;
    const t = this.tile(tileIdx);
    if (t.type !== 'property') return 'Rien à vendre ici.';
    const o = this.ownership.get(tileIdx)!;
    const p = this.player(playerId)!;
    if (o.houses <= 0) return 'Aucune construction.';
    if (this.settings.rules.evenBuild) {
      const maxHouses = Math.max(...this.groupTiles(t.group).map((i) => this.ownership.get(i)!.houses));
      if (o.houses < maxHouses) return 'Vente équilibrée : vendez d’abord ailleurs dans le groupe.';
    }
    o.houses--;
    const refund = Math.floor(t.houseCost / 2);
    p.cash += refund;
    this.log([this.pl(p), { t: 'text', text: 'revend une construction sur' }, this.tl(tileIdx), { t: 'text', text: 'pour' }, this.cash(refund)], 'sell', p.id);
    this.afterCashGain(p);
    this.events.onUpdate();
    return null;
  }

  mortgage(playerId: string, tileIdx: number): string | null {
    if (!this.settings.rules.mortgage) return 'Hypothèques désactivées.';
    const err = this.checkManage(playerId, tileIdx, true);
    if (err) return err;
    const t = this.tile(tileIdx);
    if (!('price' in t)) return 'Case non hypothécable.';
    const o = this.ownership.get(tileIdx)!;
    if (o.mortgaged) return 'Déjà hypothéquée.';
    if (t.type === 'property') {
      if (this.groupTiles(t.group).some((i) => this.ownership.get(i)!.houses > 0)) {
        return 'Vendez d’abord les constructions du groupe.';
      }
    }
    const p = this.player(playerId)!;
    o.mortgaged = true;
    const value = Math.floor(t.price / 2);
    p.cash += value;
    this.log([this.pl(p), { t: 'text', text: 'hypothèque' }, this.tl(tileIdx), { t: 'text', text: 'pour' }, this.cash(value)], 'mortgage', p.id);
    this.afterCashGain(p);
    this.events.onUpdate();
    return null;
  }

  unmortgage(playerId: string, tileIdx: number): string | null {
    if (!this.settings.rules.mortgage) return 'Hypothèques désactivées.';
    const err = this.checkManage(playerId, tileIdx);
    if (err) return err;
    const t = this.tile(tileIdx);
    if (!('price' in t)) return 'Case invalide.';
    const o = this.ownership.get(tileIdx)!;
    if (!o.mortgaged) return 'Pas hypothéquée.';
    const p = this.player(playerId)!;
    const cost = Math.ceil(t.price * 0.55); // 50 % + 10 % d'intérêts
    if (p.cash < cost) return 'Pas assez d’argent.';
    p.cash -= cost;
    o.mortgaged = false;
    this.log([this.pl(p), { t: 'text', text: 'lève l’hypothèque de' }, this.tl(tileIdx), { t: 'text', text: 'pour' }, this.cash(cost)], 'mortgage', p.id);
    this.events.onUpdate();
    return null;
  }

  /**
   * @param liquidation vente/hypothèque : autorisée hors de son tour uniquement
   *                    pour se renflouer quand on est à découvert.
   */
  private checkManage(playerId: string, tileIdx: number, liquidation = false): string | null {
    if (this.ended || !this.started) return 'Partie non active.';
    const p = this.player(playerId);
    if (!p || p.bankrupt) return 'Action impossible.';
    const o = this.ownership.get(tileIdx);
    if (o?.owner !== playerId) return 'Cette case ne vous appartient pas.';
    if (this.phase === 'auction') return 'Enchère en cours.';

    const myTurn = this.current.id === playerId;
    if (!myTurn) {
      // seul le renflouement d'urgence est permis quand ce n'est pas son tour
      if (!(liquidation && p.cash < 0)) return 'Attendez votre tour.';
    }
    if (this.phase === 'debt' && myTurn && !liquidation) {
      return 'Réglez d’abord votre dette.';
    }
    return null;
  }

  endTurn(playerId: string): string | null {
    if (this.current.id !== playerId) return "Ce n'est pas votre tour.";
    if (this.phase === 'debt') {
      if (this.current.cash < 0) return 'Votre solde est négatif : vendez, hypothéquez ou déclarez faillite.';
      this.phase = 'end';
    }
    if (this.phase !== 'end') return 'Terminez d’abord vos actions.';
    this.advanceTurn();
    this.events.onUpdate();
    return null;
  }

  declareBankrupt(playerId: string): string | null {
    const p = this.player(playerId);
    if (!p || p.bankrupt) return 'Action impossible.';
    this.bankrupt(p, this.debtCreditor ? this.player(this.debtCreditor) ?? null : null);
    this.events.onUpdate();
    return null;
  }

  /** Abandon (déconnexion définitive) : faillite au profit de la banque. */
  forfeit(playerId: string) {
    const p = this.player(playerId);
    if (!p || p.bankrupt || this.ended) return;
    this.log([this.pl(p), { t: 'text', text: 'abandonne la partie.' }]);
    this.bankrupt(p, null);
    this.events.onUpdate();
  }

  // ---------- Échanges ----------

  proposeTrade(from: string, to: string, offerCash: number, requestCash: number, offerProps: number[], requestProps: number[]): string | null {
    const error = this.validateTradeProposal(from, to, offerCash, requestCash, offerProps, requestProps);
    if (error) return error;
    const pFrom = this.player(from)!;
    const pTo = this.player(to)!;
    const trade: TradeOffer = {
      id: crypto.randomUUID(), from, to, offerCash, requestCash,
      offerProps: [...new Set(offerProps)], requestProps: [...new Set(requestProps)], status: 'pending',
    };
    this.trades.push(trade);
    this.log([this.pl(pFrom), { t: 'text', text: 'propose un échange à' }, this.pl(pTo)]);
    if (pTo.isBot) this.scheduleBotTradeResponse(trade.id);
    this.events.onUpdate();
    return null;
  }

  private validateTradeProposal(
    from: string,
    to: string,
    offerCash: number,
    requestCash: number,
    offerProps: number[],
    requestProps: number[],
  ): string | null {
    const pFrom = this.player(from);
    const pTo = this.player(to);
    if (!pFrom || !pTo || pFrom.bankrupt || pTo.bankrupt || from === to) return 'Échange impossible.';
    if (this.trades.filter((t) => t.status === 'pending' && t.from === from).length >= 3) return 'Trop d’échanges en attente.';
    if (!Number.isInteger(offerCash) || !Number.isInteger(requestCash) || offerCash < 0 || requestCash < 0) return 'Montant invalide.';
    if (offerCash > pFrom.cash) return 'Vous n’avez pas cet argent.';
    const offerSet = [...new Set(offerProps)];
    const requestSet = [...new Set(requestProps)];
    if (offerCash === 0 && requestCash === 0 && offerSet.length === 0 && requestSet.length === 0) return 'Échange vide.';
    return this.validateTradeProps(from, to, offerSet, requestSet);
  }

  private validateTradeProps(from: string, to: string, offerProps: number[], requestProps: number[]): string | null {
    for (const i of offerProps) {
      const o = this.ownership.get(i);
      if (o?.owner !== from) return 'Propriété invalide dans l’offre.';
      if (this.tile(i).type === 'property' && o.houses > 0) return 'Vendez les constructions avant d’échanger.';
    }
    for (const i of requestProps) {
      const o = this.ownership.get(i);
      if (o?.owner !== to) return 'Propriété invalide dans la demande.';
      if (this.tile(i).type === 'property' && o.houses > 0) return 'Cette propriété a des constructions.';
    }
    return null;
  }

  /** Valeur estimée d'une propriété aux yeux d'un bot. */
  private botPropValue(botId: string, tileIdx: number, acquiring: boolean): number {
    const t = this.tile(tileIdx);
    if (!('price' in t)) return 0;

    let value = t.price;
    if (t.type === 'property') {
      value = acquiring
        ? this.botAcquiringPropertyValue(botId, t.group, value)
        : this.botSellingPropertyValue(botId, t.group, value);
    }

    if (this.ownership.get(tileIdx)?.mortgaged) value *= 0.5;
    return value;
  }

  private botAcquiringPropertyValue(botId: string, group: string, value: number): number {
    const groupIdx = this.groupTiles(group);
    const ownedByBot = groupIdx.filter((i) => this.ownership.get(i)?.owner === botId).length;

    if (ownedByBot === groupIdx.length - 1) return value * 1.7;
    if (ownedByBot > 0) return value * 1.25;
    return value;
  }

  private botSellingPropertyValue(botId: string, group: string, value: number): number {
    const groupIdx = this.groupTiles(group);
    const ownedByBot = groupIdx.filter((i) => this.ownership.get(i)?.owner === botId).length;

    if (ownedByBot === groupIdx.length) value *= 2.2;
    else if (ownedByBot === groupIdx.length - 1) value *= 1.5;

    const others = groupIdx.filter((i) => {
      const o = this.ownership.get(i);
      return o?.owner !== botId;
    });
    if (others.length === groupIdx.length - 1) value *= 1.6;

    return value;
  }

  private scheduleBotTradeResponse(tradeId: string) {
    setTimeout(() => {
      const trade = this.trades.find((t) => t.id === tradeId && t.status === 'pending');
      if (!trade || this.ended) return;
      const bot = this.player(trade.to);
      if (bot?.bankrupt) return;
      if (!bot) return;
      const received = trade.offerCash + trade.offerProps.reduce((s, i) => s + this.botPropValue(bot.id, i, true), 0);
      const given = trade.requestCash + trade.requestProps.reduce((s, i) => s + this.botPropValue(bot.id, i, false), 0);
      const cashOk = trade.requestCash <= bot.cash - 100 || trade.requestCash === 0;
      const accept = cashOk && received >= given * 1.05;
      this.respondTrade(bot.id, tradeId, accept);
    }, 1500 + this.rng.int(2000));
  }

  respondTrade(playerId: string, tradeId: string, accept: boolean): string | null {
    const trade = this.trades.find((t) => t.id === tradeId && t.status === 'pending');
    if (!trade) return 'Échange introuvable.';
    if (trade.to !== playerId && !(trade.from === playerId && !accept)) return 'Action impossible.';
    if (trade.from === playerId && !accept) return this.cancelTrade(trade);
    if (!accept) return this.declineTrade(trade, playerId);
    return this.acceptTrade(trade);
  }

  private cancelTrade(trade: TradeOffer): null {
    trade.status = 'cancelled';
    this.events.onUpdate();
    return null;
  }

  private declineTrade(trade: TradeOffer, playerId: string): null {
    trade.status = 'declined';
    this.log([this.pl(this.player(playerId)!), { t: 'text', text: 'refuse l’échange.' }]);
    this.events.onUpdate();
    return null;
  }

  private acceptTrade(trade: TradeOffer): string | null {
    const pFrom = this.player(trade.from);
    const pTo = this.player(trade.to);
    if (pFrom?.bankrupt || pTo?.bankrupt || !pFrom || !pTo) return 'Échange impossible.';
    if (trade.offerCash > pFrom.cash || trade.requestCash > pTo.cash) return 'Fonds insuffisants.';
    for (const i of trade.offerProps) {
      const o = this.ownership.get(i);
      if (o?.owner !== trade.from) return 'Une propriété a changé de main.';
    }
    for (const i of trade.requestProps) {
      const o = this.ownership.get(i);
      if (o?.owner !== trade.to) return 'Une propriété a changé de main.';
    }
    pFrom.cash += trade.requestCash - trade.offerCash;
    pTo.cash += trade.offerCash - trade.requestCash;
    for (const i of trade.offerProps) this.ownership.get(i)!.owner = trade.to;
    for (const i of trade.requestProps) this.ownership.get(i)!.owner = trade.from;
    trade.status = 'accepted';
    this.log([this.pl(pFrom), { t: 'text', text: 'et' }, this.pl(pTo), { t: 'text', text: 'concluent un échange.' }], 'trade', pFrom.id);
    this.events.onUpdate();
    return null;
  }

  // ---------- Mécanique interne ----------

  /** Verse le salaire si la case Départ est franchie en avançant de `from` vers `to` (sens horaire). */
  private paySalaryIfCrossed(p: PlayerState, from: number, to: number, collect: boolean) {
    if (!collect) return;
    const distToStart = (this.startIndex - from + this.size) % this.size;
    const distTravel = (to - from + this.size) % this.size;
    if (distTravel === 0) return;
    if (distToStart > 0 && distTravel >= distToStart) {
      p.cash += SALARY;
      this.log([this.pl(p), { t: 'text', text: 'passe par la case Départ et reçoit' }, this.cash(SALARY)]);
    }
  }

  private moveBy(p: PlayerState, steps: number, collectStart: boolean) {
    const from = p.position;
    p.position = ((p.position + steps) % this.size + this.size) % this.size;
    if (steps > 0) this.paySalaryIfCrossed(p, from, p.position, collectStart);
    this.resolveTile(p);
  }

  private moveTo(p: PlayerState, dest: number, collectStart: boolean) {
    dest = ((dest % this.size) + this.size) % this.size;
    const from = p.position;
    p.position = dest;
    this.paySalaryIfCrossed(p, from, dest, collectStart);
    this.resolveTile(p);
  }

  private resolveTile(p: PlayerState) {
    const idx = p.position;
    const t = this.tile(idx);
    this.tileVisits.set(idx, (this.tileVisits.get(idx) ?? 0) + 1);

    switch (t.type) {
      case 'start':
        // le salaire a déjà été versé par moveBy/moveTo (le passage inclut l'arrivée)
        this.toEndPhase(true);
        break;
      case 'prison':
        this.log([this.pl(p), { t: 'text', text: 'rend visite à la prison.' }]);
        this.toEndPhase(true);
        break;
      case 'goto-prison':
        this.log([this.pl(p), { t: 'text', text: 'est envoyé en prison !' }], 'prison', p.id);
        this.sendToPrison(p);
        this.toEndPhase(false);
        break;
      case 'vacation': {
        p.onVacation = true;
        if (this.settings.rules.vacationCash && this.vacationPot > 0) {
          p.cash += this.vacationPot;
          this.log([this.pl(p), { t: 'text', text: 'part en vacances et empoche la cagnotte de' }, this.cash(this.vacationPot)]);
          this.vacationPot = 0;
        } else {
          this.log([this.pl(p), { t: 'text', text: 'part en vacances.' }]);
        }
        this.toEndPhase(false);
        break;
      }
      case 'tax': {
        const amount = t.percent ? Math.floor((p.cash * t.amount) / 100) : t.amount;
        this.log([this.pl(p), { t: 'text', text: `paye ${t.name.toLowerCase()} :` }, this.cash(amount)]);
        this.pay(p, amount, null);
        this.toEndPhase(true);
        break;
      }
      case 'treasure':
        this.drawCard(p, 'treasure');
        break;
      case 'surprise':
        this.drawCard(p, 'surprise');
        break;
      case 'property':
      case 'airport':
      case 'utility': {
        const o = this.ownership.get(idx);
        if (!o) {
          if (p.cash >= t.price || this.settings.rules.auction) {
            this.phase = 'buy';
            this.pendingTile = idx;
            this.maybeBot();
          } else {
            this.toEndPhase(true);
          }
        } else if (o.owner !== p.id) {
          this.chargeRent(p, idx, o);
          this.toEndPhase(true);
        } else {
          this.toEndPhase(true);
        }
        break;
      }
    }
  }

  private chargeRent(p: PlayerState, idx: number, o: Ownership) {
    const owner = this.player(o.owner);
    if (!owner || owner.bankrupt) return;
    if (o.mortgaged) return;
    if (this.settings.rules.noRentInPrison && owner.inPrison) {
      this.log([this.tl(idx), { t: 'text', text: ': pas de loyer,' }, this.pl(owner), { t: 'text', text: 'est en prison.' }]);
      return;
    }
    if (p.rentImmunity) {
      p.rentImmunity = false;
      this.log([this.pl(p), { t: 'text', text: 'est exempté de loyer sur' }, this.tl(idx)]);
      return;
    }
    const t = this.tile(idx);
    let rent = 0;
    if (t.type === 'property') {
      rent = t.rents[o.houses];
      if (o.houses === 0 && this.settings.rules.doubleRentFullSet && this.ownsFullSet(o.owner, t.group)) rent *= 2;
    } else if (t.type === 'airport') {
      const n = this.countType(o.owner, 'airport');
      rent = t.rents[Math.min(n - 1, t.rents.length - 1)];
    } else if (t.type === 'utility') {
      const n = this.countType(o.owner, 'utility');
      const mult = t.multipliers[Math.min(n - 1, t.multipliers.length - 1)];
      const diceSum = this.lastDice?.values.reduce((a, b) => a + b, 0) ?? 7;
      rent = mult * diceSum;
    }
    this.log([this.pl(p), { t: 'text', text: 'paye' }, this.cash(rent), { t: 'text', text: 'de loyer à' }, this.pl(owner), { t: 'text', text: 'pour' }, this.tl(idx)], 'rent', p.id);
    this.pay(p, rent, owner);
  }

  /** Paiement ; to=null → banque (cagnotte vacances si règle active). Gère la dette. */
  private pay(p: PlayerState, amount: number, to: PlayerState | null) {
    p.cash -= amount;
    if (to) {
      to.cash += amount;
      this.afterCashGain(to);
    } else if (this.settings.rules.vacationCash) {
      this.vacationPot += amount;
    }
    if (p.cash < 0) {
      this.debtCreditor = to?.id ?? null;
      if (this.netWorth(p.id) <= 0) {
        this.bankrupt(p, to);
      } else if (this.current.id === p.id) {
        this.phase = 'debt';
        this.log([this.pl(p), { t: 'text', text: 'a un solde négatif et doit se renflouer !' }]);
        this.maybeBot();
      } else {
        // dette hors tour (carte) : liquidation automatique
        this.autoLiquidate(p);
        if (p.cash < 0) this.bankrupt(p, to);
      }
    }
  }

  private afterCashGain(p: PlayerState) {
    if (this.phase === 'debt' && this.current.id === p.id && p.cash >= 0) {
      this.phase = 'end';
      this.debtCreditor = null;
      this.log([this.pl(p), { t: 'text', text: 'a réglé sa dette.' }]);
      this.maybeBot();
    }
  }

  private autoLiquidate(p: PlayerState) {
    // vend les maisons puis hypothèque jusqu'à solde >= 0
    let guard = 200;
    while (p.cash < 0 && guard-- > 0) {
      const withHouses = this.propsOf(p.id).filter((i) => (this.ownership.get(i)!.houses) > 0);
      if (withHouses.length > 0) {
        const i = withHouses[0];
        const t = this.tile(i);
        if (t.type === 'property') {
          this.ownership.get(i)!.houses--;
          p.cash += Math.floor(t.houseCost / 2);
          continue;
        }
      }
      const unmortgaged = this.propsOf(p.id).filter((i) => !this.ownership.get(i)!.mortgaged);
      if (unmortgaged.length > 0 && this.settings.rules.mortgage) {
        const i = unmortgaged[0];
        const t = this.tile(i);
        this.ownership.get(i)!.mortgaged = true;
        p.cash += Math.floor(('price' in t ? t.price : 0) / 2);
        continue;
      }
      break;
    }
  }

  private bankrupt(p: PlayerState, creditor: PlayerState | null) {
    p.bankrupt = true;
    this.debtCreditor = null;
    const props = this.propsOf(p.id);
    if (creditor && !creditor.bankrupt) {
      for (const i of props) {
        const o = this.ownership.get(i)!;
        o.owner = creditor.id;
        o.houses = 0;
      }
      if (p.cash > 0) creditor.cash += p.cash;
      creditor.jailCards += p.jailCards;
      this.log([this.pl(p), { t: 'text', text: 'fait faillite ! Ses biens reviennent à' }, this.pl(creditor)], 'bankrupt', p.id);
    } else {
      for (const i of props) this.ownership.delete(i);
      this.log([this.pl(p), { t: 'text', text: 'fait faillite ! Ses biens retournent à la banque.' }], 'bankrupt', p.id);
    }
    p.cash = 0;
    p.jailCards = 0;
    // annule ses échanges
    for (const tr of this.trades) {
      if (tr.status === 'pending' && (tr.from === p.id || tr.to === p.id)) tr.status = 'cancelled';
    }
    const remaining = this.active();
    if (remaining.length <= 1) {
      this.endGame(remaining[0] ?? null);
      return;
    }
    if (this.current.id === p.id) {
      this.phase = 'end';
      this.advanceTurn();
    }
  }

  private sendToPrison(p: PlayerState) {
    const idx = this.prisonIndex();
    // on publie d'abord la position actuelle : le client anime alors le trajet
    // jusqu'à la prison au lieu de téléporter le pion.
    this.events.onUpdate();
    p.inPrison = true;
    p.prisonTurns = 0;
    p.prisonVisits++;
    this.doublesCount = 0;
    if (idx >= 0) p.position = idx;
  }

  /** Tirage pondéré : le poids (1-10, défaut 1) contrôle la probabilité de chaque carte. */
  private weightedDraw(cards: Card[]): Card {
    const total = cards.reduce((s, c) => s + (c.weight ?? 1), 0);
    let r = this.rng.int(total);
    for (const c of cards) {
      r -= c.weight ?? 1;
      if (r < 0) return c;
    }
    return cards.at(-1)!;
  }

  private drawCard(p: PlayerState, deck: 'treasure' | 'surprise') {
    const cards = deck === 'treasure' ? this.treasureDeck : this.surpriseDeck;
    if (cards.length === 0) { this.toEndPhase(true); return; }
    const card = this.weightedDraw(cards);
    this.events.onCard(p.id, deck, card.text);
    this.log([this.pl(p), { t: 'text', text: `tire une carte ${deck === 'treasure' ? 'Trésor' : 'Surprise'} : ${card.text}` }], 'card', p.id);
    this.applyCard(p, card);
  }

  private applyCard(p: PlayerState, card: Card): void {
    const a = card.action;
    switch (a.kind) {
      case 'gain': return this.applyGainCard(p, a.amount);
      case 'pay': return this.applyPayCard(p, a.amount);
      case 'gain-each': return this.applyGainEachCard(p, a.amount);
      case 'pay-each': return this.applyPayEachCard(p, a.amount);
      case 'goto': return this.moveTo(p, a.tile, true);
      case 'goto-start': return this.moveTo(p, this.startIndex, true);
      case 'move': return this.moveBy(p, a.steps, false);
      case 'goto-prison': return this.applyGotoPrisonCard(p);
      case 'jail-card': return this.applyJailCard(p);
      case 'repairs': return this.applyRepairsCard(p, a.perHouse, a.perHotel);
      case 'steal-cash': return this.applyStealCashCard(p, a.amount);
      case 'pay-percent': return this.applyPayPercentCard(p, a.percent);
      case 'gain-per-building': return this.applyGainPerBuildingCard(p, a.perHouse, a.perHotel);
      case 'goto-nearest': return this.applyGotoNearestCard(p, a.target);
      case 'skip-turn': return this.applySkipTurnCard(p);
      case 'extra-turn': return this.applyExtraTurnCard(p);
      case 'swap-position': return this.applySwapPositionCard(p);
      case 'teleport-random': return this.applyTeleportRandomCard(p);
      case 'goto-vacation': return this.applyGotoVacationCard(p);
      case 'gain-per-property': return this.applyGainPerPropertyCard(p, a.amount);
      case 'pay-per-property': return this.applyPayPerPropertyCard(p, a.amount);
      case 'free-house': return this.applyFreeHouseCard(p);
      case 'demolish': return this.applyDemolishCard(p);
      case 'rent-immunity': return this.applyRentImmunityCard(p);
      case 'steal-jail-card': return this.applyStealJailCard(p);
      case 'steal-property': return this.applyStealPropertyCard(p);
    }
  }

  private applyGainCard(p: PlayerState, amount: number): void {
    p.cash += amount;
    this.toEndPhase(true);
  }

  private applyPayCard(p: PlayerState, amount: number): void {
    this.pay(p, amount, null);
    this.toEndPhase(true);
  }

  private applyGainEachCard(p: PlayerState, amount: number): void {
    for (const other of this.active()) {
      if (other.id === p.id) continue;
      const transfer = Math.min(other.cash, amount);
      other.cash -= transfer;
      p.cash += transfer;
    }
    this.toEndPhase(true);
  }

  private applyPayEachCard(p: PlayerState, amount: number): void {
    for (const other of this.active()) {
      if (other.id === p.id) continue;
      this.pay(p, amount, other);
      if (p.bankrupt) break;
    }
    this.toEndPhase(true);
  }

  private applyGotoPrisonCard(p: PlayerState): void {
    this.sendToPrison(p);
    this.toEndPhase(false);
  }

  private applyJailCard(p: PlayerState): void {
    p.jailCards++;
    this.toEndPhase(true);
  }

  private calculateBuildingCardAmount(
    p: PlayerState,
    perHouse: number,
    perHotel: number,
  ): number {
    return this.propsOf(p.id).reduce((total, i) => {
      const houses = this.ownership.get(i)?.houses ?? 0;
      return total + (houses === 5 ? perHotel : houses * perHouse);
    }, 0);
  }

  private applyRepairsCard(p: PlayerState, perHouse: number, perHotel: number): void {
    const total = this.calculateBuildingCardAmount(p, perHouse, perHotel);
    if (total > 0) this.pay(p, total, null);
    this.toEndPhase(true);
  }

  private applyStealCashCard(p: PlayerState, amount: number): void {
    const targets = this.active().filter((x) => x.id !== p.id && x.cash > 0);
    if (targets.length > 0) {
      const victim = targets[this.rng.int(targets.length)];
      const stolen = Math.min(victim.cash, amount);
      victim.cash -= stolen;
      p.cash += stolen;
      this.log([
        this.pl(p), { t: 'text', text: 'vole' }, this.cash(stolen),
        { t: 'text', text: 'à' }, this.pl(victim),
      ]);
    }
    this.toEndPhase(true);
  }

  private applyPayPercentCard(p: PlayerState, percent: number): void {
    const amount = Math.max(0, Math.floor((p.cash * percent) / 100));
    if (amount > 0) this.pay(p, amount, null);
    this.toEndPhase(true);
  }

  private applyGainPerBuildingCard(p: PlayerState, perHouse: number, perHotel: number): void {
    const total = this.calculateBuildingCardAmount(p, perHouse, perHotel);
    if (total > 0) p.cash += total;
    this.toEndPhase(true);
  }

  private findNearestTile(position: number, target: Tile['type']): number {
    for (let distance = 1; distance <= this.size; distance++) {
      const idx = (position + distance) % this.size;
      if (this.tile(idx).type === target) return idx;
    }
    return -1;
  }

  private applyGotoNearestCard(p: PlayerState, target: Tile['type']): void {
    const destination = this.findNearestTile(p.position, target);
    if (destination >= 0) this.moveTo(p, destination, true);
    else this.toEndPhase(true);
  }

  private applySkipTurnCard(p: PlayerState): void {
    p.onVacation = true;
    this.toEndPhase(false);
  }

  private applyExtraTurnCard(p: PlayerState): void {
    this.extraTurn = true;
    this.toEndPhase(true);
  }

  private applySwapPositionCard(p: PlayerState): void {
    const others = this.active().filter((x) => x.id !== p.id && !x.inPrison);
    if (others.length === 0) {
      this.toEndPhase(true);
      return;
    }

    const other = others[this.rng.int(others.length)];
    const mine = p.position;
    p.position = other.position;
    other.position = mine;
    this.log([this.pl(p), { t: 'text', text: 'échange sa place avec' }, this.pl(other)]);
    this.resolveTile(p);
  }

  private applyTeleportRandomCard(p: PlayerState): void {
    const destination = this.rng.int(this.size);
    this.log([
      this.pl(p), { t: 'text', text: 'est propulsé au hasard vers' }, this.tl(destination),
    ]);
    this.moveTo(p, destination, false);
  }

  private applyGotoVacationCard(p: PlayerState): void {
    const idx = this.board.tiles.findIndex((t) => t.type === 'vacation');
    if (idx >= 0) this.moveTo(p, idx, false);
    else this.toEndPhase(true);
  }

  private applyGainPerPropertyCard(p: PlayerState, amount: number): void {
    const count = this.propsOf(p.id).length;
    if (count > 0) p.cash += count * amount;
    this.toEndPhase(true);
  }

  private applyPayPerPropertyCard(p: PlayerState, amount: number): void {
    const count = this.propsOf(p.id).length;
    if (count > 0) this.pay(p, count * amount, null);
    this.toEndPhase(true);
  }

  private applyFreeHouseCard(p: PlayerState): void {
    const eligible = this.propsOf(p.id).filter((i) => {
      const t = this.tile(i);
      const o = this.ownership.get(i);
      return t.type === 'property' && !!o && !o.mortgaged && o.houses < 5 && this.ownsFullSet(p.id, t.group);
    });

    if (eligible.length > 0) {
      eligible.sort((x, y) => (this.ownership.get(x)?.houses ?? 0) - (this.ownership.get(y)?.houses ?? 0));
      const idx = eligible[0];
      const ownership = this.ownership.get(idx);
      if (ownership) ownership.houses++;
      this.log([this.pl(p), { t: 'text', text: 'reçoit une construction gratuite sur' }, this.tl(idx)]);
    } else {
      this.log([this.pl(p), { t: 'text', text: 'aurait reçu une maison… mais n’a aucun groupe complet.' }]);
    }
    this.toEndPhase(true);
  }

  private applyDemolishCard(p: PlayerState): void {
    const built = this.propsOf(p.id).filter((i) => (this.ownership.get(i)?.houses ?? 0) > 0);
    if (built.length > 0) {
      const idx = built[this.rng.int(built.length)];
      const ownership = this.ownership.get(idx);
      if (ownership) ownership.houses--;
      this.log([this.pl(p), { t: 'text', text: 'perd une construction sur' }, this.tl(idx)]);
    }
    this.toEndPhase(true);
  }

  private applyRentImmunityCard(p: PlayerState): void {
    p.rentImmunity = true;
    this.log([this.pl(p), { t: 'text', text: 'ne paiera pas son prochain loyer.' }]);
    this.toEndPhase(true);
  }

  private applyStealJailCard(p: PlayerState): void {
    const holder = this.active().find((x) => x.id !== p.id && x.jailCards > 0);
    if (holder) {
      holder.jailCards--;
      p.jailCards++;
      this.log([
        this.pl(p), { t: 'text', text: 'subtilise une carte « Sortie de prison » à' }, this.pl(holder),
      ]);
    }
    this.toEndPhase(true);
  }

  private applyStealPropertyCard(p: PlayerState): void {
    const stealable = this.ownershipEntriesWithoutBuildings(p.id);
    if (stealable.length === 0) {
      this.log([
        this.pl(p),
        { t: 'text', text: 'voulait voler une propriété… mais il n’y a rien à voler.' },
      ]);
      this.toEndPhase(true);
      return;
    }

    const idx = stealable[this.rng.int(stealable.length)];
    const ownership = this.ownership.get(idx);
    const victim = ownership ? this.player(ownership.owner) : undefined;
    if (!ownership || !victim) {
      this.toEndPhase(true);
      return;
    }

    ownership.owner = p.id;
    this.log([
      this.pl(p), { t: 'text', text: 'vole' }, this.tl(idx),
      { t: 'text', text: 'à' }, this.pl(victim),
    ]);
    this.toEndPhase(true);
  }

  private ownershipEntriesWithoutBuildings(playerId: string): number[] {
    const result: number[] = [];
    for (const [idx, ownership] of this.ownership) {
      if (ownership.owner === playerId || ownership.houses !== 0) continue;
      const owner = this.player(ownership.owner);
      if (owner && !owner.bankrupt) result.push(idx);
    }
    return result;
  }

  private toEndPhase(_normal: boolean) {
    if (this.ended) return;
    if (this.phase !== 'debt') this.phase = 'end';
    this.maybeBot();
  }

  private advanceTurn() {
    if (this.ended) return;
    this.turnNumber++;
    this.recordNetWorth();
    // l'état est revalidé à chaque tour : une incohérence ne peut pas s'installer
    this.checkInvariants();

    const diceWord = this.settings.dice.count >= 3 ? 'triple' : 'double';
    const wasDouble = ((this.lastDice?.isDouble ?? false) && !this.noReplay) || this.extraTurn;
    const replayMsg = this.extraTurn ? 'rejoue grâce à sa carte !' : `a fait un ${diceWord} et rejoue !`;
    this.extraTurn = false;
    this.noReplay = false;
    const p = this.current;
    if (wasDouble && !p.inPrison && !p.bankrupt && !p.onVacation) {
      this.phase = 'roll';
      this.lastDice = null;
      this.log([this.pl(p), { t: 'text', text: replayMsg }]);
      this.maybeBot();
      return;
    }
    this.doublesCount = 0;
    this.lastDice = null;

    let guard = this.players.length * 2 + 2;
    do {
      this.currentIdx = (this.currentIdx + 1) % this.players.length;
      const next = this.players[this.currentIdx];
      if (next.bankrupt) continue;
      if (next.onVacation) {
        next.onVacation = false;
        this.log([this.pl(next), { t: 'text', text: 'passe son tour : vacances bien méritées.' }]);
        continue;
      }
      break;
    } while (guard-- > 0);

    this.phase = 'roll';
    this.maybeBot();
  }

  private recordNetWorth() {
    for (const p of this.players) {
      if (p.netWorthHistory.length < 2000) p.netWorthHistory.push(this.netWorth(p.id));
    }
  }

  private endGame(winner: PlayerState | null) {
    if (this.ended) return;
    this.ended = true;
    this.winner = winner?.id ?? null;
    if (this.auctionTimer) { clearTimeout(this.auctionTimer); this.auctionTimer = null; }
    if (winner) this.log([{ t: 'text', text: '🏆' }, this.pl(winner), { t: 'text', text: 'remporte la partie !' }], 'end', winner.id);

    let mostVisited: string | null = null;
    let best = -1;
    for (const [idx, n] of this.tileVisits) {
      const t = this.tile(idx);
      if (('price' in t) && n > best) { best = n; mostVisited = t.name; }
    }
    let prisonKing: string | null = null;
    let bestPv = 0;
    for (const p of this.players) {
      if (p.prisonVisits > bestPv) { bestPv = p.prisonVisits; prisonKing = `${p.name} (${p.prisonVisits})`; }
    }
    const netWorthHistory: Record<string, number[]> = {};
    for (const p of this.players) netWorthHistory[p.name] = p.netWorthHistory;

    this.events.onEnded({
      winnerId: winner && !winner.isBot ? winner.id : null,
      winnerName: winner?.name ?? '—',
      boardName: this.board.name,
      startedAt: this.startedAt,
      durationS: Math.round((Date.now() - this.startedAt.getTime()) / 1000),
      turns: this.turnNumber,
      doubles: this.doublesTotal,
      mostVisited,
      prisonKing,
      netWorthHistory,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, avatar: p.avatar, isBot: p.isBot, won: p.id === this.winner,
      })),
    });
    this.events.onUpdate();
  }

  // ---------- Bots ----------

  private botTimer: ReturnType<typeof setTimeout> | null = null;

  private maybeBot() {
    if (this.ended) return;
    const p = this.current;
    if (!p?.isBot) return;
    if (this.botTimer) clearTimeout(this.botTimer);
    this.botTimer = setTimeout(() => this.botAct(), 1200 + this.rng.int(1200));
  }

  private botAct(): void {
    if (this.ended) return;
    const p = this.current;
    if (!p?.isBot) return;

    switch (this.phase) {
      case 'roll':
        this.botRoll(p);
        break;
      case 'buy':
        this.botBuy(p);
        break;
      case 'debt':
        this.botDebt(p);
        break;
      case 'end':
        this.botEnd(p);
        break;
      default:
        break;
    }
  }

  private botRoll(p: PlayerState): void {
    if (p.inPrison && p.jailCards > 0) {
      this.useJailCard(p.id);
      this.roll(p.id);
      return;
    }
    if (p.inPrison && p.cash > 400) {
      this.payBail(p.id);
      this.roll(p.id);
      return;
    }
    this.roll(p.id);
  }

  private botBuy(p: PlayerState): void {
    const tile = this.pendingTile !== null ? this.tile(this.pendingTile) : null;
    if (tile && 'price' in tile && p.cash - tile.price >= 150) {
      this.buy(p.id);
      return;
    }
    this.skipBuy(p.id);
  }

  private botDebt(p: PlayerState): void {
    this.autoLiquidate(p);
    if (p.cash < 0) {
      this.declareBankrupt(p.id);
      return;
    }
    this.afterCashGain(p);
    this.endTurn(p.id);
  }

  private botEnd(p: PlayerState): void {
    this.botBuild(p);
    this.endTurn(p.id);
  }

  private botBuild(p: PlayerState) {
    let guard = 20;
    while (guard-- > 0) {
      const buildable = this.propsOf(p.id).filter((i) => {
        const t = this.tile(i);
        return t.type === 'property' && this.ownsFullSet(p.id, t.group)
          && this.ownership.get(i)!.houses < 5 && p.cash - t.houseCost >= 300;
      });
      if (buildable.length === 0) return;
      const before = p.cash;
      for (const i of buildable) {
        if (this.build(p.id, i) === null) break;
      }
      if (p.cash === before) return;
    }
  }

  private scheduleBotBid(botId: string) {
    const b = this.player(botId);
    if (!b || !this.auction) return;
    setTimeout(() => {
      if (!this.auction || this.phase !== 'auction') return;
      const t = this.tile(this.auction.tile);
      if (!('price' in t)) return;
      const maxBid = Math.min(Math.floor(t.price * 0.8), b.cash - 150);
      const next = this.auction.highestBid + 10;
      if (next <= maxBid && this.auction.highestBidder !== botId && this.rng.int(4) < 3) {
        this.bid(botId, next);
        this.scheduleBotBid(botId);
      }
    }, 1000 + this.rng.int(2500));
  }

  dispose() {
    if (this.auctionTimer) clearTimeout(this.auctionTimer);
    if (this.botTimer) clearTimeout(this.botTimer);
  }
}

// ---------- utilitaires ----------

/** Mélange de Fisher-Yates alimenté par le tirage vérifiable de la partie. */
function shuffle<T>(arr: T[], rng: SeededRng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildDeck(mode: 'predefined' | 'custom' | 'mix', predefined: Card[], custom: Card[]): Card[] {
  if (mode === 'custom' && custom.length > 0) return custom;
  if (mode === 'mix') return [...predefined, ...custom];
  return predefined;
}