import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  socket ??= io({ withCredentials: true, autoConnect: true });
  return socket;
}

export function resetSocket() {
  socket?.disconnect();
  socket = null;
}

function newActionId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${randomSuffix()}`;
}

function randomSuffix(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi) {
    const bytes = new Uint32Array(1);
    cryptoApi.getRandomValues(bytes);
    return bytes[0].toString(36);
  }
  return Date.now().toString(36);
}

/**
 * Émet avec accusé de réception ; résout l'erreur serveur éventuelle.
 *
 * Les actions de jeu embarquent un identifiant unique : le serveur s'en sert
 * pour ignorer un rejeu (double clic, reconnexion) sans appliquer deux fois
 * l'effet. Il reste seul juge de la validité de l'action.
 */
export function emitAck<T = { ok?: boolean; error?: string }>(event: string, payload?: unknown): Promise<T> {
  const withId = event.startsWith('game:')
    ? { ...(typeof payload === 'object' && payload !== null ? payload : {}), actionId: newActionId() }
    : payload;
  return new Promise((resolve) => {
    if (withId === undefined) getSocket().emit(event, (res: T) => resolve(res ?? ({} as T)));
    else getSocket().emit(event, withId, (res: T) => resolve(res ?? ({} as T)));
  });
}
