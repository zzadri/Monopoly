import crypto from 'node:crypto';
import {
  DEFAULT_SETTINGS, PLAYER_COLORS, BOT_AVATAR, winnerXp, loserXp,
  type GameSettings, type RoomSummary, type RoomView, type LogEntry, type ChatMessage,
} from 'shared';
import { GameEngine, type GameEndSummary, type PlayerInit } from './game/engine.js';
import { getBoard } from './maps.js';
import { pool } from './db.js';

export interface RoomMemberState {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isBot: boolean;
  connected: boolean;
  disconnectTimer?: ReturnType<typeof setTimeout>;
}

export interface Room {
  id: string;
  hostId: string;
  settings: GameSettings;
  members: RoomMemberState[];
  engine: GameEngine | null;
  logs: LogEntry[];
  chat: ChatMessage[];
  logSeq: number;
  chatSeq: number;
  createdAt: number;
  /** décompte avant victoire par abandon des adversaires */
  lastPlayerTimer?: ReturnType<typeof setTimeout>;
}

const BOT_NAMES = ['Ekalysia', 'Botrick', 'Cassidice', 'Monopolus', 'Fortuna', 'Krash', 'Milliardo'];

/** délai laissé aux joueurs déconnectés pour revenir avant disqualification */
const FORFEIT_MS = 120_000;

export class RoomManager {
  readonly rooms = new Map<string, Room>();

  constructor(
    private readonly emitToRoom: (roomId: string, event: string, payload: unknown) => void,
    private readonly emitLobby: () => void,
  ) {}

  createRoom(hostId: string, hostName: string, hostAvatar: string): Room {
    // un joueur = un salon à la fois
    this.leaveAll(hostId);
    const id = crypto.randomBytes(4).toString('hex').slice(0, 6);
    const room: Room = {
      id,
      hostId,
      settings: structuredClone(DEFAULT_SETTINGS),
      members: [{ id: hostId, name: hostName, avatar: hostAvatar, color: PLAYER_COLORS[0], isBot: false, connected: true }],
      engine: null,
      logs: [],
      chat: [],
      logSeq: 0,
      chatSeq: 0,
      createdAt: Date.now(),
    };
    this.rooms.set(id, room);
    this.emitLobby();
    return room;
  }

