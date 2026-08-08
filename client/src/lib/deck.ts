import type { Card, CardAction, Tile } from 'shared';

/**
 * Génération et analyse de decks « équilibrés ».
 *
 * Principe : chaque carte a une valeur estimée en dollars (positive = bonne pour
 * le joueur). Un deck est équilibré quand l'espérance d'un tirage est proche de
 * zéro — les bonnes et les mauvaises cartes se compensent — et que les familles
 * d'effets (gains, pertes, déplacements, spéciales) sont représentées.
 */

export type CardFamily = 'bonus' | 'malus' | 'move' | 'special';

export interface DeckStats {
  /** espérance de gain d'un tirage, en $ (pondérée) */
  expected: number;
  /** somme des valeurs positives / négatives (pondérées) */
  gains: number;
  losses: number;
  counts: Record<CardFamily, number>;
  total: number;
}

/** Unité monétaire du plateau : sert à mettre les montants à l'échelle. */
export function boardUnit(tiles: Tile[]): number {
  const prices = tiles
    .filter((t): t is Extract<Tile, { price: number }> => 'price' in t)
    .map((t) => t.price)
    .sort((a, b) => a - b);
  if (prices.length === 0) return 150;
  return prices[Math.floor(prices.length / 2)] || 150;
}

export function cardFamily(a: CardAction): CardFamily {
  switch (a.kind) {
    case 'gain': case 'gain-each': case 'gain-per-building': case 'steal-cash':
    case 'gain-per-property': case 'free-house': case 'rent-immunity':
      return 'bonus';
    case 'pay': case 'pay-each': case 'pay-percent': case 'repairs':
    case 'pay-per-property': case 'demolish':
      return 'malus';
    case 'goto': case 'goto-start': case 'goto-nearest': case 'move':
    case 'teleport-random': case 'goto-vacation': case 'swap-position':
      return 'move';
    default:
      return 'special';
  }
}

/**
 * Valeur estimée d'une carte, en $. Les effets non monétaires sont convertis
 * avec des équivalences prudentes (une carte de sortie de prison ≈ la caution,
 * un tour sauté ≈ un salaire, etc.).
 */
export function cardValue(a: CardAction, unit: number): number {
  const SALARY = 200;
  switch (a.kind) {
    case 'gain': return a.amount;
    case 'pay': return -a.amount;
    case 'gain-each': return a.amount * 2; // ~2 adversaires en moyenne
    case 'pay-each': return -a.amount * 2;
    case 'steal-cash': return a.amount;
    case 'pay-percent': return -(unit * 4 * a.percent) / 100; // ~4 unités de trésorerie
    case 'repairs': return -(a.perHouse * 3 + a.perHotel);
    case 'gain-per-building': return a.perHouse * 3 + a.perHotel;
    case 'goto-start': return SALARY;
    case 'goto': return SALARY / 2; // avance souvent vers le Départ, effet moyen
    case 'goto-nearest': return -unit / 4; // risque de payer un loyer
    case 'move': return a.steps >= 0 ? 0 : -unit / 6;
    case 'goto-prison': return -SALARY;
    case 'jail-card': return 50;
    case 'skip-turn': return -SALARY;
    case 'extra-turn': return SALARY;
    case 'steal-property': return unit;
    case 'swap-position': return 0;
    case 'teleport-random': return 0;
    case 'goto-vacation': return SALARY / 4;
    case 'gain-per-property': return a.amount * 4; // ~4 propriétés en moyenne
    case 'pay-per-property': return -a.amount * 4;
    case 'free-house': return unit / 2;
    case 'demolish': return -unit / 3;
    case 'rent-immunity': return unit / 3;
    case 'steal-jail-card': return 50;
    default: return 0;
  }
}

