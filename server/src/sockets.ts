import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { verifySession } from './auth.js';
import { queryOne } from './db.js';
import { RoomManager } from './rooms.js';
import { getBoard } from './maps.js';
import type { GameSettings } from 'shared';

function ack(cb: unknown, error: string | null) {
  if (typeof cb === 'function') cb(error ? { error } : { ok: true });
}

const settingsSchema = z.object({
  maxPlayers: z.number().int().min(2).max(8),
  isPrivate: z.boolean(),
  allowBots: z.boolean(),
  boardId: z.string().min(1).max(64),
  startingCash: z.union([z.literal(500), z.literal(1000), z.literal(1500), z.literal(2000), z.literal(3000)]),
  dice: z.object({
    count: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    sides: z.union([z.literal(6), z.literal(10), z.literal(20)]),
  }),
  rules: z.object({
    doubleRentFullSet: z.boolean(),
    vacationCash: z.boolean(),
    auction: z.boolean(),
    noRentInPrison: z.boolean(),
    mortgage: z.boolean(),
    evenBuild: z.boolean(),
    randomizeOrder: z.boolean(),
  }),
});

const tradeSchema = z.object({
  to: z.string().max(64),
  offerCash: z.number().int().min(0).max(1000000),
  requestCash: z.number().int().min(0).max(1000000),
  offerProps: z.array(z.number().int().min(0).max(500)).max(30),
  requestProps: z.array(z.number().int().min(0).max(500)).max(30),
});

interface SessionSocket extends Socket {
  userId: string;
  username: string;
  avatar: string;
}

/**
 * Identifiant d'action fourni par le client : permet de détecter un rejeu
 * (double clic, reconnexion, requête répétée) sans jamais lui faire confiance
 * pour autre chose que cette déduplication.
 */
function extractActionId(payload: unknown): string | undefined {
  if (payload && typeof payload === 'object' && 'actionId' in payload) {
    const raw = (payload as { actionId?: unknown }).actionId;
    if (typeof raw === 'string' && raw.length > 0 && raw.length <= 64) return raw;
  }
  return undefined;
}

function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

