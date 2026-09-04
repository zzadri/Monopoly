export type GamePhase =
  | 'AwaitingRoll'
  | 'AwaitingPurchaseDecision'
  | 'AwaitingJailDecision'
  | 'AwaitingEndTurn'
  | 'AwaitingDebtSettlement';

export type GameActionType =
  | 'Start'
  | 'Roll'
  | 'Buy'
  | 'Decline'
  | 'EndTurn'
  | 'Build'
  | 'SellBuilding'
  | 'Mortgage'
  | 'Unmortgage'
  | 'PayJailFine'
  | 'UseJailCard'
  | 'Bankrupt';

export interface GameSpace {
  id: string;
  position: number;
  type: string;
  name: string;
  groupColorHex: string | null;
  price: number | null;
  houseCost: number | null;
  ownerParticipantId: string | null;
  houses: number;
  hasHotel: boolean;
  isMortgaged: boolean;
  currentRent: number | null;
  canBuild: boolean;
  canSellBuilding: boolean;
  canMortgage: boolean;
  canUnmortgage: boolean;
}

export interface GamePlayer {
  id: string;
  displayName: string;
  kind: string;
  botDifficulty: string | null;
  money: number;
  position: number;
  inPrison: boolean;
  isBankrupt: boolean;
  isConnected: boolean;
  getOutOfJailCards: number;
  tokenColor: string;
  netWorth: number;
  seatOrder: number;
}

export interface GameEventEntry {
  sequence: number;
  type: string;
  message: string;
  participantId: string | null;
  createdAt: string;
}

export interface GameOptionsView {
  argentDepart: number;
  loyerDoubleEnsembleComplet: boolean;
  cagnotteVacances: boolean;
  encheres: boolean;
  pasDeLoyerEnPrison: boolean;
  constructionEquilibree: boolean;
  melangerOrdreJoueurs: boolean;
  turnLimit: number;
}

export interface TradeSpace {
  id: string;
  name: string;
  groupColorHex: string | null;
}

export interface TradeOffer {
  id: string;
  proposerId: string;
  proposerName: string;
  targetId: string;
  targetName: string;
  offered: TradeSpace[];
  requested: TradeSpace[];
  offeredMoney: number;
  requestedMoney: number;
}

export interface GameState {
  id: string;
  status: 'Lobby' | 'InProgress' | 'Finished' | 'Cancelled';
  phase: GamePhase;
  turnNumber: number;
  currentParticipantId: string | null;
  winnerParticipantId: string | null;
  rows: number;
  columns: number;
  die1: number;
  die2: number;
  freeParkingPot: number;
  pendingDebtAmount: number;
  pendingPurchase: { spaceId: string; name: string; price: number } | null;
  options: GameOptionsView;
  spaces: GameSpace[];
  players: GamePlayer[];
  events: GameEventEntry[];
  trades: TradeOffer[];
  yourParticipantId: string | null;
}

export interface GameSummary {
  id: string;
  status: string;
  maxPlayers: number;
  playerCount: number;
  isPrivate: boolean;
  argentDepart: number;
  hasBots: boolean;
  hostName: string;
  createdAt: string;
}

export interface JoinGameResult {
  state: GameState;
  participantId: string;
  guestSecret: string | null;
}
