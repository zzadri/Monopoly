// ---------- Plateau ----------

export type TileType =
  | 'start'
  | 'property'
  | 'airport'
  | 'utility'
  | 'tax'
  | 'treasure'
  | 'surprise'
  | 'prison'
  | 'goto-prison'
  | 'vacation';

export interface GroupDef {
  id: string;
  name: string;
  color: string; // couleur CSS
  flag?: string; // code ISO (ex. 'fr') ou emoji drapeau
  image?: string; // image personnalisée (data URL, petite taille)
}

export interface BaseTile {
  type: TileType;
  name: string;
}

export interface PropertyTile extends BaseTile {
  type: 'property';
  group: string;
  price: number;
  /** loyers : [terrain nu, 1 maison, 2, 3, 4, hôtel] */
  rents: [number, number, number, number, number, number];
  houseCost: number;
}

export interface AirportTile extends BaseTile {
  type: 'airport';
  price: number;
  /** loyers selon nombre d'aéroports possédés (1 à 4+) */
  rents: number[];
}

export interface UtilityTile extends BaseTile {
  type: 'utility';
  price: number;
  /** multiplicateurs du jet de dés selon nb de compagnies (1 à 2+) */
  multipliers: number[];
  icon?: string;
}

export interface TaxTile extends BaseTile {
  type: 'tax';
  /** montant fixe, ou pourcentage du cash si percent=true */
  amount: number;
  percent?: boolean;
}

export interface SimpleTile extends BaseTile {
  type: 'start' | 'treasure' | 'surprise' | 'prison' | 'goto-prison' | 'vacation';
}

export type Tile = PropertyTile | AirportTile | UtilityTile | TaxTile | SimpleTile;

// ---------- Cartes ----------

export type CardAction =
  | { kind: 'gain'; amount: number }
  | { kind: 'pay'; amount: number }
  | { kind: 'gain-each'; amount: number }
  | { kind: 'pay-each'; amount: number }
  | { kind: 'goto'; tile: number } // avance jusqu'à la case (salaire si Départ franchi)
  | { kind: 'goto-start' } // avance jusqu'à la case Départ
  | { kind: 'move'; steps: number } // relatif, peut être négatif
  | { kind: 'goto-prison' }
  | { kind: 'jail-card' }
  | { kind: 'repairs'; perHouse: number; perHotel: number }
  | { kind: 'steal-cash'; amount: number } // vole à un joueur au hasard
  | { kind: 'pay-percent'; percent: number }
  | { kind: 'gain-per-building'; perHouse: number; perHotel: number }
  | { kind: 'goto-nearest'; target: 'airport' | 'utility' }
  | { kind: 'skip-turn' }
  | { kind: 'extra-turn' }
  | { kind: 'steal-property' } // vole une propriété (sans construction) à un joueur au hasard
  // --- événements additionnels, disponibles uniquement dans l'éditeur ---
  | { kind: 'swap-position' } // échange sa case avec un joueur au hasard
  | { kind: 'teleport-random' } // atterrit sur une case tirée au sort
  | { kind: 'goto-vacation' } // file directement en vacances
  | { kind: 'gain-per-property'; amount: number } // reçoit par propriété possédée
  | { kind: 'pay-per-property'; amount: number } // paye par propriété possédée
  | { kind: 'free-house' } // une maison offerte sur un groupe complet
  | { kind: 'demolish' } // perd une construction au hasard
  | { kind: 'rent-immunity' } // prochain loyer offert
  | { kind: 'steal-jail-card' }; // subtilise une carte « Sortie de prison »

export interface Card {
  id: string;
  text: string;
  action: CardAction;
  /** poids de tirage (1 à 10, défaut 1) — plus le poids est haut, plus la carte sort souvent */
  weight?: number;
}

export type DeckMode = 'predefined' | 'custom' | 'mix';

// ---------- Carte de jeu (map) ----------