export function deckStats(cards: Card[], unit: number): DeckStats {
  const counts: Record<CardFamily, number> = { bonus: 0, malus: 0, move: 0, special: 0 };
  let gains = 0;
  let losses = 0;
  let weightSum = 0;
  for (const c of cards) {
    const w = c.weight ?? 1;
    const v = cardValue(c.action, unit);
    counts[cardFamily(c.action)]++;
    weightSum += w;
    if (v >= 0) gains += v * w;
    else losses += v * w;
  }
  return {
    expected: weightSum > 0 ? Math.round((gains + losses) / weightSum) : 0,
    gains: Math.round(gains),
    losses: Math.round(losses),
    counts,
    total: cards.length,
  };
}

/* ---------- modèles de textes ---------- */

const TREASURE_BONUS = [
  'Erreur de la banque en votre faveur. Recevez {m}.',
  'Votre assurance vie arrive à terme. Recevez {m}.',
  'Vous vendez vos vieux meubles. Recevez {m}.',
  'Remboursement d’impôts. Recevez {m}.',
  'Vos placements versent un dividende de {m}.',
  'Vous héritez de {m}.',
  'Prime de fin d’année. Recevez {m}.',
  'Vous remportez un concours de mots croisés. Recevez {m}.',
];
const TREASURE_MALUS = [
  'Frais d’hôpital. Payez {m}.',
  'Facture d’électricité oubliée. Payez {m}.',
  'Amende de stationnement. Payez {m}.',
  'Frais de scolarité. Payez {m}.',
  'Votre téléphone est mort. Payez {m} de réparation.',
  'Contrôle fiscal. Payez {m}.',
  'Frais de notaire. Payez {m}.',
  'La chaudière lâche. Payez {m}.',
];
const SURPRISE_BONUS = [
  'Le vent tourne en votre faveur. Recevez {m}.',
  'Vous trouvez une mallette oubliée. Recevez {m}.',
  'Votre pari sportif est gagnant. Recevez {m}.',
  'Un mécène vous soutient. Recevez {m}.',
  'Votre vidéo devient virale. Recevez {m}.',
  'Vous gagnez à la tombola. Recevez {m}.',
];
const SURPRISE_MALUS = [
  'Excès de vitesse. Payez {m}.',
  'Vous cassez un vase de collection. Payez {m}.',
  'Votre valise part sans vous. Payez {m}.',
  'Abonnement oublié depuis des mois. Payez {m}.',
  'Grève surprise : payez {m} de dédommagement.',
  'Panne de voiture. Payez {m}.',
];

function money(n: number) {
  return `$${n}`;
}

function shuffle<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomIndex(length: number): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return Math.floor((bytes[0] / 0xffffffff) * length);
}

function pick<T>(list: T[], used: Set<T>): T {
  const free = list.filter((x) => !used.has(x));
  const source = free.length > 0 ? free : list;
  const item = source[randomIndex(source.length)];
  used.add(item);
  return item;
}

/** Arrondit à un montant « joli » (multiple de 5 ou 10). */
function roundMoney(n: number): number {
  let step = 5;
  if (n >= 200) step = 25;
  else if (n >= 100) step = 10;
  return Math.max(step, Math.round(n / step) * step);
}

export interface GenerateOptions {
  deck: 'treasure' | 'surprise';
  count: number;
  tiles: Tile[];
  /** autoriser les cartes agressives (vol d'argent ou de propriété) */
  aggressive: boolean;
}

/**
 * Construit un deck équilibré : autant de bonnes que de mauvaises cartes,
 * montants mis à l'échelle du plateau, espérance ramenée à ~0 $.
 */
