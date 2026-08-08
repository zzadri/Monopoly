import pg from 'pg';
import { AVATARS } from 'shared';

/**
 * Accès PostgreSQL.
 *
 * La base tourne dans son propre conteneur (`db`) : le serveur ne stocke plus
 * rien sur son disque, ce qui permet de le redémarrer, le scaler ou le
 * reconstruire sans toucher aux données.
 */

const connectionString =
  process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required.');
}

export const pool = new pg.Pool({
  connectionString,
  max: Number(process.env.PGPOOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => console.error('Erreur du pool PostgreSQL :', err.message));

/** Raccourci : exécute une requête et renvoie les lignes typées. */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

/** Première ligne ou undefined. */
export async function queryOne<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/** Attend que la base accepte les connexions (démarrage du conteneur). */
async function waitForDatabase(retries = 30): Promise<void> {
  for (let i = 1; i <= retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      if (i === retries) throw e;
      console.log(`  base indisponible, nouvelle tentative (${i}/${retries})…`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT 'ghost',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- unicité insensible à la casse (équivalent du COLLATE NOCASE de SQLite)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));

CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  data JSONB NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  board_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_s INTEGER NOT NULL,
  turns INTEGER NOT NULL,
  doubles INTEGER NOT NULL,
  winner_id TEXT,
  winner_name TEXT NOT NULL,
  most_visited TEXT,
  prison_king TEXT,
  net_worth_history JSONB NOT NULL,
  players_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS game_players (
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  won BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (game_id, user_id)
);

CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_game_players_user ON game_players(user_id);
CREATE INDEX IF NOT EXISTS idx_maps_public ON maps(is_public);
CREATE INDEX IF NOT EXISTS idx_uploads_owner ON uploads(owner_id);
`;

/**
 * Migrations additives, rejouables sans risque. Chaque colonne est ajoutée
 * séparément pour qu'une base existante se mette à niveau sans perte.
 */
const MIGRATIONS = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS play_time_s BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS win_streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS best_streak INTEGER NOT NULL DEFAULT 0;

-- une partie comptant au moins un bot n'alimente ni le ratio ni les classements
ALTER TABLE games ADD COLUMN IF NOT EXISTS vs_bots BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE game_players ADD COLUMN IF NOT EXISTS xp_gained INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN IF NOT EXISTS stats JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_games_vs_bots ON games(vs_bots);
CREATE INDEX IF NOT EXISTS idx_users_xp ON users(xp DESC);

-- intégrité : score, statut de vérification et seed révélé en fin de partie
ALTER TABLE games ADD COLUMN IF NOT EXISTS integrity JSONB;
ALTER TABLE games ADD COLUMN IF NOT EXISTS board_id TEXT;
ALTER TABLE games ADD COLUMN IF NOT EXISTS players_meta JSONB;

-- journal d'actions : audit anti-triche et bande de replay
CREATE TABLE IF NOT EXISTS game_events (
  game_id BIGINT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  events JSONB NOT NULL,
  PRIMARY KEY (game_id)
);
`;

/** Crée le schéma puis applique les migrations idempotentes. */
export async function initDatabase(): Promise<void> {
  await waitForDatabase();
  await pool.query(SCHEMA);
  await pool.query(MIGRATIONS);
  // les anciens avatars emoji deviennent des identifiants d'icônes
  await pool.query(
    `UPDATE users SET avatar = 'ghost' WHERE NOT (avatar = ANY($1::text[]))`,
    [AVATARS],
  );
  console.log('  Base de données prête');
}
