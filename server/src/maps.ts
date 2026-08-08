import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query, queryOne } from './db.js';
import { requireAccount, requireAuth, type AuthedRequest } from './auth.js';
import { CLASSIC_BOARD, perimeterSize, type BoardDef } from 'shared';

const cardActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('gain'), amount: z.number().int().min(1).max(100000) }),
  z.object({ kind: z.literal('pay'), amount: z.number().int().min(1).max(100000) }),
  z.object({ kind: z.literal('gain-each'), amount: z.number().int().min(1).max(10000) }),
  z.object({ kind: z.literal('pay-each'), amount: z.number().int().min(1).max(10000) }),
  z.object({ kind: z.literal('goto'), tile: z.number().int().min(0).max(500) }),
  z.object({ kind: z.literal('goto-start') }),
  z.object({ kind: z.literal('move'), steps: z.number().int().min(-30).max(30) }),
  z.object({ kind: z.literal('goto-prison') }),
  z.object({ kind: z.literal('jail-card') }),
  z.object({ kind: z.literal('repairs'), perHouse: z.number().int().min(0).max(10000), perHotel: z.number().int().min(0).max(10000) }),
  z.object({ kind: z.literal('steal-cash'), amount: z.number().int().min(1).max(10000) }),
  z.object({ kind: z.literal('pay-percent'), percent: z.number().int().min(1).max(100) }),
  z.object({ kind: z.literal('gain-per-building'), perHouse: z.number().int().min(0).max(10000), perHotel: z.number().int().min(0).max(10000) }),
  z.object({ kind: z.literal('goto-nearest'), target: z.enum(['airport', 'utility']) }),
  z.object({ kind: z.literal('skip-turn') }),
  z.object({ kind: z.literal('extra-turn') }),
  z.object({ kind: z.literal('steal-property') }),
  z.object({ kind: z.literal('swap-position') }),
  z.object({ kind: z.literal('teleport-random') }),
  z.object({ kind: z.literal('goto-vacation') }),
  z.object({ kind: z.literal('gain-per-property'), amount: z.number().int().min(1).max(10000) }),
  z.object({ kind: z.literal('pay-per-property'), amount: z.number().int().min(1).max(10000) }),
  z.object({ kind: z.literal('free-house') }),
  z.object({ kind: z.literal('demolish') }),
  z.object({ kind: z.literal('rent-immunity') }),
  z.object({ kind: z.literal('steal-jail-card') }),
]);

const cardSchema = z.object({
  id: z.string().max(40),
  text: z.string().trim().min(1).max(200),
  action: cardActionSchema,
  weight: z.number().int().min(1).max(10).optional(),
});

const shortStr = z.string().trim().min(1).max(40);
const money = z.number().int().min(0).max(1000000);
const rents6 = z.tuple([money, money, money, money, money, money]);

const tileSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), name: shortStr }),
  z.object({ type: z.literal('treasure'), name: shortStr }),
  z.object({ type: z.literal('surprise'), name: shortStr }),
  z.object({ type: z.literal('prison'), name: shortStr }),
  z.object({ type: z.literal('goto-prison'), name: shortStr }),
  z.object({ type: z.literal('vacation'), name: shortStr }),
  z.object({
    type: z.literal('tax'), name: shortStr,
    amount: z.number().int().min(0).max(1000000),
    percent: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('property'), name: shortStr, group: z.string().max(40),
    price: money, rents: rents6, houseCost: money,
  }),
  z.object({ type: z.literal('airport'), name: shortStr, price: money, rents: z.array(money).min(1).max(8) }),
  z.object({
    type: z.literal('utility'), name: shortStr, price: money,
    multipliers: z.array(z.number().int().min(1).max(100)).min(1).max(5),
    icon: z.string().max(8).optional(),
  }),
]);