export function setupSockets(io: Server) {
  const manager = new RoomManager(
    (roomId, event, payload) => io.to(`room:${roomId}`).emit(event, payload),
    () => io.to('lobby').emit('lobby:rooms', manager.lobbySummaries()),
  );

  io.use(async (socket, next) => {
    const token = parseCookie(socket.handshake.headers.cookie, 'monopolie_session');
    const payload = verifySession(token);
    if (!payload) return next(new Error('Non authentifié'));
    const s = socket as SessionSocket;
    if (payload.guest) {
      s.userId = payload.sub;
      s.username = payload.name ?? 'Invité';
      s.avatar = payload.avatar ?? 'ghost';
      return next();
    }
    try {
      const row = await queryOne<{ id: string; username: string; avatar: string }>(
        'SELECT id, username, avatar FROM users WHERE id = $1', [payload.sub],
      );
      if (!row) return next(new Error('Non authentifié'));
      s.userId = row.id;
      s.username = row.username;
      s.avatar = row.avatar;
      next();
    } catch (e) {
      console.error('Authentification socket :', e);
      next(new Error('Erreur serveur'));
    }
  });

  io.on('connection', (rawSocket) => {
    const socket = rawSocket as SessionSocket;
    const uid = socket.userId;

    // reconnexion à une partie en cours
    const existing = manager.findRoomOf(uid);
    if (existing) {
      socket.join(`room:${existing.id}`);
      manager.joinRoom(existing.id, uid, socket.username, socket.avatar);
      sendRoomState(existing.id);
    }

    function sendRoomState(roomId: string) {
      const room = manager.rooms.get(roomId);
      if (!room) return;
      socket.emit('room:state', manager.roomView(room));
      socket.emit('chat:history', room.chat);
      if (room.engine) {
        const view = room.engine.view();
        view.board = getBoard(room.settings.boardId) ?? undefined;
        socket.emit('game:state', view);
        socket.emit('game:logs', room.logs);
      }
    }

    socket.on('lobby:subscribe', () => {
      socket.join('lobby');
      socket.emit('lobby:rooms', manager.lobbySummaries());
    });
    socket.on('lobby:unsubscribe', () => socket.leave('lobby'));

    socket.on('room:create', (cb) => {
      const room = manager.createRoom(uid, socket.username, socket.avatar);
      socket.join(`room:${room.id}`);
      if (typeof cb === 'function') cb({ roomId: room.id });
      sendRoomState(room.id);
    });

    socket.on('room:join', (payload, cb) => {
      const roomId = z.object({ roomId: z.string().min(1).max(16) }).safeParse(payload);
      if (!roomId.success) return ack(cb, 'Requête invalide.');
      const { room, error } = manager.joinRoom(roomId.data.roomId.toLowerCase(), uid, socket.username, socket.avatar);
      if (error) return ack(cb, error);
      socket.join(`room:${room!.id}`);
      ack(cb, null);
      sendRoomState(room!.id);
      io.to(`room:${room!.id}`).emit('room:state', manager.roomView(room!));
    });

    socket.on('room:leave', () => {
      const room = manager.findRoomOf(uid);
      if (room) {
        socket.leave(`room:${room.id}`);
        manager.leaveRoom(room.id, uid);
      }
    });

    socket.on('room:settings', (payload, cb) => {
      const room = manager.findRoomOf(uid);
      if (!room) return ack(cb, 'Aucun salon.');
      const parsed = settingsSchema.safeParse(payload);
      if (!parsed.success) return ack(cb, 'Paramètres invalides.');
      ack(cb, manager.updateSettings(room.id, uid, parsed.data as GameSettings));
    });

    socket.on('room:addBot', (cb) => {
      const room = manager.findRoomOf(uid);
      if (!room) return ack(cb, 'Aucun salon.');
      ack(cb, manager.addBot(room.id, uid));
    });

    socket.on('room:kick', (payload, cb) => {
      const room = manager.findRoomOf(uid);
      if (!room) return ack(cb, 'Aucun salon.');
      const parsed = z.object({ userId: z.string().max(64) }).safeParse(payload);
      if (!parsed.success) return ack(cb, 'Requête invalide.');
      ack(cb, manager.kick(room.id, uid, parsed.data.userId));
    });

    socket.on('room:start', (cb) => {
      const room = manager.findRoomOf(uid);
      if (!room) return ack(cb, 'Aucun salon.');
      const error = manager.startGame(room.id, uid);
      if (!error) {
        const view = room.engine!.view();
        view.board = getBoard(room.settings.boardId) ?? undefined;
        io.to(`room:${room.id}`).emit('game:started', view);
      }
      ack(cb, error);
    });

    socket.on('room:reset', (cb) => {
      const room = manager.findRoomOf(uid);
      if (!room) return ack(cb, 'Aucun salon.');
      ack(cb, manager.resetRoom(room.id, uid));
    });

    socket.on('chat:send', (payload, cb) => {
      const room = manager.findRoomOf(uid);
      if (!room) return ack(cb, 'Aucun salon.');
      const parsed = z.object({ text: z.string().trim().min(1).max(300) }).safeParse(payload);
      if (!parsed.success) return ack(cb, 'Message invalide.');
      const member = room.members.find((m) => m.id === uid)!;
      const msg = manager.addChat(room, member, parsed.data.text);
      io.to(`room:${room.id}`).emit('chat:message', msg);
      ack(cb, null);
    });

    // ---- actions de jeu ----
    // Chaque requête cliente traverse le garde d'intégrité : identifiant
    // d'action unique (idempotence) puis contrôle de cadence. Un refus des
    // règles est consigné pour alimenter le score d'intégrité de la partie.
    type GameEngineRef = NonNullable<NonNullable<ReturnType<typeof manager.rooms.get>>['engine']>;

    const runGuarded = (
      cb: unknown,
      payload: unknown,
      label: string,
      fn: (engine: GameEngineRef) => string | null,
    ) => {
      const room = manager.findRoomOf(uid);
      if (!room?.engine) return ack(cb, 'Aucune partie en cours.');
      const actionId = extractActionId(payload);
      const guard = room.engine.guardAction(uid, actionId);
      if (guard) return ack(cb, guard);
      const error = fn(room.engine);
      if (error) room.engine.noteRejected(uid, `${label} : ${error}`);
      ack(cb, error);
    };

    const gameAction = (label: string, fn: (engine: GameEngineRef) => string | null) =>
      (payload: unknown, cb?: unknown) => runGuarded(cb ?? payload, payload, label, fn);

    socket.on('game:roll', gameAction('lancer', (e) => e.roll(uid)));
    socket.on('game:buy', gameAction('achat', (e) => e.buy(uid)));
    socket.on('game:skipBuy', gameAction('refus d’achat', (e) => e.skipBuy(uid)));
    socket.on('game:endTurn', gameAction('fin de tour', (e) => e.endTurn(uid)));
    socket.on('game:payBail', gameAction('caution', (e) => e.payBail(uid)));
    socket.on('game:useJailCard', gameAction('carte de sortie', (e) => e.useJailCard(uid)));
    socket.on('game:bankrupt', gameAction('faillite', (e) => e.declareBankrupt(uid)));

    socket.on('game:bid', (payload, cb) => {
      const parsed = z.object({ amount: z.number().int().min(1).max(1000000) }).safeParse(payload);
      if (!parsed.success) return ack(cb, 'Enchère invalide.');
      runGuarded(cb, payload, 'enchère', (e) => e.bid(uid, parsed.data.amount));
    });

    const tileAction = (label: string, fn: 'build' | 'sellHouse' | 'mortgage' | 'unmortgage') =>
      (payload: unknown, cb?: unknown) => {
        const parsed = z.object({ tile: z.number().int().min(0).max(500) }).safeParse(payload);
        if (!parsed.success) return ack(cb, 'Requête invalide.');
        runGuarded(cb, payload, label, (e) => e[fn](uid, parsed.data.tile));
      };

    socket.on('game:build', tileAction('construction', 'build'));
    socket.on('game:sellHouse', tileAction('vente', 'sellHouse'));
    socket.on('game:mortgage', tileAction('hypothèque', 'mortgage'));
    socket.on('game:unmortgage', tileAction('levée d’hypothèque', 'unmortgage'));

    socket.on('game:trade', (payload, cb) => {
      const parsed = tradeSchema.safeParse(payload);
      if (!parsed.success) return ack(cb, 'Échange invalide.');
      const t = parsed.data;
      runGuarded(cb, payload, 'échange', (e) =>
        e.proposeTrade(uid, t.to, t.offerCash, t.requestCash, t.offerProps, t.requestProps));
    });

    socket.on('game:tradeRespond', (payload, cb) => {
      const parsed = z.object({ tradeId: z.string().max(64), accept: z.boolean() }).safeParse(payload);
      if (!parsed.success) return ack(cb, 'Requête invalide.');
      runGuarded(cb, payload, 'réponse d’échange', (e) =>
        e.respondTrade(uid, parsed.data.tradeId, parsed.data.accept));
    });

    socket.on('disconnect', () => {
      // ne retire pas immédiatement : d'autres onglets/reconnexions possibles
      const stillConnected = [...io.sockets.sockets.values()].some(
        (s) => s.id !== socket.id && (s as SessionSocket).userId === uid,
      );
      if (!stillConnected) manager.handleDisconnect(uid);
    });
  });

  return manager;
}