export interface BoardDef {
  id: string;
  name: string;
  description?: string;
  icon: string; // emoji
  /** dimensions de la grille — le périmètre fait 2*(cols+rows)-4 cases */
  cols: number;
  rows: number;
  groups: GroupDef[];
  tiles: Tile[];
  treasureMode: DeckMode;
  surpriseMode: DeckMode;
  customTreasure: Card[];
  customSurprise: Card[];
}

export function perimeterSize(cols: number, rows: number): number {
  return 2 * (cols + rows) - 4;
}

// ---------- Paramètres de partie ----------

export interface DiceSettings {
  count: 1 | 2 | 3;
  sides: 6 | 10 | 20;
}

export interface GameRules {
  doubleRentFullSet: boolean;
  vacationCash: boolean;
  auction: boolean;
  noRentInPrison: boolean;
  mortgage: boolean;
  evenBuild: boolean;
  randomizeOrder: boolean;
}

export interface GameSettings {
  maxPlayers: number; // 2..8
  isPrivate: boolean;
  allowBots: boolean;
  boardId: string;
  startingCash: 500 | 1000 | 1500 | 2000 | 3000;
  dice: DiceSettings;
  rules: GameRules;
}

export const DEFAULT_SETTINGS: GameSettings = {
  maxPlayers: 4,
  isPrivate: false,
  allowBots: false,
  boardId: 'classic',
  startingCash: 1500,
  dice: { count: 2, sides: 6 },
  rules: {
    doubleRentFullSet: true,
    vacationCash: true,
    auction: false,
    noRentInPrison: false,
    mortgage: true,
    evenBuild: true,
    randomizeOrder: true,
  },
};

// ---------- État de partie (vue client) ----------

export type TurnPhase =
  | 'roll' // le joueur courant doit lancer
  | 'buy' // décision achat / enchère
  | 'auction'
  | 'debt' // cash négatif : vendre/hypothéquer ou faillite
  | 'end'; // peut finir son tour

export interface PlayerView {
  id: string; // user id ou bot id
  name: string;
  avatar: string;
  color: string;
  cash: number;
  position: number;
  inPrison: boolean;
  prisonTurns: number;
  jailCards: number;
  bankrupt: boolean;
  connected: boolean;
  isBot: boolean;
  onVacation: boolean;
  /** prochain loyer offert (carte « immunité ») */
  rentImmunity: boolean;
}

export interface OwnershipView {
  owner: string;
  houses: number; // 0..4, 5 = hôtel
  mortgaged: boolean;
}

export interface AuctionView {
  tile: number;
  highestBid: number;
  highestBidder: string | null;
  endsAt: number; // timestamp ms
}

export interface TradeOffer {
  id: string;
  from: string;
  to: string;
  offerCash: number;
  requestCash: number;
  offerProps: number[]; // indices de cases
  requestProps: number[];
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
}

export interface DiceResult {
  values: number[];
  isDouble: boolean;
}

export interface GameStateView {
  roomId: string;
  boardId: string;
  board?: BoardDef; // envoyé une fois au join
  settings: GameSettings;
  players: PlayerView[];
  ownership: Record<number, OwnershipView>;
  currentPlayer: string;
  phase: TurnPhase;
  lastDice: DiceResult | null;
  doublesCount: number;
  vacationPot: number;
  pendingTile: number | null; // case en attente de décision d'achat
  auction: AuctionView | null;
  trades: TradeOffer[];
  turnNumber: number;
  started: boolean;
  ended: boolean;
  winner: string | null;
}

export interface LogEntry {
  id: number;
  ts: number;
  parts: LogPart[];
}

export type LogPart =
  | { t: 'text'; text: string }
  | { t: 'player'; id: string; name: string; avatar: string; color: string }
  | { t: 'tile'; index: number; name: string }
  | { t: 'cash'; amount: number };

export interface ChatMessage {
  id: number;
  from: { id: string; name: string; avatar: string; color: string };
  text: string;
  ts: number;
}

// ---------- Salons ----------

