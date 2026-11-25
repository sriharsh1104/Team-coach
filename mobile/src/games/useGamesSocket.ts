import { useCallback, useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { getToken } from '../storage/tokenStorage';
import {
  connectGamesSocket,
  gamesEmit,
  BootsCell,
  BootsOrientation,
  GameKind,
  RoomEvent,
  RoomView,
  RpsChoice,
  ChessPromotion,
  GameReaction,
} from '../api/games';
import { emitToast } from '../ui/toastBus';

export type GameCandidate = { userId: string; name: string; avatarUrl: string | null };
export type InviteAllResult = { sentIds: string[]; skippedIds: string[]; total: number };

export type GamesInvite = { room: RoomView; from: { userId: string; name: string } };

type Listener = {
  onRoom?: (room: RoomView, event: RoomEvent) => void;
  onRoomsChanged?: () => void;
  onInvite?: (invite: GamesInvite) => void;
};

/**
 * One shared /games socket for the whole app (module-level), so the Games
 * hub, a room screen and the invite toast all see the same connection.
 * Connected lazily on first use; torn down when the last subscriber leaves.
 */
let socket: Socket | null = null;
let connecting: Promise<Socket | null> | null = null;
const listeners = new Set<Listener>();
let latestRoom: RoomView | null = null;

function broadcastRoom(room: RoomView, event: RoomEvent) {
  latestRoom = room;
  listeners.forEach((l) => l.onRoom?.(room, event));
}

async function ensureSocket(): Promise<Socket | null> {
  if (socket) return socket;
  if (connecting) return connecting;
  connecting = (async () => {
    const token = await getToken();
    if (!token) return null;
    const s = connectGamesSocket(token);
    s.on('room:update', (payload: { room: RoomView; event: RoomEvent }) => {
      broadcastRoom(payload.room, payload.event);
    });
    s.on('rooms:changed', () => listeners.forEach((l) => l.onRoomsChanged?.()));
    s.on('room:invite', (invite: GamesInvite) => {
      listeners.forEach((l) => l.onInvite?.(invite));
    });
    s.on('connect_error', (err) => {
      console.warn('games socket connect_error:', err?.message);
    });
    socket = s;
    return s;
  })();
  const result = await connecting;
  connecting = null;
  return result;
}

function releaseSocket() {
  if (listeners.size > 0) return;
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  latestRoom = null;
}

export function useGamesSocket(listener: Listener) {
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  const [connected, setConnected] = useState<boolean>(!!socket?.connected);

  useEffect(() => {
    const proxy: Listener = {
      onRoom: (r, e) => listenerRef.current.onRoom?.(r, e),
      onRoomsChanged: () => listenerRef.current.onRoomsChanged?.(),
      onInvite: (i) => listenerRef.current.onInvite?.(i),
    };
    listeners.add(proxy);
    let cancelled = false;
    let detach: (() => void) | null = null;
    void ensureSocket().then((s) => {
      if (cancelled || !s) return;
      setConnected(s.connected);
      const onConnect = () => setConnected(true);
      const onDisconnect = () => setConnected(false);
      s.on('connect', onConnect);
      s.on('disconnect', onDisconnect);
      detach = () => {
        s.off('connect', onConnect);
        s.off('disconnect', onDisconnect);
      };
    });
    return () => {
      cancelled = true;
      detach?.();
      listeners.delete(proxy);
      // Give navigation transitions a beat before dropping the connection.
      setTimeout(releaseSocket, 1500);
    };
  }, []);

  const call = useCallback(async <T = RoomView | null>(event: string, payload?: unknown): Promise<T> => {
    const s = await ensureSocket();
    if (!s) throw new Error('You are signed out');
    if (!s.connected) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Games server not reachable')), 6000);
        s.once('connect', () => {
          clearTimeout(t);
          resolve();
        });
      });
    }
    return gamesEmit<T>(s, event, payload);
  }, []);

  return {
    connected,
    latestRoom: () => latestRoom,
    listRooms: () => call<RoomView[]>('room:list'),
    currentRoom: () => call<RoomView | null>('room:current'),
    createRoom: (game: GameKind, maxPlayers?: number, fleet?: number[]) =>
      call<RoomView>('room:create', {
        game,
        maxPlayers,
        ...(fleet ? { fleet } : {}),
      }),
    joinRoom: (roomId: string) => call<RoomView>('room:join', { roomId }),
    leaveRoom: () => call<null>('room:leave'),
    /** Watch a live Chess / Ludo match without playing in it. */
    spectateRoom: (roomId: string) => call<RoomView>('room:spectate', { roomId }),
    unspectateRoom: () => call<null>('room:unspectate'),
    startGame: (roomId: string) => call<RoomView>('room:start', { roomId }),
    rematch: (roomId: string) => call<RoomView>('room:rematch', { roomId }),
    invite: (roomId: string, userId: string) => call<null>('room:invite', { roomId, userId }),
    /** Everyone in the org/guild the caller can invite (roster + guild-only). */
    members: () => call<GameCandidate[]>('room:members'),
    /** Notify every teammate not in the room; skips anyone on the 5-min cooldown. */
    inviteAll: (roomId: string) => call<InviteAllResult>('room:invite-all', { roomId }),
    rpsPick: (roomId: string, choice: RpsChoice) =>
      call<RoomView>('rps:pick', { roomId, choice }),
    ludoRoll: (roomId: string) => call<RoomView>('ludo:roll', { roomId }),
    ludoMove: (roomId: string, tokenIndex: number) =>
      call<RoomView>('ludo:move', { roomId, tokenIndex }),
    bootsSetFleet: (roomId: string, fleet: number[]) =>
      call<RoomView>('boots:set-fleet', { roomId, fleet }),
    bootsPlace: (
      roomId: string,
      start: BootsCell | string,
      orientation: BootsOrientation,
    ) => call<RoomView>('boots:place', { roomId, start, orientation }),
    bootsPlaceRandom: (roomId: string) =>
      call<RoomView>('boots:place-random', { roomId }),
    bootsClear: (roomId: string) => call<RoomView>('boots:clear', { roomId }),
    bootsReady: (roomId: string) => call<RoomView>('boots:ready', { roomId }),
    bootsFire: (roomId: string, target: BootsCell | string, targetId?: string) =>
      call<RoomView>('boots:fire', { roomId, target, targetId }),
    react: (roomId: string, reaction: GameReaction) =>
      call<RoomView>('room:react', { roomId, reaction }),
    chessMove: (
      roomId: string,
      from: string,
      to: string,
      promotion?: ChessPromotion,
    ) => call<RoomView>('chess:move', { roomId, from, to, promotion }),
    /** Draw the shared card — the only move in Cut. */
    cutDraw: (roomId: string) => call<RoomView>('cut:draw', { roomId }),
  };
}

/** Fire-and-forget helper for screens that just want to show errors. */
export async function tryGames<T>(fn: () => Promise<T>, fallback = 'Something went wrong'): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    emitToast((err as Error)?.message || fallback);
    return null;
  }
}