const boardSchema = z.object({
  name: shortStr,
  description: z.string().trim().max(200).optional(),
  icon: z.string().min(1).max(8),
  cols: z.number().int().min(5).max(16),
  rows: z.number().int().min(5).max(16),
  groups: z.array(z.object({
    id: z.string().min(1).max(40),
    name: shortStr,
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    flag: z.string().max(8).optional(),
    image: z.string()
      .regex(
        /^\/api\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
        'Image invalide (doit provenir de l’import sécurisé)',
      )
      .optional(),
  })).max(16),
  tiles: z.array(tileSchema).min(16).max(60),
  treasureMode: z.enum(['predefined', 'custom', 'mix']),
  surpriseMode: z.enum(['predefined', 'custom', 'mix']),
  customTreasure: z.array(cardSchema).max(40),
  customSurprise: z.array(cardSchema).max(40),
  isPublic: z.boolean().default(true),
}).superRefine((b, ctx) => {
  const expected = perimeterSize(b.cols, b.rows);
  if (b.tiles.length !== expected) {
    ctx.addIssue({ code: 'custom', message: `Le plateau ${b.cols}×${b.rows} doit avoir ${expected} cases (reçu ${b.tiles.length}).` });
  }
  if (b.tiles.filter((t) => t.type === 'start').length !== 1) {
    ctx.addIssue({ code: 'custom', message: 'Il faut exactement une case Départ (placée où vous voulez).' });
  }
  const hasGotoPrison = b.tiles.some((t) => t.type === 'goto-prison');
  const hasPrison = b.tiles.some((t) => t.type === 'prison');
  if (hasGotoPrison && !hasPrison) {
    ctx.addIssue({ code: 'custom', message: 'Une case « Allez en prison » nécessite une case Prison.' });
  }
  const groupIds = new Set(b.groups.map((g) => g.id));
  for (const t of b.tiles) {
    if (t.type === 'property' && !groupIds.has(t.group)) {
      ctx.addIssue({ code: 'custom', message: `Groupe inconnu pour la propriété « ${t.name} ».` });
    }
  }
  if ((b.treasureMode === 'custom' || b.treasureMode === 'mix') && b.customTreasure.length === 0
      && b.tiles.some((t) => t.type === 'treasure')) {
    ctx.addIssue({ code: 'custom', message: 'Ajoutez au moins une carte Trésor personnalisée (ou choisissez les cartes prédéfinies).' });
  }
  if ((b.surpriseMode === 'custom' || b.surpriseMode === 'mix') && b.customSurprise.length === 0
      && b.tiles.some((t) => t.type === 'surprise')) {
    ctx.addIssue({ code: 'custom', message: 'Ajoutez au moins une carte Surprise personnalisée (ou choisissez les cartes prédéfinies).' });
  }
});

/**
 * Cache mémoire des plateaux.
 *
 * `getBoard` est appelé en continu par la boucle de jeu et les vues de salon,
 * qui sont synchrones : on garde les plateaux en mémoire plutôt que d'imposer
 * un aller-retour asynchrone vers PostgreSQL à chaque lecture.
 * (Valable pour une instance d'API unique — le cas d'usage LAN. Avec plusieurs
 * répliques, il faudrait invalider ce cache via NOTIFY/LISTEN.)
 */
const boardCache = new Map<string, BoardDef>();

export async function loadBoardCache(): Promise<void> {
  const rows = await query<{ id: string; data: BoardDef }>('SELECT id, data FROM maps');
  boardCache.clear();
  for (const r of rows) boardCache.set(r.id, r.data);
  console.log(`  ${rows.length} plateau(x) personnalisé(s) chargé(s)`);
}

export function getBoard(boardId: string): BoardDef | null {
  if (boardId === 'classic') return CLASSIC_BOARD;
  return boardCache.get(boardId) ?? null;
}

export const mapsRouter = Router();
mapsRouter.use(requireAuth);