export interface RoomSummary {
  id: string;
  name: string;
  hostName: string;
  boardName: string;
  boardIcon: string;
  players: number;
  maxPlayers: number;
  started: boolean;
}

export interface RoomMember {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isHost: boolean;
  isBot: boolean;
  connected: boolean;
}

export interface RoomView {
  id: string;
  hostId: string;
  settings: GameSettings;
  members: RoomMember[];
  started: boolean;
  boardName: string;
  boardIcon: string;
}

// ---------- Profil / stats ----------

export interface UserProfile {
  id: string;
  username: string;
  avatar: string;
  createdAt: string;
  games: number;
  wins: number;
  losses: number;
  xp: number;
  level: number;
  /** progression dans le niveau courant, 0 → 1 */
  levelProgress: number;
  xpForNextLevel: number;
  playTimeS: number;
  winStreak: number;
  bestStreak: number;
  /** parties contre des bots : comptabilisées à part, sans effet sur le ratio */
  botGames: number;
  botWins: number;
}

// ---------- Niveaux / expérience ----------

/** XP cumulée nécessaire pour atteindre un niveau (courbe triangulaire douce). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return (100 * (l - 1) * l) / 2;
}

export function levelFromXp(xp: number): number {
  const safe = Math.max(0, xp);
  // inverse de xpForLevel : résout 100·(L-1)·L/2 ≤ xp
  return Math.floor((1 + Math.sqrt(1 + (8 * safe) / 100)) / 2);
}

/** XP gagnée par le vainqueur d'une partie classée. */
export function winnerXp(opts: { humanOpponents: number; durationS: number; turns: number }): number {
  const base = 100;
  const opponents = Math.max(0, opts.humanOpponents) * 25;
  const length = Math.min(100, Math.floor(opts.durationS / 60) * 2 + Math.floor(opts.turns / 20));
  return base + opponents + length;
}

/** Les perdants reçoivent 10 % de l'XP du vainqueur (demande : consolation). */
export function loserXp(winnerXpValue: number): number {
  return Math.max(1, Math.round(winnerXpValue * 0.1));
}

// ---------- Statistiques détaillées par joueur ----------

export interface PlayerStats {
  cashStart: number;
  cashEnd: number;
  cashMax: number;
  netWorthMax: number;
  /** total encaissé / dépensé sur la partie */
  earned: number;
  spent: number;
  rentPaidCount: number;
  rentPaidAmount: number;
  rentEarnedCount: number;
  rentEarnedAmount: number;
  biggestRentPaid: number;
  biggestRentEarned: number;
  propsBought: number;
  propsLost: number;
  propsMortgaged: number;
  auctionsWon: number;
  housesBuilt: number;
  hotelsBuilt: number;
  startPasses: number;
  doubles: number;
  prisonVisits: number;
  prisonTurns: number;
  treasureCards: number;
  surpriseCards: number;
  taxesPaid: number;
  tradesAccepted: number;
  /** propriété qui lui a rapporté le plus de loyers */
  bestProperty: string | null;
  bestPropertyAmount: number;
  /** joueur à qui il a versé le plus d'argent */
  nemesis: string | null;
  nemesisAmount: number;
}

export function emptyStats(cashStart: number): PlayerStats {
  return {
    cashStart, cashEnd: cashStart, cashMax: cashStart, netWorthMax: cashStart,
    earned: 0, spent: 0,
    rentPaidCount: 0, rentPaidAmount: 0, rentEarnedCount: 0, rentEarnedAmount: 0,
    biggestRentPaid: 0, biggestRentEarned: 0,
    propsBought: 0, propsLost: 0, propsMortgaged: 0, auctionsWon: 0,
    housesBuilt: 0, hotelsBuilt: 0, startPasses: 0, doubles: 0,
    prisonVisits: 0, prisonTurns: 0, treasureCards: 0, surpriseCards: 0,
    taxesPaid: 0, tradesAccepted: 0,
    bestProperty: null, bestPropertyAmount: 0, nemesis: null, nemesisAmount: 0,
  };
}

