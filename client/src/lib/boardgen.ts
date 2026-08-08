import type { PropertyTile, Tile } from 'shared';

/**
 * Génération automatique des prix et loyers.
 *
 * Sur un grand plateau (16×16 = 60 cases), saisir six loyers par propriété à la
 * main est interminable. Ces fonctions reproduisent la progression du plateau
 * classique : le prix monte avec l'avancement sur le plateau, et les loyers
 * découlent du prix selon des ratios éprouvés.
 */

/** Ratios loyer/prix du Monopoly classique (nu, 1-4 maisons, hôtel). */
const RENT_RATIOS = [0.05, 0.25, 0.75, 2.2, 2.9, 3.5];

function round5(n: number): number {
  return Math.max(2, Math.round(n / 5) * 5);
}

/** Loyers déduits du prix d'achat. */
export function rentsFromPrice(price: number): PropertyTile['rents'] {
  const base = Math.max(1, Math.round((price * RENT_RATIOS[0]) / 2) * 2);
  return [
    base,
    round5(price * RENT_RATIOS[1]),
    round5(price * RENT_RATIOS[2]),
    round5(price * RENT_RATIOS[3]),
    round5(price * RENT_RATIOS[4]),
    round5(price * RENT_RATIOS[5]),
  ] as PropertyTile['rents'];
}

/** Coût de construction usuel selon le prix du terrain. */
export function houseCostFromPrice(price: number): number {
  if (price <= 120) return 50;
  if (price <= 200) return 100;
  if (price <= 280) return 150;
  return 200;
}

export interface PricingOptions {
  /** prix de la première propriété */
  min: number;
  /** prix de la dernière propriété */
  max: number;
}

/**
 * Réaffecte prix, loyers et coût de construction à toutes les propriétés,
 * en progression régulière selon leur position sur le plateau.
 * Les aéroports et compagnies reçoivent un tarif cohérent au passage.
 */
export function autoPriceBoard(tiles: Tile[], { min, max }: PricingOptions): Tile[] {
  const propertyIdx = tiles
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t.type === 'property')
    .map((x) => x.i);

  const out = tiles.map((t) => ({ ...t })) as Tile[];
  const count = propertyIdx.length;

  propertyIdx.forEach((tileIndex, rank) => {
    const ratio = count > 1 ? rank / (count - 1) : 0;
    const price = round5(min + (max - min) * ratio);
    const tile = out[tileIndex] as PropertyTile;
    out[tileIndex] = {
      ...tile,
      price,
      rents: rentsFromPrice(price),
      houseCost: houseCostFromPrice(price),
    };
  });

  // aéroports : tarif unique, loyers doublés à chaque acquisition
  const airports = out.filter((t) => t.type === 'airport');
  if (airports.length > 0) {
    const price = round5((min + max) / 3);
    const first = round5(price / 8);
    for (const t of out) {
      if (t.type !== 'airport') continue;
      t.price = price;
      t.rents = t.rents.map((_, i) => first * 2 ** i);
    }
  }

  // compagnies : prix aligné sur le bas de gamme, multiplicateurs conservés
  for (const t of out) {
    if (t.type === 'utility') t.price = round5((min + max) / 4);
  }

  return out;
}

/** Applique le prix (et ses loyers déduits) à toutes les cases d'un groupe. */
export function applyToGroup(tiles: Tile[], groupId: string, price: number): Tile[] {
  return tiles.map((t) => {
    if (t.type !== 'property' || t.group !== groupId) return t;
    return { ...t, price, rents: rentsFromPrice(price), houseCost: houseCostFromPrice(price) };
  });
}

/** Répartit les propriétés entre les groupes par tranches consécutives. */
export function autoAssignGroups(tiles: Tile[], groupIds: string[]): Tile[] {
  if (groupIds.length === 0) return tiles;
  const propertyIdx = tiles
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t.type === 'property')
    .map((x) => x.i);

  const out = tiles.map((t) => ({ ...t })) as Tile[];
  // taille de tranche : 2 ou 3 cases par groupe, comme sur le plateau classique
  const perGroup = Math.max(2, Math.ceil(propertyIdx.length / groupIds.length));
  propertyIdx.forEach((tileIndex, rank) => {
    const g = groupIds[Math.min(groupIds.length - 1, Math.floor(rank / perGroup))];
    (out[tileIndex] as PropertyTile).group = g;
  });
  return out;
}
