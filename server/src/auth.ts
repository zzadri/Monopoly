import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { query, queryOne } from './db.js';
import { AVATARS } from 'shared';

/**
 * Secret de signature des sessions.
 *
 * Le conteneur API est sans état : le secret vient de l'environnement pour que
 * les sessions survivent à un redémarrage ou à un changement de réplique. Sans
 * JWT_SECRET, on en tire un au hasard — pratique en développement, mais toutes
 * les sessions sautent à chaque redémarrage.
 */
function loadSecret(): string {
  const fromEnv = process.env.JWT_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (fromEnv) console.warn('  JWT_SECRET trop court (16 caractères minimum) : secret aléatoire utilisé.');
  else console.warn('  JWT_SECRET absent : secret aléatoire — les sessions seront perdues au redémarrage.');
  return crypto.randomBytes(48).toString('hex');
}
export const JWT_SECRET = loadSecret();

const COOKIE = 'monopolie_session';
const WEEK_S = 7 * 24 * 3600;
const GUEST_S = 24 * 3600; // les sessions invité durent 24 h

export interface AuthedRequest extends Request {
  userId?: string;
  username?: string;
  isGuest?: boolean;
}

export interface SessionPayload {
  sub: string;
  guest?: boolean;
  name?: string;
  avatar?: string;
}

export function signSession(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: WEEK_S });
}

export function signGuestSession(name: string, avatar: string): { token: string; id: string } {
  const id = `guest-${crypto.randomUUID()}`;
  return { token: jwt.sign({ sub: id, guest: true, name, avatar }, JWT_SECRET, { expiresIn: GUEST_S }), id };
}

export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string') return null;
    return {
      sub: payload.sub,
      guest: payload.guest === true,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      avatar: typeof payload.avatar === 'string' ? payload.avatar : undefined,
    };
  } catch {
    return null;
  }
}

/** Authentifié : compte OU invité. */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const payload = verifySession(req.cookies?.[COOKIE]);
  if (!payload) return res.status(401).json({ error: 'Non authentifié' });
  if (payload.guest) {
    req.userId = payload.sub;
    req.username = payload.name ?? 'Invité';
    req.isGuest = true;
    return next();
  }
  try {
    const row = await queryOne<{ id: string; username: string }>(
      'SELECT id, username FROM users WHERE id = $1', [payload.sub],
    );
    if (!row) return res.status(401).json({ error: 'Non authentifié' });
    req.userId = row.id;
    req.username = row.username;
    req.isGuest = false;
    next();
  } catch (e) {
    console.error('requireAuth :', e);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
}

/** Réservé aux vrais comptes (stats, plateaux, images…). */
export function requireAccount(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.isGuest) {
    return res.status(403).json({ error: 'Réservé aux comptes — créez un compte gratuit pour cette action.' });
  }
  next();
}

const usernameSchema = z
  .string()
  .trim()
  .min(2, 'Pseudo trop court (2 caractères minimum)')
  .max(20, 'Pseudo trop long (20 caractères maximum)')
  .regex(/^[\p{L}\p{N}_. -]+$/u, 'Caractères non autorisés dans le pseudo');

const credentialsSchema = z.object({
  username: usernameSchema,
  password: z.string().min(6, 'Mot de passe trop court (6 caractères minimum)').max(128),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez plus tard.' },
});

export const authRouter = Router();

function setCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: WEEK_S * 1000,
    // pas de flag secure : app LAN servie en HTTP
  });
}

authRouter.post('/register', authLimiter, async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { username, password } = parsed.data;

  const exists = await queryOne('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username]);
  if (exists) return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });

  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync(password, 11);
  const avatar = AVATARS[randomIndex(AVATARS.length)];
  try {
    await query(
      'INSERT INTO users (id, username, password_hash, avatar) VALUES ($1, $2, $3, $4)',
      [id, username, hash, avatar],
    );
  } catch (e) {
    // course entre deux inscriptions simultanées : l'index unique tranche
    if ((e as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Ce pseudo est déjà pris.' });
    }
    throw e;
  }
  setCookie(res, signSession(id));
  res.json({ id, username, avatar });
});

authRouter.post('/login', authLimiter, async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Identifiants invalides.' });
  const { username, password } = parsed.data;

  const row = await queryOne<{ id: string; username: string; password_hash: string; avatar: string }>(
    'SELECT id, username, password_hash, avatar FROM users WHERE lower(username) = lower($1)', [username],
  );
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Pseudo ou mot de passe incorrect.' });
  }
  setCookie(res, signSession(row.id));
  res.json({ id: row.id, username: row.username, avatar: row.avatar });
});

/** Session invitée : un pseudo suffit, rien n'est écrit en base. */
authRouter.post('/guest', authLimiter, async (req, res) => {
  const parsed = z.object({ username: usernameSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { username } = parsed.data;

  const taken = await queryOne('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username]);
  if (taken) return res.status(409).json({ error: 'Ce pseudo appartient à un compte : connectez-vous ou choisissez-en un autre.' });

  const avatar = AVATARS[randomIndex(AVATARS.length)];
  const { token, id } = signGuestSession(username, avatar);
  setCookie(res, token);
  res.json({ id, username, avatar, guest: true });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  if (req.isGuest) {
    const payload = verifySession(req.cookies?.[COOKIE])!;
    return res.json({ id: req.userId, username: req.username, avatar: payload.avatar ?? 'ghost', guest: true });
  }
  const row = await queryOne('SELECT id, username, avatar FROM users WHERE id = $1', [req.userId]);
  res.json(row);
});

function randomIndex(length: number): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return Math.floor((bytes[0] / 0xffffffff) * length);
}

const avatarSchema = z.object({ avatar: z.string().refine((a) => AVATARS.includes(a), 'Avatar inconnu') });

authRouter.put('/avatar', requireAuth, requireAccount, async (req: AuthedRequest, res) => {
  const parsed = avatarSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  await query('UPDATE users SET avatar = $1 WHERE id = $2', [parsed.data.avatar, req.userId]);
  res.json({ ok: true });
});