/** Titre décerné en fin de partie, à la manière d'une distinction. */
export interface PlayerTitle {
  id: string;
  label: string;
  detail: string;
  /** rareté indicative, sert à la mise en forme */
  tone: 'gold' | 'brand' | 'green' | 'red';
}

/**
 * Décerne les titres d'une partie. Chaque joueur peut en cumuler plusieurs ;
 * les conditions sont volontairement lisibles pour rester explicables.
 */
export function computeTitles(
  stats: PlayerStats,
  ctx: { durationS: number; turns: number; won: boolean; playerCount: number },
): PlayerTitle[] {
  const titles: PlayerTitle[] = [];
  const income = stats.earned || 1;
  const rentShare = stats.rentEarnedAmount / income;

  if (rentShare >= 0.6 && stats.rentEarnedAmount > 0) {
    titles.push({
      id: 'magnat', label: 'Magnat de l’immobilier', tone: 'gold',
      detail: `${Math.round(rentShare * 100)} % de vos revenus proviennent des loyers.`,
    });
  }
  if (ctx.won && ctx.durationS < 600) {
    titles.push({
      id: 'flash', label: 'Flash', tone: 'brand',
      detail: `Victoire en ${Math.floor(ctx.durationS / 60)} min ${ctx.durationS % 60} s.`,
    });
  }
  if (stats.propsBought >= 10) {
    titles.push({
      id: 'collectionneur', label: 'Collectionneur', tone: 'green',
      detail: `${stats.propsBought} propriétés achetées.`,
    });
  }
  if (stats.hotelsBuilt >= 3) {
    titles.push({
      id: 'hotelier', label: 'Hôtelier', tone: 'gold',
      detail: `${stats.hotelsBuilt} hôtels construits.`,
    });
  }
  if (stats.prisonTurns >= 6) {
    titles.push({
      id: 'taulard', label: 'Habitué des barreaux', tone: 'red',
      detail: `${stats.prisonTurns} tours passés en prison.`,
    });
  }
  if (stats.doubles >= 8) {
    titles.push({
      id: 'chanceux', label: 'Main chaude', tone: 'brand',
      detail: `${stats.doubles} doubles réussis.`,
    });
  }
  if (stats.rentPaidAmount > stats.rentEarnedAmount * 2 && stats.rentPaidAmount > 500) {
    titles.push({
      id: 'locataire', label: 'Éternel locataire', tone: 'red',
      detail: `${stats.rentPaidAmount} $ de loyers versés, pour seulement ${stats.rentEarnedAmount} $ encaissés.`,
    });
  }
  if (stats.biggestRentEarned >= 500) {
    titles.push({
      id: 'racket', label: 'Coup de massue', tone: 'gold',
      detail: `Un seul loyer vous a rapporté ${stats.biggestRentEarned} $.`,
    });
  }
  if (stats.netWorthMax >= stats.cashStart * 4) {
    titles.push({
      id: 'investisseur', label: 'Investisseur avisé', tone: 'green',
      detail: `Patrimoine maximal de ${stats.netWorthMax} $.`,
    });
  }
  if (stats.startPasses >= 8) {
    titles.push({
      id: 'globetrotter', label: 'Globe-trotteur', tone: 'brand',
      detail: `${stats.startPasses} passages par la case Départ.`,
    });
  }
  if (stats.tradesAccepted >= 3) {
    titles.push({
      id: 'negociateur', label: 'Négociateur', tone: 'green',
      detail: `${stats.tradesAccepted} échanges conclus.`,
    });
  }
  if (stats.propsMortgaged >= 4) {
    titles.push({
      id: 'endette', label: 'Sur la corde raide', tone: 'red',
      detail: `${stats.propsMortgaged} hypothèques contractées.`,
    });
  }
  if (ctx.won && stats.rentPaidCount === 0) {
    titles.push({
      id: 'intouchable', label: 'Intouchable', tone: 'gold',
      detail: 'Victoire sans avoir versé le moindre loyer.',
    });
  }
  if (stats.treasureCards + stats.surpriseCards >= 10) {
    titles.push({
      id: 'cartomancien', label: 'Cartomancien', tone: 'brand',
      detail: `${stats.treasureCards + stats.surpriseCards} cartes tirées.`,
    });
  }
  return titles;
}