  joinRoom(roomId: string, userId: string, name: string, avatar: string): { room?: Room; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: 'Salon introuvable.' };
    const existing = room.members.find((m) => m.id === userId);
    if (existing) {
      existing.connected = true;
      if (existing.disconnectTimer) { clearTimeout(existing.disconnectTimer); existing.disconnectTimer = undefined; }
      room.engine?.setConnected(userId, true);
      // le retour d'un joueur annule le décompte de victoire par abandon
      if (room.lastPlayerTimer) {
        clearTimeout(room.lastPlayerTimer);
        room.lastPlayerTimer = undefined;
        this.emitToRoom(room.id, 'game:forfeitCountdown', { survivorId: null, endsAt: 0 });
      }
      this.broadcastRoom(room);
      return { room };
    }
    if (room.engine) return { error: 'La partie a déjà commencé.' };
    if (room.members.length >= room.settings.maxPlayers) return { error: 'Salon complet.' };
    this.leaveAll(userId);
    const color = PLAYER_COLORS.find((c) => !room.members.some((m) => m.color === c)) ?? PLAYER_COLORS[0];
    room.members.push({ id: userId, name, avatar, color, isBot: false, connected: true });
    this.broadcastRoom(room);
    this.emitLobby();
    return { room };
  }

  addBot(roomId: string, byUserId: string): string | null {
    const room = this.rooms.get(roomId);
    if (room?.hostId !== byUserId) return 'Action réservée à l’hôte.';
    if (room.engine) return 'Partie déjà commencée.';
    if (!room.settings.allowBots) return 'Les bots sont désactivés.';
    if (room.members.length >= room.settings.maxPlayers) return 'Salon complet.';
    const usedNames = new Set(room.members.map((m) => m.name));
    const name = BOT_NAMES.find((n) => !usedNames.has(n)) ?? `Bot-${room.members.length}`;
    const color = PLAYER_COLORS.find((c) => !room.members.some((m) => m.color === c)) ?? PLAYER_COLORS[0];
    room.members.push({ id: `bot-${crypto.randomUUID()}`, name, avatar: BOT_AVATAR, color, isBot: true, connected: true });
    this.broadcastRoom(room);
    this.emitLobby();
    return null;
  }

  kick(roomId: string, byUserId: string, targetId: string): string | null {
    const room = this.rooms.get(roomId);
    if (room?.hostId !== byUserId) return 'Action réservée à l’hôte.';
    if (targetId === byUserId) return 'Impossible de vous exclure vous-même.';
    if (room.engine && !targetId.startsWith('bot-')) {
      room.engine.forfeit(targetId);
    }
    room.members = room.members.filter((m) => m.id !== targetId);
    this.emitToRoom(room.id, 'room:kicked', { userId: targetId });
    this.broadcastRoom(room);
    this.emitLobby();
    return null;
  }

  updateSettings(roomId: string, byUserId: string, settings: GameSettings): string | null {
    const room = this.rooms.get(roomId);
    if (!room) return 'Salon introuvable.';
    if (room.hostId !== byUserId) return 'Seul l’hôte peut modifier les paramètres.';
    if (room.engine) return 'Partie déjà commencée.';
    if (settings.maxPlayers < room.members.length) return 'Nombre max inférieur aux joueurs présents.';
    const board = getBoard(settings.boardId);
    if (!board) return 'Plateau introuvable.';
    room.settings = settings;
    if (!settings.allowBots) {
      room.members = room.members.filter((m) => !m.isBot);
    }
    this.broadcastRoom(room);
    this.emitLobby();
    return null;
  }

  startGame(roomId: string, byUserId: string): string | null {
    const room = this.rooms.get(roomId);
    if (!room) return 'Salon introuvable.';
    if (room.hostId !== byUserId) return 'Seul l’hôte peut lancer la partie.';
    if (room.engine) return 'Partie déjà commencée.';
    if (room.members.length < 2) return 'Il faut au moins 2 joueurs.';
    const board = getBoard(room.settings.boardId);
    if (!board) return 'Plateau introuvable.';

    const inits: PlayerInit[] = room.members.map((m) => ({
      id: m.id, name: m.name, avatar: m.avatar, color: m.color, isBot: m.isBot,
    }));
    room.engine = new GameEngine(board, room.settings, inits, {
      onUpdate: () => this.emitToRoom(room.id, 'game:state', room.engine!.view()),
      onLog: (parts) => {
        const entry: LogEntry = { id: ++room.logSeq, ts: Date.now(), parts };
        room.logs.push(entry);
        if (room.logs.length > 300) room.logs.shift();
        this.emitToRoom(room.id, 'game:log', entry);
      },
      onDice: (playerId, values) => this.emitToRoom(room.id, 'game:dice', { playerId, values }),
      onCard: (playerId, deck, text) => this.emitToRoom(room.id, 'game:card', { playerId, deck, text }),
      onEnded: (summary) => this.persistGame(room, summary),
    }, room.id);
    room.engine.start();
    this.broadcastRoom(room);
    this.emitLobby();
    return null;
  }

  private persistGame(room: Room, s: GameEndSummary) {
    // l'écran de fin part tout de suite ; l'écriture en base suit sans le bloquer
    this.emitToRoom(room.id, 'game:ended', {
      summary: {
        winnerName: s.winnerName, durationS: s.durationS, turns: s.turns, doubles: s.doubles,
        mostVisited: s.mostVisited, prisonKing: s.prisonKing, netWorthHistory: s.netWorthHistory,
        players: s.players.map((p) => ({ name: p.name, avatar: p.avatar, won: p.won })),
        chatMessages: room.chat.length,
        integrity: room.engine ? room.engine.integrityReport() : null,
      },
    });

    // une partie comptant un bot reste dans l'historique personnel mais n'alimente
    // ni le ratio, ni l'XP, ni les classements
    const vsBots = s.players.some((p) => p.isBot);
    const humanOpponents = s.players.filter((p) => !p.isBot && !p.id.startsWith('guest-')).length - 1;

    // Seules les parties dont l'intégrité est confirmée alimentent XP et classements.
    const engine = room.engine;
    const integrity = engine ? engine.integrityReport() : null;
    const eligible = !vsBots && (integrity?.status ?? 'ineligible') === 'verified';
    const xpWin = eligible ? winnerXp({ humanOpponents, durationS: s.durationS, turns: s.turns }) : 0;
    const xpLose = eligible ? loserXp(xpWin) : 0;
    const journal = engine ? engine.events_journal : [];
    const playersMeta = s.players.map((p) => ({
      id: p.id, name: p.name, avatar: p.avatar, isBot: p.isBot,
      color: room.members.find((m) => m.id === p.id)?.color ?? '#8b5cf6',
    }));

    void (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query<{ id: string }>(`
          INSERT INTO games (board_name, started_at, duration_s, turns, doubles, winner_id, winner_name,
                             most_visited, prison_king, net_worth_history, players_json, vs_bots,
                             integrity, board_id, players_meta)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id
        `, [
          s.boardName, s.startedAt.toISOString(), s.durationS, s.turns, s.doubles,
          s.winnerId && !s.winnerId.startsWith('guest-') ? s.winnerId : null,
          s.winnerName, s.mostVisited, s.prisonKing,
          JSON.stringify(s.netWorthHistory),
          JSON.stringify(s.players.map((p) => ({ name: p.name, avatar: p.avatar, won: p.won }))),
          vsBots,
          integrity ? JSON.stringify(integrity) : null,
          room.settings.boardId,
          JSON.stringify(playersMeta),
        ]);
        const gameId = rows[0].id;

        // journal d'actions : preuve d'audit et bande de replay
        if (journal.length > 0) {
          await client.query(
            `INSERT INTO game_events (game_id, events) VALUES ($1, $2)
             ON CONFLICT (game_id) DO UPDATE SET events = EXCLUDED.events`,
            [gameId, JSON.stringify(journal)],
          );
        }
        for (const p of s.players) {
          // bots et invités : pas de statistiques persistées
          if (p.isBot || p.id.startsWith('guest-')) continue;
          const gained = p.won ? xpWin : xpLose;
          await client.query(
            'INSERT INTO game_players (game_id, user_id, won, xp_gained) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [gameId, p.id, p.won, gained],
          );
          // XP, temps de jeu et série : uniquement sur une partie vérifiée
          if (eligible) {
            await client.query(
              `UPDATE users SET
                 xp = xp + $2,
                 play_time_s = play_time_s + $3,
                 win_streak = CASE WHEN $4 THEN win_streak + 1 ELSE 0 END,
                 best_streak = GREATEST(best_streak, CASE WHEN $4 THEN win_streak + 1 ELSE 0 END)
               WHERE id = $1`,
              [p.id, gained, s.durationS, p.won],
            );
          }
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('Erreur de sauvegarde de partie :', e);
      } finally {
        client.release();
      }
    })();
  }

  /** Fin de partie : l'hôte peut réinitialiser le salon pour rejouer. */
  resetRoom(roomId: string, byUserId: string): string | null {
    const room = this.rooms.get(roomId);
    if (!room) return 'Salon introuvable.';
    if (room.hostId !== byUserId) return 'Action réservée à l’hôte.';
    if (room.engine && !room.engine.ended) return 'La partie est en cours.';
    room.engine?.dispose();
    room.engine = null;
    room.logs = [];
    this.broadcastRoom(room);
    this.emitLobby();
    return null;
  }

  leaveRoom(roomId: string, userId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.engine && !room.engine.ended) {
      room.engine.forfeit(userId);
    }
    room.members = room.members.filter((m) => m.id !== userId);
    if (room.members.filter((m) => !m.isBot).length === 0) {
      room.engine?.dispose();
      this.rooms.delete(roomId);
    } else if (room.hostId === userId) {
      room.hostId = room.members.find((m) => !m.isBot)!.id;
      this.broadcastRoom(room);
    } else {
      this.broadcastRoom(room);
    }
    this.emitLobby();
  }

  leaveAll(userId: string) {
    for (const room of this.rooms.values()) {
      if (room.members.some((m) => m.id === userId)) this.leaveRoom(room.id, userId);
    }
  }

  /** Déconnexion socket : marque déconnecté ; abandon auto après 90 s en partie, retrait immédiat en lobby. */
  handleDisconnect(userId: string) {
    for (const room of this.rooms.values()) {
      const m = room.members.find((x) => x.id === userId);
      if (!m) continue;
      const engine = room.engine;
      if (!engine || engine.ended) {
        this.leaveRoom(room.id, userId);
      } else {
        m.connected = false;
        engine.setConnected(userId, false);
        this.broadcastRoom(room);
        m.disconnectTimer = setTimeout(() => {
          const still = room.members.find((x) => x.id === userId);
          if (still && !still.connected) this.leaveRoom(room.id, userId);
        }, FORFEIT_MS);
      }
      this.scheduleLastPlayerWin(room);
    }
  }

  /**
   * Si un seul joueur humain reste connecté, ses adversaires ont 2 minutes pour
   * revenir. Passé ce délai ils sont disqualifiés et le dernier présent gagne
   * par abandon.
   */
  private scheduleLastPlayerWin(room: Room) {
    if (room.lastPlayerTimer) {
      clearTimeout(room.lastPlayerTimer);
      room.lastPlayerTimer = undefined;
    }
    if (!room.engine || room.engine.ended) return;

    const humans = room.members.filter((m) => !m.isBot);
    const connected = humans.filter((m) => m.connected);
    if (humans.length < 2 || connected.length !== 1) return;

    const survivor = connected[0];
    this.emitToRoom(room.id, 'game:forfeitCountdown', {
      survivorId: survivor.id,
      endsAt: Date.now() + FORFEIT_MS,
    });

    room.lastPlayerTimer = setTimeout(() => {
      room.lastPlayerTimer = undefined;
      const engine = room.engine;
      if (!engine || engine.ended) return;
      const stillAlone = room.members.filter((m) => !m.isBot && m.connected);
      if (stillAlone.length !== 1 || stillAlone[0].id !== survivor.id) return;
      // les absents abandonnent : la partie se conclut sur le dernier présent
      for (const m of room.members) {
        if (m.id !== survivor.id && !m.isBot) engine.forfeit(m.id);
      }
      this.broadcastRoom(room);
    }, FORFEIT_MS);
  }

  findRoomOf(userId: string): Room | null {
    for (const room of this.rooms.values()) {
      if (room.members.some((m) => m.id === userId)) return room;
    }
    return null;
  }

  addChat(room: Room, from: RoomMemberState, text: string): ChatMessage {
    const msg: ChatMessage = {
      id: ++room.chatSeq,
      from: { id: from.id, name: from.name, avatar: from.avatar, color: from.color },
      text,
      ts: Date.now(),
    };
    room.chat.push(msg);
    if (room.chat.length > 200) room.chat.shift();
    return msg;
  }

  private broadcastRoom(room: Room) {
    this.emitToRoom(room.id, 'room:state', this.roomView(room));
  }

  roomView(room: Room): RoomView {
    const board = getBoard(room.settings.boardId);
    return {
      id: room.id,
      hostId: room.hostId,
      settings: room.settings,
      members: room.members.map((m) => ({
        id: m.id, name: m.name, avatar: m.avatar, color: m.color,
        isHost: m.id === room.hostId, isBot: m.isBot, connected: m.connected,
      })),
      started: !!room.engine,
      boardName: board?.name ?? '?',
      boardIcon: board?.icon ?? '🗺️',
    };
  }

  lobbySummaries(): RoomSummary[] {
    return [...this.rooms.values()]
      .filter((r) => !r.settings.isPrivate)
      .map((r) => {
        const board = getBoard(r.settings.boardId);
        const host = r.members.find((m) => m.id === r.hostId);
        return {
          id: r.id,
          name: `Salon de ${host?.name ?? '?'}`,
          hostName: host?.name ?? '?',
          boardName: board?.name ?? '?',
          boardIcon: board?.icon ?? '🗺️',
          players: r.members.length,
          maxPlayers: r.settings.maxPlayers,
          started: !!r.engine,
        };
      });
  }
}
