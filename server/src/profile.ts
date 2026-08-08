import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from './db.js';
import { requireAccount, requireAuth, type AuthedRequest } from './auth.js';
import { getBoard } from './maps.js';
import {
  levelFromXp, xpForLevel, PLAYER_COLORS,
  type GameEvent, type GameHistoryEntry, type IntegrityReport, type LeaderboardEntry,
  type ReplayData, type ReplayPlayer, type UserProfile,
} from 'shared';

export const profileRouter = Router();

/** Le classement est consultable par tous (invités compris). */
profileRouter.get('/leaderboard', async (req, res) => {
  const parsed = z.object({
    sort: z.enum(['global', 'wins', 'ratio', 'level', 'playtime']).default('global'),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Filtre invalide.' });
  const { sort, limit } = parsed.data;

  // seules les parties entre humains alimentent le classement
  const rows = await query<{
    id: string; username: string; avatar: string; xp: string; play_time_s: string;
    games: string; wins: string;
  }>(`
    SELECT u.id, u.username, u.avatar, u.xp, u.play_time_s,
           COUNT(gp.game_id) FILTER (WHERE g.vs_bots = FALSE) AS games,
           COUNT(gp.game_id) FILTER (WHERE g.vs_bots = FALSE AND gp.won) AS wins
    FROM users u
    LEFT JOIN game_players gp ON gp.user_id = u.id
    LEFT JOIN games g ON g.id = gp.game_id
    GROUP BY u.id, u.username, u.avatar, u.xp, u.play_time_s
  `);

  const entries = rows.map((r) => {
    const games = Number(r.games);
    const wins = Number(r.wins);
    const xp = Number(r.xp);
    const playTimeS = Number(r.play_time_s);
    const ratio = games > 0 ? wins / games : 0;
    return {
      id: r.id, username: r.username, avatar: r.avatar,
      games, wins, losses: games - wins, ratio, xp,
      level: levelFromXp(xp), playTimeS, rank: 0, score: 0,
    };
  });

  // le classement « global » mélange victoires, régularité et expérience
  const scored = entries.map((e) => ({
    ...e,
    score: sort === 'wins' ? e.wins
      : sort === 'ratio' ? (e.games >= 5 ? e.ratio : 0) // seuil anti-100 % sur 1 partie
        : sort === 'level' ? e.xp
          : sort === 'playtime' ? e.playTimeS
            : e.wins * 100 + e.ratio * 500 + e.xp * 0.1,
  }));

  // un joueur sans partie classée n'apparaît pas, sauf au classement d'XP
  const visible = scored.filter((e) => (sort === 'level' ? e.xp > 0 : e.games > 0));
  visible.sort((a, b) => b.score - a.score || b.wins - a.wins || a.games - b.games);

  const result: LeaderboardEntry[] = visible
    .slice(0, limit)
    .map((e, i) => ({ ...e, rank: i + 1 }));
  res.json(result);
});

profileRouter.use(requireAuth, requireAccount);

profileRouter.get('/me', async (req: AuthedRequest, res) => {
  const user = await queryOne<{
    id: string; username: string; avatar: string; created_at: Date;
    xp: string; play_time_s: string; win_streak: number; best_streak: number;
  }>(
    `SELECT id, username, avatar, created_at, xp, play_time_s, win_streak, best_streak
     FROM users WHERE id = $1`, [req.userId],
  );
  if (!user) return res.status(404).json({ error: 'Compte introuvable.' });

  // parties classées (entre humains) et parties bots comptées séparément
  const stats = await queryOne<{ games: string; wins: string; bot_games: string; bot_wins: string }>(`
    SELECT
      COUNT(*) FILTER (WHERE g.vs_bots = FALSE) AS games,
      COUNT(*) FILTER (WHERE g.vs_bots = FALSE AND gp.won) AS wins,
      COUNT(*) FILTER (WHERE g.vs_bots = TRUE) AS bot_games,
      COUNT(*) FILTER (WHERE g.vs_bots = TRUE AND gp.won) AS bot_wins
    FROM game_players gp JOIN games g ON g.id = gp.game_id
    WHERE gp.user_id = $1
  `, [req.userId]);

  const games = Number(stats?.games ?? 0);
  const wins = Number(stats?.wins ?? 0);
  const xp = Number(user.xp);
  const level = levelFromXp(xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);

  const profile: UserProfile = {
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    createdAt: new Date(user.created_at).toISOString(),
    games,
    wins,
    losses: games - wins,
    xp,
    level,
    levelProgress: next > floor ? (xp - floor) / (next - floor) : 0,
    xpForNextLevel: next,
    playTimeS: Number(user.play_time_s),
    winStreak: user.win_streak,
    bestStreak: user.best_streak,
    botGames: Number(stats?.bot_games ?? 0),
    botWins: Number(stats?.bot_wins ?? 0),
  };
  res.json(profile);
});

/**
 * Bande de replay d'une partie : journal d'actions + plateau + joueurs.
 * Réservée aux participants de la partie.
 */
profileRouter.get('/replay/:id', async (req: AuthedRequest, res) => {
  const parsed = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!parsed.success) return res.status(400).json({ error: 'Identifiant invalide.' });
  const gameId = parsed.data;

  const played = await queryOne(
    'SELECT 1 FROM game_players WHERE game_id = $1 AND user_id = $2', [gameId, req.userId],
  );
  if (!played) return res.status(403).json({ error: 'Vous n’avez pas participé à cette partie.' });

  const game = await queryOne<{
    id: string; board_name: string; board_id: string | null; ended_at: Date;
    duration_s: number; turns: number; winner_name: string;
    integrity: IntegrityReport | null; players_meta: ReplayPlayer[] | null;
    players_json: { name: string; avatar: string; won: boolean }[];
  }>(`SELECT id, board_name, board_id, ended_at, duration_s, turns, winner_name,
             integrity, players_meta, players_json
      FROM games WHERE id = $1`, [gameId]);
  if (!game) return res.status(404).json({ error: 'Partie introuvable.' });

  const row = await queryOne<{ events: GameEvent[] }>(
    'SELECT events FROM game_events WHERE game_id = $1', [gameId],
  );
  if (!row) return res.status(404).json({ error: 'Aucun replay enregistré pour cette partie.' });

  const board = getBoard(game.board_id ?? 'classic');
  if (!board) return res.status(410).json({ error: 'Le plateau de cette partie n’existe plus.' });

  // parties d'avant l'ajout du journal : on retombe sur les joueurs résumés
  const players: ReplayPlayer[] = game.players_meta ?? game.players_json.map((p, i) => ({
    id: String(i), name: p.name, avatar: p.avatar, color: PLAYER_COLORS[i % PLAYER_COLORS.length], isBot: false,
  }));

  const replay: ReplayData = {
    gameId: Number(game.id),
    boardName: game.board_name,
    board,
    players,
    events: row.events,
    durationS: game.duration_s,
    turns: game.turns,
    winnerName: game.winner_name,
    endedAt: new Date(game.ended_at).toISOString(),
    integrity: game.integrity,
  };
  res.json(replay);
});

profileRouter.get('/history', async (req: AuthedRequest, res) => {
  const rows = await query<{
    id: string; board_name: string; ended_at: Date; duration_s: number; turns: number;
    doubles: number; winner_name: string; most_visited: string | null; prison_king: string | null;
    net_worth_history: Record<string, number[]>; players_json: GameHistoryEntry['players'];
    my_won: boolean; vs_bots: boolean; xp_gained: number; has_replay: boolean;
  }>(`
    SELECT g.*, gp.won AS my_won, gp.xp_gained,
           EXISTS (SELECT 1 FROM game_events ge WHERE ge.game_id = g.id) AS has_replay
    FROM games g JOIN game_players gp ON gp.game_id = g.id
    WHERE gp.user_id = $1
    ORDER BY g.ended_at DESC
    LIMIT 100
  `, [req.userId]);

  const history: GameHistoryEntry[] = rows.map((r) => ({
    id: Number(r.id),
    endedAt: new Date(r.ended_at).toISOString(),
    boardName: r.board_name,
    durationS: r.duration_s,
    turns: r.turns,
    doubles: r.doubles,
    winnerName: r.winner_name,
    won: r.my_won,
    players: r.players_json,
    netWorthHistory: r.net_worth_history,
    mostVisited: r.most_visited,
    prisonKing: r.prison_king,
    vsBots: r.vs_bots,
    xpGained: r.xp_gained ?? 0,
    hasReplay: r.has_replay,
  }));
  res.json(history);
});