// ---------- Intégrité des parties ----------

export type IntegrityStatus = 'verified' | 'partial' | 'ineligible';

export interface IntegrityAnomaly {
  code: string;
  detail: string;
  playerId: string | null;
  at: number;
}

export interface IntegrityReport {
  score: number;
  status: IntegrityStatus;
  /** seed publié en fin de partie : permet de rejouer et vérifier les dés */
  seed: string | null;
  seedHash: string;
  draws: number;
  anomalies: IntegrityAnomaly[];
}

export const INTEGRITY_LABELS: Record<IntegrityStatus, string> = {
  verified: 'Vérifiée',
  partial: 'Partiellement vérifiée',
  ineligible: 'Non éligible au classement',
};

// ---------- Replay ----------

export type GameEventKind =
  | 'start' | 'turn' | 'roll' | 'move' | 'buy' | 'rent' | 'tax' | 'card'
  | 'prison' | 'build' | 'sell' | 'mortgage' | 'trade' | 'auction'
  | 'bankrupt' | 'end';

/** Instantané compact de l'état, rejouable à n'importe quel point de la partie. */
export interface ReplaySnapshot {
  /** position de chaque joueur, dans l'ordre de `ReplayData.players` */
  pos: number[];
  cash: number[];
  /** propriétés : [case, index du propriétaire, maisons, hypothéquée] */
  own: [number, number, number, 0 | 1][];
  /** index du joueur courant */
  cur: number;
}

export interface GameEvent {
  seq: number;
  turn: number;
  /** millisecondes écoulées depuis le début de la partie */
  t: number;
  kind: GameEventKind;
  playerId: string | null;
  /** description enrichie, réutilise le format du journal de partie */
  parts: LogPart[];
  snap: ReplaySnapshot;
}

export interface ReplayPlayer {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isBot: boolean;
}

export interface ReplayData {
  gameId: number;
  boardName: string;
  board: BoardDef;
  players: ReplayPlayer[];
  events: GameEvent[];
  durationS: number;
  turns: number;
  winnerName: string;
  endedAt: string;
  integrity: IntegrityReport | null;
}

export type LeaderboardSort = 'global' | 'wins' | 'ratio' | 'level' | 'playtime';

export interface LeaderboardEntry {
  id: string;
  username: string;
  avatar: string;
  rank: number;
  games: number;
  wins: number;
  losses: number;
  ratio: number;
  xp: number;
  level: number;
  playTimeS: number;
  score: number;
}

export interface GameHistoryEntry {
  id: number;
  endedAt: string;
  boardName: string;
  durationS: number;
  turns: number;
  doubles: number;
  winnerName: string;
  won: boolean;
  players: { name: string; avatar: string; won: boolean }[];
  netWorthHistory: Record<string, number[]>; // par nom de joueur
  mostVisited: string | null;
  prisonKing: string | null;
  /** partie jouée avec au moins un bot : hors ratio, hors classement */
  vsBots: boolean;
  xpGained: number;
  /** un journal d'actions existe : la partie peut être rejouée */
  hasReplay: boolean;
}

export const PLAYER_COLORS = [
  '#8b5cf6',
  '#f59e0b',
  '#10b981',
  '#ef4444',
  '#3b82f6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

/** Identifiants d'avatars (rendus en icônes SVG côté client). */
export const AVATARS = [
  'cat', 'dog', 'bird', 'fish', 'rabbit', 'squirrel', 'turtle', 'snail',
  'ghost', 'rocket', 'gem', 'crown', 'anchor', 'flame', 'zap', 'bug',
];

export const BOT_AVATAR = 'bot';