export function generateBalancedDeck({ deck, count, tiles, aggressive }: GenerateOptions): Card[] {
  const unit = boardUnit(tiles);
  const usedTexts = new Set<string>();
  const cards: Card[] = [];
  const now = Date.now();
  let seq = 0;
  const add = (text: string, action: CardAction) => {
    cards.push({ id: `gen${now}-${seq++}`, text, action, weight: 1 });
  };

  const hasPrison = tiles.some((t) => t.type === 'prison');
  const hasAirport = tiles.some((t) => t.type === 'airport');
  const hasUtility = tiles.some((t) => t.type === 'utility');
  const hasProperty = tiles.some((t) => t.type === 'property');
  const namedTargets = tiles
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t.type === 'property' || x.t.type === 'airport');

  // répartition : ~35 % bonus, ~35 % malus, ~15 % déplacements, ~20 % spéciales
  // (les spéciales vont par paires opposées : on garde un nombre pair)
  const nMove = Math.max(1, Math.round(count * 0.15));
  const nSpecial = Math.max(2, Math.round((count * 0.2) / 2) * 2);
  const nMoney = count - nMove - nSpecial;
  const nBonus = Math.ceil(nMoney / 2);
  const nMalus = nMoney - nBonus;

  const amounts = [0.15, 0.25, 0.35, 0.5, 0.7, 1].map((f) => roundMoney(unit * f));
  const randAmount = () => amounts[randomIndex(amounts.length)];

  const bonusTexts = deck === 'treasure' ? TREASURE_BONUS : SURPRISE_BONUS;
  const malusTexts = deck === 'treasure' ? TREASURE_MALUS : SURPRISE_MALUS;

  // --- cartes d'argent ---
  for (let i = 0; i < nBonus; i++) {
    const amount = randAmount();
    add(pick(bonusTexts, usedTexts).replace('{m}', money(amount)), { kind: 'gain', amount });
  }
  for (let i = 0; i < nMalus; i++) {
    const amount = randAmount();
    add(pick(malusTexts, usedTexts).replace('{m}', money(amount)), { kind: 'pay', amount });
  }

  // --- déplacements (espérance ~neutre) ---
  const moveOptions: (() => void)[] = [
    () => add('Retournez à la case Départ et touchez votre salaire.', { kind: 'goto-start' }),
    () => {
      const steps = 2 + randomIndex(4);
      add(`Un raccourci ! Avancez de ${steps} cases.`, { kind: 'move', steps });
    },
    () => {
      const steps = 2 + randomIndex(3);
      add(`Vous avez oublié quelque chose. Reculez de ${steps} cases.`, { kind: 'move', steps: -steps });
    },
  ];
  if (namedTargets.length > 0) {
    moveOptions.push(() => {
      const target = namedTargets[randomIndex(namedTargets.length)];
      add(`Rendez-vous immédiatement à ${target.t.name}.`, { kind: 'goto', tile: target.i });
    });
  }
  if (hasAirport) {
    moveOptions.push(() => add('Direction l’aéroport le plus proche !', { kind: 'goto-nearest', target: 'airport' }));
  }
  if (hasUtility) {
    moveOptions.push(() => add('Coupure de courant : allez à la compagnie la plus proche.', { kind: 'goto-nearest', target: 'utility' }));
  }
  for (let i = 0; i < nMove; i++) moveOptions[i % moveOptions.length]();

  // --- spéciales : on les ajoute par paires opposées pour rester neutre ---
  const specialPairs: (() => void)[][] = [];
  const aggressivePairs: (() => void)[][] = [];
  if (hasPrison) {
    specialPairs.push([
      () => add('Carte « Sortie de prison ». Conservez-la précieusement.', { kind: 'jail-card' }),
      () => add('Arrêté pour tapage nocturne : allez en prison.', { kind: 'goto-prison' }),
    ]);
  }
  specialPairs.push([
    () => add('Vous rejouez immédiatement !', { kind: 'extra-turn' }),
    () => add('Panne d’oreiller : vous passez votre prochain tour.', { kind: 'skip-turn' }),
  ]);
  {
    const amount = roundMoney(unit * 0.15);
    specialPairs.push([
      () => add(`C’est votre anniversaire ! Chaque joueur vous offre ${money(amount)}.`, { kind: 'gain-each', amount }),
      () => add(`Vous offrez votre tournée : ${money(amount)} à chaque joueur.`, { kind: 'pay-each', amount }),
    ]);
  }
  if (hasProperty) {
    const perHouse = roundMoney(unit * 0.15);
    const perHotel = roundMoney(unit * 0.6);
    specialPairs.push([
      () => add(`Vos locations rapportent : recevez ${money(perHouse)} par maison et ${money(perHotel)} par hôtel.`,
        { kind: 'gain-per-building', perHouse, perHotel }),
      () => add(`Travaux obligatoires : payez ${money(perHouse)} par maison et ${money(perHotel)} par hôtel.`,
        { kind: 'repairs', perHouse, perHotel }),
    ]);
  }
  if (aggressive) {
    const amount = roundMoney(unit * 0.3);
    aggressivePairs.push([
      () => add(`Vous chipez ${money(amount)} dans la poche d’un joueur au hasard.`, { kind: 'steal-cash', amount }),
      () => add(`Un pickpocket sévit : payez ${money(amount)} à la banque.`, { kind: 'pay', amount }),
    ]);
    if (hasProperty) {
      aggressivePairs.push([
        () => add('Rachat hostile : volez une propriété à un joueur au hasard.', { kind: 'steal-property' }),
        () => add(`Litige judiciaire : payez ${money(roundMoney(unit))} de frais.`, { kind: 'pay', amount: roundMoney(unit) }),
      ]);
    }
  }

  // les paires agressives passent en tête pour être garanties dans le deck
  const orderedPairs = [...shuffle(aggressivePairs), ...shuffle(specialPairs)];
  const nPairs = Math.max(1, Math.floor(nSpecial / 2));
  for (let i = 0; i < nPairs; i++) {
    const pair = orderedPairs[i % orderedPairs.length];
    pair[0]();
    pair[1]();
  }

  return rebalanceDeck(cards, unit);
}