mapsRouter.get('/', async (req: AuthedRequest, res) => {
  const rows = await query<{
    id: string; name: string; is_public: boolean; owner_id: string;
    owner_name: string; data: BoardDef; updated_at: Date;
  }>(`
    SELECT m.id, m.name, m.is_public, m.owner_id, u.username AS owner_name, m.data, m.updated_at
    FROM maps m JOIN users u ON u.id = m.owner_id
    WHERE m.is_public = TRUE OR m.owner_id = $1
    ORDER BY m.updated_at DESC
  `, [req.userId]);

  const maps = rows.map((r) => {
    const b = r.data;
    return {
      id: r.id, name: r.name, icon: b.icon, description: b.description ?? '',
      cols: b.cols, rows: b.rows, tileCount: b.tiles.length,
      ownerId: r.owner_id, ownerName: r.owner_name,
      isPublic: r.is_public, mine: r.owner_id === req.userId,
      updatedAt: r.updated_at,
    };
  });
  res.json([
    {
      id: 'classic', name: CLASSIC_BOARD.name, icon: CLASSIC_BOARD.icon,
      description: CLASSIC_BOARD.description, cols: 11, rows: 11,
      tileCount: 40, ownerId: null, ownerName: 'Monopolie', isPublic: true, mine: false, updatedAt: null,
    },
    ...maps,
  ]);
});

mapsRouter.get('/:id', async (req: AuthedRequest, res) => {
  const board = getBoard(req.params.id);
  if (!board) return res.status(404).json({ error: 'Plateau introuvable.' });
  if (board.id !== 'classic') {
    const row = await queryOne<{ owner_id: string; is_public: boolean }>(
      'SELECT owner_id, is_public FROM maps WHERE id = $1', [req.params.id],
    );
    if (!row) return res.status(404).json({ error: 'Plateau introuvable.' });
    if (!row.is_public && row.owner_id !== req.userId) {
      return res.status(403).json({ error: 'Plateau privé.' });
    }
  }
  res.json(board);
});

mapsRouter.post('/', requireAccount, async (req: AuthedRequest, res) => {
  const row = await queryOne<{ c: string }>('SELECT COUNT(*) AS c FROM maps WHERE owner_id = $1', [req.userId]);
  if (Number(row?.c ?? 0) >= 30) return res.status(400).json({ error: 'Limite de 30 plateaux atteinte.' });
  const parsed = boardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const id = crypto.randomUUID();
  const { isPublic, ...boardData } = parsed.data;
  const board = { ...boardData, id } as BoardDef;
  await query(
    'INSERT INTO maps (id, owner_id, name, data, is_public) VALUES ($1, $2, $3, $4, $5)',
    [id, req.userId, board.name, JSON.stringify(board), isPublic],
  );
  boardCache.set(id, board);
  res.json({ id });
});

mapsRouter.put('/:id', requireAccount, async (req: AuthedRequest, res) => {
  const row = await queryOne<{ owner_id: string }>('SELECT owner_id FROM maps WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Plateau introuvable.' });
  if (row.owner_id !== req.userId) return res.status(403).json({ error: 'Ce plateau ne vous appartient pas.' });
  const parsed = boardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

  const { isPublic, ...boardData } = parsed.data;
  const board = { ...boardData, id: req.params.id } as BoardDef;
  await query(
    'UPDATE maps SET name = $1, data = $2, is_public = $3, updated_at = now() WHERE id = $4',
    [board.name, JSON.stringify(board), isPublic, req.params.id],
  );
  boardCache.set(req.params.id, board);
  res.json({ ok: true });
});

mapsRouter.delete('/:id', requireAccount, async (req: AuthedRequest, res) => {
  const row = await queryOne<{ owner_id: string }>('SELECT owner_id FROM maps WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Plateau introuvable.' });
  if (row.owner_id !== req.userId) return res.status(403).json({ error: 'Ce plateau ne vous appartient pas.' });
  await query('DELETE FROM maps WHERE id = $1', [req.params.id]);
  boardCache.delete(req.params.id);
  res.json({ ok: true });
});
