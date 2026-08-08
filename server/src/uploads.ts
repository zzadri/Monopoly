import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { query, queryOne } from './db.js';
import { requireAccount, requireAuth, type AuthedRequest } from './auth.js';

/**
 * Stockage d'images durci :
 * - clé d'objet = UUID aléatoire SANS extension → aucun bypass par double extension
 *   (.php.png, .png.exe…) : le nom fourni par le client n'est jamais utilisé.
 * - type MIME détecté par signature binaire (magic bytes), jamais par le nom de
 *   fichier ni par l'en-tête Content-Type du client. PNG / JPEG / WebP uniquement
 *   (pas de SVG : vecteur XSS).
 * - servi avec Content-Type sûr + X-Content-Type-Options: nosniff → une image
 *   « polyglotte » ne sera jamais interprétée comme script ou page.
 * - taille max 120 Ko, quota par utilisateur, rate-limit, authentification requise.
 *
 * Backend : S3 (AWS ou MinIO) si S3_BUCKET est défini, sinon disque local.
 * Variables d'env S3 : S3_BUCKET, S3_REGION, S3_ENDPOINT (MinIO),
 * S3_ACCESS_KEY, S3_SECRET_KEY, S3_FORCE_PATH_STYLE=1 (MinIO).
 */

const MAX_SIZE = 120 * 1024;
const ALLOWED = ['image/png', 'image/jpeg', 'image/webp'] as const;
type AllowedMime = (typeof ALLOWED)[number];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localDir = path.join(__dirname, '..', 'data', 'uploads');

/** Détection du format par signature binaire — la seule source de vérité. */
function sniffImage(buf: Buffer): AllowedMime | null {
  if (buf.length < 16) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
    && buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF'
    && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/* ---------- backend de stockage ---------- */

interface ObjectStore {
  put(id: string, data: Buffer, mime: string): Promise<void>;
  get(id: string): Promise<Buffer | null>;
  name: string;
}

function localStore(): ObjectStore {
  fs.mkdirSync(localDir, { recursive: true });
  return {
    name: 'disque local',
    async put(id, data) {
      // id validé en amont (UUID) — jamais de nom utilisateur
      await fs.promises.writeFile(path.join(localDir, id), data, { mode: 0o600 });
    },
    async get(id) {
      try {
        return await fs.promises.readFile(path.join(localDir, id));
      } catch {
        return null;
      }
    },
  };
}

async function s3Store(): Promise<ObjectStore> {
  const { S3Client, PutObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
  const bucket = process.env.S3_BUCKET!;
  const client = new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === '1',
    credentials: process.env.S3_ACCESS_KEY
      ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY ?? '' }
      : undefined,
  });
  return {
    name: `S3 (${bucket})`,
    async put(id, data, mime) {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `monopolie-images/${id}`,
        Body: data,
        ContentType: mime,
        // l'objet n'est jamais servi directement depuis S3 : pas d'ACL publique
      }));
    },
    async get(id) {
      try {
        const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `monopolie-images/${id}` }));
        if (!res.Body) return null;
        const chunks: Buffer[] = [];
        for await (const chunk of res.Body as Readable) chunks.push(Buffer.from(chunk));
        return Buffer.concat(chunks);
      } catch {
        return null;
      }
    },
  };
}

const objectStore: ObjectStore = process.env.S3_BUCKET ? await s3Store() : localStore();
console.log(`  Stockage des images : ${objectStore.name}`);

/* ---------- routes ---------- */

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop d’envois d’images, réessayez plus tard.' },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const uploadsRouter = Router();

uploadsRouter.post(
  '/',
  requireAuth,
  requireAccount,
  uploadLimiter,
  express.raw({ type: () => true, limit: MAX_SIZE }),
  async (req: AuthedRequest, res) => {
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      return res.status(400).json({ error: 'Aucune image reçue.' });
    }
    const mime = sniffImage(buf);
    if (!mime) {
      return res.status(400).json({ error: 'Format non reconnu : PNG, JPEG ou WebP uniquement.' });
    }
    const countRow = await queryOne<{ c: string }>('SELECT COUNT(*) AS c FROM uploads WHERE owner_id = $1', [req.userId]);
    if (Number(countRow?.c ?? 0) >= 100) return res.status(400).json({ error: 'Quota d’images atteint (100).' });

    const id = crypto.randomUUID();
    try {
      await objectStore.put(id, buf, mime);
    } catch (e) {
      console.error('Erreur de stockage image :', e);
      return res.status(500).json({ error: 'Stockage indisponible.' });
    }
    await query('INSERT INTO uploads (id, owner_id, mime, size) VALUES ($1, $2, $3, $4)', [id, req.userId, mime, buf.length]);
    res.json({ url: `/api/uploads/${id}` });
  },
);

uploadsRouter.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  if (!UUID_RE.test(id)) return res.status(400).end();
  const row = await queryOne<{ mime: string; size: number }>('SELECT mime, size FROM uploads WHERE id = $1', [id]);
  if (!row) return res.status(404).end();
  const data = await objectStore.get(id);
  if (!data) return res.status(404).end();
  // le type servi vient de NOTRE détection par magic bytes, jamais du client
  res.setHeader('Content-Type', row.mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline; filename="image"');
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.send(data);
});