/**
 * Ajuste les montants des cartes d'argent pour ramener l'espérance vers 0 $.
 * Les textes contenant un montant sont mis à jour en conséquence.
 */
export function rebalanceDeck(cards: Card[], unit: number): Card[] {
  const out = cards.map((c) => ({ ...c }));
  const MIN = Math.max(5, roundMoney(unit * 0.1));
  const MAX = roundMoney(unit * 1.5);

  const isGain = (c: Card) => c.action.kind === 'gain';
  const isPay = (c: Card) => c.action.kind === 'pay';

  for (let pass = 0; pass < 30; pass++) {
    const stats = deckStats(out, unit);
    if (Math.abs(stats.expected) <= 5) break;

    const totalWeight = out.reduce((s, c) => s + (c.weight ?? 1), 0);
    // écart total à résorber, amorti pour converger sans osciller
    const drift = stats.expected * totalWeight * 0.6;

    // on corrige des deux côtés : moins de gains ET plus de pertes (ou l'inverse)
    const gainCards = out.filter(isGain);
    const payCards = out.filter(isPay);
    const sides = [gainCards, payCards].filter((s) => s.length > 0);
    if (sides.length === 0) break;
    const perSide = drift / sides.length;

    const changed =
      rebalanceMoneyCards(gainCards, perSide, MIN, MAX, -1) ||
      rebalanceMoneyCards(payCards, perSide, MIN, MAX, 1);
    if (!changed) break;
  }
  return out;
}

function rebalanceMoneyCards(cards: Card[], perSide: number, min: number, max: number, direction: -1 | 1): boolean {
  let changed = false;
  for (const c of cards) {
    if (c.action.kind !== 'gain' && c.action.kind !== 'pay') continue;
    const amount = c.action.amount;
    const target = amount + direction * (perSide / (cards.length * (c.weight ?? 1)));
    const next = clamp(roundMoney(target), min, max);
    if (next !== amount) {
      c.action = { ...c.action, amount: next } as CardAction;
      c.text = replaceAmount(c.text, next);
      changed = true;
    }
  }
  return changed;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Remplace le premier montant en dollars d'un texte. */
function replaceAmount(text: string, amount: number): string {
  return /\$\s?\d+/.test(text) ? text.replace(/\$\s?\d+/, `$${amount}`) : text;
}
